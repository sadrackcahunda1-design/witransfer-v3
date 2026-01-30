'use client';

import { toast } from 'sonner';

export type NotificationType = 'info' | 'success' | 'warning' | 'error';
export type NotificationCategory = 'booking' | 'payment' | 'partner' | 'system';

interface NotificationOptions {
  duration?: number;
  action?: {
    label: string;
    onClick: () => void;
  };
}

/**
 * Mensagens pré-definidas para notificações
 * Padroniza mensagens em toda a aplicação
 */
export const NOTIFICATION_MESSAGES = {
  BOOKING_CREATED: 'Reserva criada com sucesso! Aguardando confirmação...',
  BOOKING_CONFIRMED: 'Reserva confirmada! Seu motorista está a caminho.',
  BOOKING_CANCELLED: 'Reserva cancelada. Reembolso será processado em 3-5 dias.',
  BOOKING_COMPLETED: 'Reserva completada! Obrigado por usar WiTransfer.',
  BOOKING_EXPIRED: 'Reserva expirou. Tente fazer uma nova pesquisa.',
  BOOKING_REASSIGNED: 'Sua reserva foi realocada para um novo parceiro.',
  BOOKING_IN_WAITLIST: 'Sua reserva está na fila de espera. Você será notificado quando houver disponibilidade.',
  
  PARTNER_ACCEPTED: 'Reserva aceita!',
  PARTNER_REJECTED: 'Reserva rejeitada.',
  PARTNER_STARTED: 'Serviço iniciado.',
  PARTNER_COMPLETED: 'Serviço completado.',
  
  PAYMENT_SUCCESS: 'Pagamento processado com sucesso!',
  PAYMENT_FAILED: 'Falha no processamento do pagamento. Tente novamente.',
  
  ERROR_NETWORK: 'Erro de conexão. Verifique sua internet.',
  ERROR_SERVER: 'Erro do servidor. Tente novamente mais tarde.',
  ERROR_VALIDATION: 'Dados inválidos. Verifique o formulário.',
};

class NotificationService {
  /**
   * Notifica cliente sobre atualização de booking
   */
  notifyClientBookingUpdate(
    oldStatus: string,
    newStatus: string,
    options?: NotificationOptions
  ) {
    const messages: Record<string, { type: NotificationType; message: string }> = {
      'pending_assignment': { type: 'info', message: NOTIFICATION_MESSAGES.BOOKING_CREATED },
      'assigned': { type: 'success', message: NOTIFICATION_MESSAGES.BOOKING_CONFIRMED },
      'confirmed': { type: 'success', message: NOTIFICATION_MESSAGES.BOOKING_CONFIRMED },
      'in_progress': { type: 'info', message: 'Serviço em progresso...' },
      'completed': { type: 'success', message: NOTIFICATION_MESSAGES.BOOKING_COMPLETED },
      'canceled': { type: 'warning', message: NOTIFICATION_MESSAGES.BOOKING_CANCELLED },
      'waiting_for_resources': { type: 'info', message: NOTIFICATION_MESSAGES.BOOKING_IN_WAITLIST },
    };

    const notification = messages[newStatus];
    if (notification) {
      this.notify(notification.type, notification.message, options);
    }
  }

  /**
   * Notifica parceiro sobre novo booking
   */
  notifyPartnerNewBooking(options?: NotificationOptions) {
    this.notify('info', 'Novo booking recebido! Confirme em até 30 minutos.', {
      duration: 10000,
      ...options,
    });
  }

  /**
   * Notifica parceiro sobre booking expirando
   */
  notifyPartnerBookingExpiring(minutesLeft: number, options?: NotificationOptions) {
    this.notify('warning', 
      `Booking expira em ${minutesLeft} minuto(s). Confirme ou rejeite agora!`,
      { duration: 15000, ...options }
    );
  }

  /**
   * Notifica sobre erro de rede
   */
  notifyNetworkError(options?: NotificationOptions) {
    this.notify('error', NOTIFICATION_MESSAGES.ERROR_NETWORK, {
      duration: 5000,
      ...options,
    });
  }

  /**
   * Notifica sobre erro do servidor
   */
  notifyServerError(customMessage?: string, options?: NotificationOptions) {
    this.notify('error', 
      customMessage || NOTIFICATION_MESSAGES.ERROR_SERVER,
      { duration: 5000, ...options }
    );
  }

  /**
   * Notifica sucesso genérico
   */
  notifySuccess(message: string, options?: NotificationOptions) {
    this.notify('success', message, options);
  }

  /**
   * Notifica erro genérico
   */
  notifyError(message: string, options?: NotificationOptions) {
    this.notify('error', message, options);
  }

  /**
   * Notificação base
   */
  private notify(
    type: NotificationType,
    message: string,
    options?: NotificationOptions
  ) {
    const toastOptions = {
      duration: options?.duration || 3000,
      action: options?.action,
    };

    switch (type) {
      case 'success':
        toast.success(message, toastOptions);
        break;
      case 'error':
        toast.error(message, toastOptions);
        break;
      case 'warning':
        toast.warning(message, toastOptions);
        break;
      case 'info':
      default:
        toast.info(message, toastOptions);
    }
  }
}

export const notificationService = new NotificationService();
