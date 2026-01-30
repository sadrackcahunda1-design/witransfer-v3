/**
 * Máquina de Estados para Bookings do WiTransfer
 * Define transições válidas e regras de negócio por estado
 */

export type BookingStatus =
  | "pending_assignment" // Recém criado, aguardando atribuição
  | "assigned" // Veículo e motorista atribuídos (mesmo parceiro)
  | "pending_partner_acceptance" // Atribuído a novo parceiro, aguardando aceitar
  | "partner_accepted" // Parceiro aceitou a realocação
  | "waiting_for_resources" // Sem recursos disponíveis, em fila
  | "confirmed" // Confirmado pelo cliente
  | "in_progress" // Em andamento
  | "completed" // Concluído
  | "cancelled" // Cancelado
  | "allocation_failed"; // Expirou em fila sem conseguir alocar

/**
 * Transições válidas entre estados
 * Formato: FROM -> [TO1, TO2, ...]
 */
export const BOOKING_STATE_TRANSITIONS: Record<BookingStatus, BookingStatus[]> = {
  // Estado inicial
  pending_assignment: [
    "assigned", // Encontrou recursos no mesmo parceiro
    "pending_partner_acceptance", // Encontrou em outro parceiro
    "waiting_for_resources", // Sem recursos, vai para fila
  ],

  // Atribuído
  assigned: [
    "partner_accepted", // Parceiro aceitou
    "confirmed", // Cliente confirmou (fluxo rápido)
    "waiting_for_resources", // Parceiro cancelou, volta para fila
    "cancelled", // Cliente cancelou antes de começar
  ],

  // Pendente aceitação
  pending_partner_acceptance: [
    "partner_accepted", // Novo parceiro aceitou
    "waiting_for_resources", // Novo parceiro recusou, volta para fila
    "cancelled", // Cliente cancelou
  ],

  // Aceito pelo novo parceiro
  partner_accepted: [
    "confirmed", // Cliente confirmou
    "cancelled", // Cliente cancelou
    "waiting_for_resources", // Problema, volta para fila
  ],

  // Em fila
  waiting_for_resources: [
    "assigned", // Realocado no mesmo parceiro
    "pending_partner_acceptance", // Realocado em novo parceiro
    "allocation_failed", // Expirou (24h de espera)
    "cancelled", // Cliente cancelou
  ],

  // Confirmado
  confirmed: [
    "in_progress", // Começou a viagem
    "cancelled", // Cliente cancelou até última hora
  ],

  // Em andamento
  in_progress: [
    "completed", // Viagem concluída
    "cancelled", // ERRO: Cancelamento durante viagem (raro)
  ],

  // Terminal - Sem transições
  completed: [],
  cancelled: [],
  allocation_failed: [],
};

/**
 * Validar se transição é permitida
 */
export function isValidTransition(from: BookingStatus, to: BookingStatus): boolean {
  const validTransitions = BOOKING_STATE_TRANSITIONS[from];
  return validTransitions ? validTransitions.includes(to) : false;
}

/**
 * Regras de negócio por estado
 */
export interface BookingStateRules {
  canBeCancelled: boolean;
  canBeReallocated: boolean;
  canNotifyPartner: boolean;
  canNotifyClient: boolean;
  autoExpireAfterHours?: number;
  requiresClientConfirmation: boolean;
}

export const BOOKING_STATE_RULES: Record<BookingStatus, BookingStateRules> = {
  pending_assignment: {
    canBeCancelled: true,
    canBeReallocated: false,
    canNotifyPartner: false,
    canNotifyClient: true,
    autoExpireAfterHours: 24,
    requiresClientConfirmation: false,
  },

  assigned: {
    canBeCancelled: true,
    canBeReallocated: false,
    canNotifyPartner: true,
    canNotifyClient: true,
    requiresClientConfirmation: true,
  },

  pending_partner_acceptance: {
    canBeCancelled: true,
    canBeReallocated: false,
    canNotifyPartner: true,
    canNotifyClient: false,
    autoExpireAfterHours: 12, // Parceiro tem 12h para aceitar
    requiresClientConfirmation: false,
  },

  partner_accepted: {
    canBeCancelled: true,
    canBeReallocated: false,
    canNotifyPartner: false,
    canNotifyClient: true,
    requiresClientConfirmation: true,
  },

  waiting_for_resources: {
    canBeCancelled: true,
    canBeReallocated: true,
    canNotifyPartner: false,
    canNotifyClient: false,
    autoExpireAfterHours: 24,
    requiresClientConfirmation: false,
  },

  confirmed: {
    canBeCancelled: true,
    canBeReallocated: false,
    canNotifyPartner: true,
    canNotifyClient: true,
    requiresClientConfirmation: false,
  },

  in_progress: {
    canBeCancelled: false, // Não pode cancelar durante viagem
    canBeReallocated: false,
    canNotifyPartner: false,
    canNotifyClient: false,
    requiresClientConfirmation: false,
  },

  completed: {
    canBeCancelled: false,
    canBeReallocated: false,
    canNotifyPartner: false,
    canNotifyClient: false,
    requiresClientConfirmation: false,
  },

  cancelled: {
    canBeCancelled: false,
    canBeReallocated: false,
    canNotifyPartner: false,
    canNotifyClient: false,
    requiresClientConfirmation: false,
  },

  allocation_failed: {
    canBeCancelled: true, // Cliente pode tentar nova reserva
    canBeReallocated: false,
    canNotifyPartner: false,
    canNotifyClient: true,
    requiresClientConfirmation: false,
  },
};

/**
 * Cancelamento deve lidar com:
 * 1. Liberar veículo
 * 2. Liberar motorista
 * 3. Remover de fila se estava
 * 4. Notificar parceiro e cliente
 * 5. Registar razão de cancelamento
 */
export interface CancellationReason {
  reason: "client_requested" | "partner_cancelled" | "no_resources" | "expired" | "system_error";
  note?: string;
  cancelledBy: "client" | "partner" | "system";
  cancelledAt: Date;
}

/**
 * Workflow de cancelamento
 */
export async function workflowCancelBooking(
  bookingId: string,
  reason: CancellationReason
) {
  // 1. Validar estado atual
  // 2. Liberar recursos (veículo, motorista)
  // 3. Remover de fila de espera se aplicável
  // 4. Marcar como cancelled
  // 5. Notificar stakeholders
  // 6. Registar auditoria

  console.log(`[BookingCancel] Cancelando booking ${bookingId}: ${reason.reason}`);

  // Implementado em actions/private/bookings/actions.ts
}

/**
 * Workflow de realocação
 */
export async function workflowReassignBooking(
  bookingId: string,
  newVehicleId?: string,
  newDriverId?: string,
  newPartnerId?: string
) {
  // 1. Validar que booking está em estado realocável
  // 2. Validar que veículo/motorista estão disponíveis
  // 3. Atualizar booking
  // 4. Notificar novo parceiro
  // 5. Manter histórico de realocações

  console.log(`[BookingReassign] Realocando booking ${bookingId}`);

  // Implementado em app/api/admin/listing-bookings/route.ts
}
