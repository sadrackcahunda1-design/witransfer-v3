"use server";

import { revalidatePath } from "next/cache";
import { createPublicAction } from "@/middlewares/actions/action-factory";
import type { Booking, ActionResult } from "@/types";

/**
 * Server Action para criar reserva
 * Envolve a API POST /api/bookings
 * Com tratamento de erro robusto e logging
 */
export async function createBooking(
  data: Partial<Booking> & { email?: string; firstName?: string; lastName?: string; phone?: string }
): Promise<ActionResult> {
  return createPublicAction(
    "CreateBooking",
    async (bookingData) => {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000";
      
      console.log("[Action] Criando booking via API:", apiUrl);

      const response = await fetch(`${apiUrl}/api/bookings`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(bookingData),
      });

      // Parsear resposta
      const result: ActionResult = await response.json();

      // Validar response - pode ser erro mas com status 200
      if (!response.ok || !result.success) {
        const errorMsg = result.error || "Erro ao criar reserva";
        console.error("[Action] Erro na resposta:", errorMsg);
        throw new Error(errorMsg);
      }

      // Revalidar cache
      revalidatePath("/admin/bookings");
      revalidatePath("/bookings");

      console.log("[Action] Reserva criada com sucesso");

      return {
        success: true,
        message: result.message || "Reserva criada com sucesso!",
        data: result.data,
      };
    },
    data,
    { delay: 500 } // Delay mínimo para feedback visual
  );
}
