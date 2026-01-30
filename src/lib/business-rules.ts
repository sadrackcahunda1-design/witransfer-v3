/**
 * Regras de Negócio do WiTransfer
 * Fundamentação e validações de todas as operações
 */

// ============================================
// 1. REGRAS DE PREÇO E TARIFAÇÃO
// ============================================

export interface PricingRules {
  basePricePerKm: number; // Preço base por km
  basePricePerHour: number; // Preço base por hora
  minimalPrice: number; // Preço mínimo por corrida
  premiumMultiplier: number; // Multiplicador para veículos premium
  luxuryMultiplier: number; // Multiplicador para veículos luxury
  peakHourMultiplier: number; // Multiplicador em horas de pico
  discountPercentageForLongTrips: number; // Desconto em % para viagens longas (>200km)
}

export const PRICING_RULES: PricingRules = {
  basePricePerKm: 0.5, // 0,50€ por km
  basePricePerHour: 15, // 15€ por hora
  minimalPrice: 10, // Mínimo 10€
  premiumMultiplier: 1.3, // 30% mais caro
  luxuryMultiplier: 1.6, // 60% mais caro
  peakHourMultiplier: 1.2, // 20% mais caro em pico
  discountPercentageForLongTrips: 10, // 10% desconto em viagens >200km
};

// ============================================
// 2. REGRAS DE DISPONIBILIDADE
// ============================================

export interface AvailabilityRules {
  minLeadTimeMinutes: number; // Tempo mínimo antes de poder pedir
  maxLeadTimeDays: number; // Máximo dias para agendar
  operatingHoursStart: number; // Hora de abertura (0-23)
  operatingHoursEnd: number; // Hora de encerramento (0-23)
  peakHoursStart: number;
  peakHoursEnd: number;
  vehicleCheckInTimeMinutes: number; // Tempo para check-in antes da viagem
}

export const AVAILABILITY_RULES: AvailabilityRules = {
  minLeadTimeMinutes: 30, // Mínimo 30 min antes
  maxLeadTimeDays: 180, // Máximo 6 meses
  operatingHoursStart: 6, // Abre às 6h
  operatingHoursEnd: 23, // Fecha às 23h
  peakHoursStart: 7, // Pico das 7h
  peakHoursEnd: 10, // até 10h (manhã) e 16-19 (tarde)
  vehicleCheckInTimeMinutes: 15, // 15 min antes
};

// ============================================
// 3. REGRAS DE CANCELAMENTO
// ============================================

export interface CancellationRules {
  freeRefundUntilHoursBefore: number; // Reembolso grátis até X horas antes
  partialRefundUntilHoursBefore: number; // 50% reembolso até X horas antes
  noRefundAfter: number; // Sem reembolso depois
  partialRefundPercentage: number; // % do reembolso parcial
}

export const CANCELLATION_RULES: CancellationRules = {
  freeRefundUntilHoursBefore: 24, // Reembolso grátis até 24h antes
  partialRefundUntilHoursBefore: 12, // 50% até 12h antes
  noRefundAfter: 6, // Sem reembolso menos de 6h antes
  partialRefundPercentage: 50, // 50% de volta
};

// ============================================
// 4. REGRAS DE QUALIDADE
// ============================================

export interface QualityRules {
  maxVehicleAgeDays: number; // Veículos até X anos
  minClientRating: number; // Rating mínimo para clientes
  minPartnerRating: number; // Rating mínimo para parceiros
  maxBookingsInProgress: number; // Max bookings simultâneos
}

export const QUALITY_RULES: QualityRules = {
  maxVehicleAgeDays: 365 * 5, // Veículos até 5 anos
  minClientRating: 3.0, // Rating mínimo 3.0
  minPartnerRating: 3.5, // Rating mínimo 3.5 para parceiros
  maxBookingsInProgress: 10, // Máximo 10 simultâneos por motorista
};

// ============================================
// 5. REGRAS DE REALOCAÇÃO
// ============================================

export interface ReallocationRules {
  maxReassignmentsPerBooking: number; // Máximo de realocações
  reallocationTimeoutMinutes: number; // Tempo para tentar realocação
  samePartnerPreference: boolean; // Preferir mesmo parceiro
  distanceThresholdKm: number; // Distância máxima para considerar
}

export const REALLOCATION_RULES: ReallocationRules = {
  maxReassignmentsPerBooking: 3, // Máximo 3 realocações
  reallocationTimeoutMinutes: 15, // Tentar durante 15 min
  samePartnerPreference: true, // Preferir mesmo parceiro
  distanceThresholdKm: 50, // Máximo 50km para realocação
};

// ============================================
// 6. VALIDAÇÕES
// ============================================

/**
 * Validar se cliente pode fazer novo booking
 */
export function validateClientCanBook(clientData: {
  rating: number;
  totalBookings: number;
  cancelledBookings: number;
  isVerified: boolean;
}): { valid: boolean; reason?: string } {
  if (!clientData.isVerified) {
    return { valid: false, reason: "Cliente não verificado" };
  }

  if (clientData.rating < QUALITY_RULES.minClientRating) {
    return { valid: false, reason: `Rating insuficiente (${clientData.rating}/${QUALITY_RULES.minClientRating})` };
  }

  const cancellationRate = clientData.cancelledBookings / clientData.totalBookings;
  if (cancellationRate > 0.3) {
    // Mais de 30% de cancelamentos
    return { valid: false, reason: "Taxa de cancelamento alta" };
  }

  return { valid: true };
}

/**
 * Validar se parceiro pode aceitar booking
 */
export function validatePartnerCanAccept(partnerData: {
  rating: number;
  currentBookings: number;
  isVerified: boolean;
  isActive: boolean;
}): { valid: boolean; reason?: string } {
  if (!partnerData.isVerified) {
    return { valid: false, reason: "Parceiro não verificado" };
  }

  if (!partnerData.isActive) {
    return { valid: false, reason: "Parceiro inativo" };
  }

  if (partnerData.rating < QUALITY_RULES.minPartnerRating) {
    return { valid: false, reason: `Rating insuficiente (${partnerData.rating}/${QUALITY_RULES.minPartnerRating})` };
  }

  return { valid: true };
}

/**
 * Calcular reembolso baseado em regras
 */
export function calculateRefund(
  totalPrice: number,
  hoursBeforeBooking: number
): { refundAmount: number; refundPercentage: number; reason: string } {
  if (hoursBeforeBooking >= CANCELLATION_RULES.freeRefundUntilHoursBefore) {
    return {
      refundAmount: totalPrice,
      refundPercentage: 100,
      reason: "Reembolso total - cancelamento com antecedência",
    };
  }

  if (hoursBeforeBooking >= CANCELLATION_RULES.partialRefundUntilHoursBefore) {
    const refundAmount = (totalPrice * CANCELLATION_RULES.partialRefundPercentage) / 100;
    return {
      refundAmount,
      refundPercentage: CANCELLATION_RULES.partialRefundPercentage,
      reason: `Reembolso parcial (${CANCELLATION_RULES.partialRefundPercentage}%)`,
    };
  }

  return {
    refundAmount: 0,
    refundPercentage: 0,
    reason: "Sem reembolso - cancelamento < de 6h antes",
  };
}

/**
 * Validar booking pode ser feito nesta data/hora
 */
export function validateBookingDateTime(startDate: Date): { valid: boolean; reason?: string } {
  const now = new Date();
  const minutesUntilBooking = (startDate.getTime() - now.getTime()) / (1000 * 60);
  const daysDiff = (startDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);

  if (minutesUntilBooking < AVAILABILITY_RULES.minLeadTimeMinutes) {
    return { valid: false, reason: `Mínimo ${AVAILABILITY_RULES.minLeadTimeMinutes} minutos de antecedência` };
  }

  if (daysDiff > AVAILABILITY_RULES.maxLeadTimeDays) {
    return { valid: false, reason: `Máximo ${AVAILABILITY_RULES.maxLeadTimeDays} dias de antecedência` };
  }

  const hour = startDate.getHours();
  if (hour < AVAILABILITY_RULES.operatingHoursStart || hour >= AVAILABILITY_RULES.operatingHoursEnd) {
    return {
      valid: false,
      reason: `Fora do horário (${AVAILABILITY_RULES.operatingHoursStart}h-${AVAILABILITY_RULES.operatingHoursEnd}h)`,
    };
  }

  return { valid: true };
}
