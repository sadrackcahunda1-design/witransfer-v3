import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { sendEmail } from "@/lib/mail";
import type { ActionResult } from "@/types";

/**
 * Processa lista de espera de bookings
 * Tenta realizar reatribuição automática de bookings em espera
 * Endpoint: POST /api/admin/process-waitlist
 */
export async function POST(request: Request): Promise<NextResponse<ActionResult>> {
  try {
    console.log("[WAITLIST_PROCESSOR] Iniciando processamento de fila de espera...");

    // 1. Buscar todas as entradas de waitlist ATIVAS e NÃO EXPIRADAS
    const { data: waitlistEntries, error: fetchError } = await supabaseAdmin
      .from("booking_waitlist")
      .select(`
        *,
        booking:bookings(
          id,
          service_type,
          partner_id,
          client:users!client_id(id, email, full_name),
          current_vehicle:vehicles!booking_waitlist_original_vehicle_id(id, partner_id),
          current_driver:users!booking_waitlist_original_driver_id(id)
        )
      `)
      .eq("status", "waiting")
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: true }); // FIFO com prioridade

    if (fetchError) {
      throw new Error(`Erro ao buscar waitlist: ${fetchError.message}`);
    }

    if (!waitlistEntries || waitlistEntries.length === 0) {
      return NextResponse.json({
        success: true,
        message: "Nenhuma entrada de espera para processar",
        data: { processedCount: 0, reassignedCount: 0, expiredCount: 0 }
      });
    }

    console.log(`[WAITLIST_PROCESSOR] Encontradas ${waitlistEntries.length} entradas de espera`);

    let processedCount = 0;
    let reassignedCount = 0;
    let expiredCount = 0;

    // 2. Processar CADA entrada de waitlist
    for (const entry of waitlistEntries) {
      processedCount++;

      try {
        // Validar que booking ainda existe
        if (!entry.booking || !entry.booking.id) {
          console.warn(`[WAITLIST_PROCESSOR] Booking ${entry.booking_id} não encontrado. Removendo waitlist.`);
          await supabaseAdmin
            .from("booking_waitlist")
            .delete()
            .eq("id", entry.id);
          continue;
        }

        const booking = entry.booking;

        // 3. Buscar veículos disponíveis compatíveis
        let vehicleQuery = supabaseAdmin
          .from("vehicles")
          .select("*")
          .eq("status", "active");

        // Filtrar por tipo de serviço
        if (booking.service_type === 'rental') {
          vehicleQuery = vehicleQuery.in("available_for", ["rental", "both"]);
        } else if (booking.service_type === 'transfer') {
          vehicleQuery = vehicleQuery.in("available_for", ["transfer", "both"]);
        }

        const { data: availableVehicles } = await vehicleQuery.limit(3);
        const altVehicle = availableVehicles?.[0];

        // 4. Buscar motorista disponível
        const { data: availableDrivers } = await supabaseAdmin
          .from("users")
          .select("*")
          .eq("role", "DRIVER")
          .eq("is_active", true)
          .limit(3);

        const altDriver = availableDrivers?.[0];

        // 5. Se AMBOS encontrados, realizar reatribuição
        if (altVehicle && altDriver) {
          console.log(`[WAITLIST_PROCESSOR] ✅ Realocando booking ${booking.id} (veículo: ${altVehicle.id}, motorista: ${altDriver.id})`);

          // Atualizar booking
          const { error: updateError } = await supabaseAdmin
            .from("bookings")
            .update({
              vehicle_id: altVehicle.id,
              driver_id: altDriver.id,
              partner_id: altVehicle.partner_id,
              status: "assigned",
              updated_at: new Date().toISOString(),
              reassignments_count: (booking.reassignments_count || 0) + 1
            })
            .eq("id", booking.id);

          if (!updateError) {
            // Marcar waitlist como reassignado
            await supabaseAdmin
              .from("booking_waitlist")
              .update({
                status: "reassigned",
                reassigned_at: new Date().toISOString()
              })
              .eq("id", entry.id);

            reassignedCount++;

            // Notificar cliente
            if (booking.client?.email) {
              try {
                await sendEmail({
                  to: booking.client.email,
                  subject: `[WiTransfer] Sua reserva foi realocada com sucesso! (Reserva #${booking.id.slice(0, 8)})`,
                  template: "booking_reassignment",
                  templateData: {
                    customerName: booking.client.full_name,
                    bookingId: booking.id,
                    vehicleInfo: altVehicle,
                    driverInfo: altDriver
                  }
                });
                console.log(`[WAITLIST_PROCESSOR] Email enviado para ${booking.client.email}`);
              } catch (emailError) {
                console.warn(`[WAITLIST_PROCESSOR] Falha ao enviar email para ${booking.client.email}:`, emailError);
              }
            }
          }
        } else {
          console.log(`[WAITLIST_PROCESSOR] ⏳ Sem recursos compatíveis para ${booking.id}. Permanecerá em espera.`);
        }
      } catch (entryError) {
        console.error(`[WAITLIST_PROCESSOR] Erro ao processar entrada ${entry.id}:`, entryError);
      }
    }

    // 6. Limpar entradas expiradas
    const { data: expiredEntries, error: expiredError } = await supabaseAdmin
      .from("booking_waitlist")
      .select("*")
      .eq("status", "waiting")
      .lt("expires_at", new Date().toISOString());

    if (!expiredError && expiredEntries && expiredEntries.length > 0) {
      expiredCount = expiredEntries.length;

      // Marcar booking como "allocation_failed" (expirado)
      for (const entry of expiredEntries) {
        await supabaseAdmin
          .from("bookings")
          .update({
            status: "allocation_failed",
            updated_at: new Date().toISOString()
          })
          .eq("id", entry.booking_id);

        await supabaseAdmin
          .from("booking_waitlist")
          .delete()
          .eq("id", entry.id);
      }

      console.log(`[WAITLIST_PROCESSOR] ${expiredCount} entradas expiradas removidas`);
    }

    return NextResponse.json({
      success: true,
      message: `Waitlist processada com sucesso: ${reassignedCount} realocadas, ${expiredCount} expiradas`,
      data: {
        processedCount,
        reassignedCount,
        expiredCount
      }
    });
  } catch (error: any) {
    console.error("[WAITLIST_PROCESSOR] Erro crítico:", error);

    return NextResponse.json(
      {
        success: false,
        error: error?.message || "Erro ao processar waitlist",
        errorCode: "WAITLIST_PROCESSING_FAILED"
      },
      { status: 500 }
    );
  }
}
