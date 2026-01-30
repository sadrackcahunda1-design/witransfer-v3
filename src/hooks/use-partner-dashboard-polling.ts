'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { getBookingsAction } from '@/actions/private/bookings/actions';
import { notificationService } from '@/lib/notification-service';

interface UsePartnerDashboardPollingOptions {
  interval?: number;
  onBookingsUpdate?: (bookings: any[]) => void;
  onNewBooking?: (booking: any) => void;
  enabled?: boolean;
}

/**
 * Hook para fazer polling automático do Dashboard do Parceiro
 * Detecta novos bookings e atualiza lista em tempo real
 */
export function usePartnerDashboardPolling({
  interval = 10000, // 10 segundos para não sobrecarregar
  onBookingsUpdate,
  onNewBooking,
  enabled = true
}: UsePartnerDashboardPollingOptions) {
  const pollerRef = useRef<NodeJS.Timeout>();
  const [bookings, setBookings] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const lastBookingCountRef = useRef<number>(0);

  const poll = useCallback(async () => {
    if (isLoading) return; // Evitar múltiplos polls simultâneos

    setIsLoading(true);
    try {
      const result = await getBookingsAction(undefined, 1, 100);
      
      if (result.success && Array.isArray(result.data)) {
        const newBookings = result.data;
        setBookings(newBookings);
        onBookingsUpdate?.(newBookings);

        // Detectar novos bookings
        const newCount = newBookings.filter((b: any) => b.status === 'pending_assignment').length;
        const oldCount = lastBookingCountRef.current;

        if (newCount > oldCount) {
          // Há novos bookings!
          const newBooking = newBookings.find((b: any) => b.status === 'pending_assignment');
          onNewBooking?.(newBooking);
          notificationService.notifyPartnerNewBooking({
            duration: 10000,
            action: {
              label: 'Ver agora',
              onClick: () => {
                window.location.href = `/partners/operations/bookings/${newBooking?.id}`;
              }
            }
          });
        }

        lastBookingCountRef.current = newCount;
      }
    } catch (error) {
      console.warn('[Partner Polling] Erro ao buscar bookings:', error);
      // Não mostrar toast de erro a cada poll, apenas warning no console
    } finally {
      setIsLoading(false);
    }
  }, [isLoading, onBookingsUpdate, onNewBooking]);

  useEffect(() => {
    if (!enabled) {
      if (pollerRef.current) clearInterval(pollerRef.current);
      return;
    }

    // Poll imediatamente na montagem
    poll();

    // Depois a cada interval
    pollerRef.current = setInterval(poll, interval);

    return () => {
      if (pollerRef.current) clearInterval(pollerRef.current);
    };
  }, [poll, enabled, interval]);

  // Cleanup ao desmontar
  useEffect(() => {
    return () => {
      if (pollerRef.current) clearInterval(pollerRef.current);
    };
  }, []);

  return { bookings, isLoading };
}
