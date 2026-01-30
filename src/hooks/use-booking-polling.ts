'use client';

import { useCallback, useEffect, useRef } from 'react';
import { getBookingDetailsAction } from '@/actions/private/bookings/actions';

interface UseBookingPollingOptions {
  bookingId: string;
  interval?: number;
  onUpdate?: (booking: any) => void;
  onStatusChange?: (newStatus: string, oldStatus: string) => void;
  enabled?: boolean;
}

/**
 * Hook para fazer polling automático de atualização de booking
 * Garante que cliente/parceiro sempre vê status atualizado
 */
export function useBookingPolling({
  bookingId,
  interval = 5000,
  onUpdate,
  onStatusChange,
  enabled = true
}: UseBookingPollingOptions) {
  const pollerRef = useRef<NodeJS.Timeout>();
  const lastStatusRef = useRef<string | null>(null);

  const poll = useCallback(async () => {
    try {
      const result = await getBookingDetailsAction(bookingId);
      
      if (result.success && result.data) {
        // Detectar mudança de status
        if (lastStatusRef.current && lastStatusRef.current !== result.data.status) {
          onStatusChange?.(result.data.status, lastStatusRef.current);
        }
        
        lastStatusRef.current = result.data.status;
        onUpdate?.(result.data);
      }
    } catch (error) {
      console.warn('[Polling] Erro ao buscar booking:', error);
    }
  }, [bookingId, onUpdate, onStatusChange]);

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
}
