import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import type { Booking, User, ActionResult } from "@/types";

/**
 * POST /api/bookings
 * Criar uma nova reserva
 * Suporta criação automática de usuário se não existir
 */
export async function POST(request: Request): Promise<NextResponse<ActionResult>> {
  try {
    const body: Partial<Booking> & { 
      firstName?: string
      lastName?: string
      phone?: string
      email?: string
      customer?: any
    } = await request.json();

    // Extrair dados do cliente - suportar múltiplos formatos
    const customer = body.customer || { email: "", name: "", phone: "" };
    const customerEmail = (customer as any).email || body.email;
    const email = customerEmail?.toLowerCase()?.trim();

    // Extrair nome
    const firstName = body.firstName || (customer as any).firstName || (customer.name ? customer.name.split(" ")[0] : "");
    const lastName = body.lastName || (customer as any).lastName || (customer.name ? customer.name.split(" ").slice(1).join(" ") : "");
    const phone = body.phone || customer.phone;

    // Validar email
    if (!email || !email.includes("@")) {
      return NextResponse.json(
        { 
          success: false, 
          error: "Email válido é obrigatório",
          errorCode: "INVALID_EMAIL"
        },
        { status: 400 }
      );
    }

    // Preparar dados da reserva
    const bookingData = { ...body };
    delete (bookingData as any).customer;
    delete (bookingData as any).firstName;
    delete (bookingData as any).lastName;
    delete (bookingData as any).phone;

    console.log("[API] Criando reserva para:", email);

    // 1. Verificar se usuário existe
    const { data: user } = await supabase
      .from("users")
      .select("*")
      .eq("email", email)
      .single();

    let currentUser = user;
    let userCreated = false;

    // 2. Criar usuário se não existir
    if (!user) {
      const { data: newUser, error: createError } = await supabase
        .from("users")
        .insert([{
          email,
          first_name: firstName || "Cliente",
          last_name: lastName || "",
          phone: phone || null,
          created_at: new Date().toISOString(),
        }])
        .select()
        .single();

      if (createError) {
        console.error("[API] Erro ao criar usuário:", createError);
        throw new Error(`Erro ao criar usuário: ${createError.message}`);
      }

      currentUser = newUser;
      userCreated = true;
      console.log("[API] Novo usuário criado:", newUser.id);
    }

    // 3. Criar reserva
    const { data: newBooking, error: bookingError } = await supabase
      .from("bookings")
      .insert([{
        user_id: currentUser.id,
        ...bookingData,
        customer_email: email,
        customer_name: `${firstName || "Cliente"} ${lastName || ""}`.trim(),
        status: "pending",
        type: "rental",
        created_at: new Date().toISOString(),
      }])
      .select()
      .single();

    if (bookingError) {
      console.error("[API] Erro ao criar reserva:", bookingError);
      throw new Error(`Erro ao criar reserva: ${bookingError.message}`);
    }

    console.log("[API] Reserva criada:", newBooking.id);

    // 4. Enviar email de confirmação (não falhar se email falhar)
    try {
      await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000"}/api/send-email`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            to: email,
            type: "booking_confirmation",
            data: {
              bookingId: newBooking.id,
              customerName: `${firstName || "Cliente"} ${lastName || ""}`.trim(),
              booking: newBooking,
              userCreated,
            },
          }),
        }
      );
      console.log("[API] Email de confirmação enviado");
    } catch (emailError) {
      console.warn("[API] Falha ao enviar email (continuando):", emailError);
      // Não falhar por causa do email
    }

    return NextResponse.json({
      success: true,
      message: userCreated
        ? "Reserva criada e conta criada com sucesso!"
        : "Reserva criada com sucesso!",
      data: {
        booking: newBooking,
        user: {
          id: currentUser.id,
          email: currentUser.email,
          firstName: currentUser.first_name,
          lastName: currentUser.last_name,
        },
        userCreated,
      },
    });
  } catch (error: any) {
    console.error("[API] Erro ao criar reserva:", error);
    
    const errorMsg = error?.message || "Erro ao criar reserva";
    
    return NextResponse.json(
      {
        success: false,
        error: errorMsg,
        errorCode: "BOOKING_CREATION_FAILED"
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/bookings?email=...
 * Listar reservas do usuário por email
 */
export async function GET(request: Request): Promise<NextResponse<ActionResult>> {
  try {
    const { searchParams } = new URL(request.url);
    const email = searchParams.get("email");

    if (!email || !email.includes("@")) {
      return NextResponse.json(
        {
          success: false,
          error: "Email válido é obrigatório",
          errorCode: "INVALID_EMAIL"
        },
        { status: 400 }
      );
    }

    console.log("[API] Buscando reservas para:", email);

    // Buscar usuário pelo email
    const { data: user } = await supabase
      .from("users")
      .select("id")
      .eq("email", email.toLowerCase())
      .single();

    if (!user) {
      return NextResponse.json({
        success: true,
        message: "Nenhum usuário encontrado",
        data: [],
      });
    }

    // Buscar reservas do usuário
    const { data: bookings, error } = await supabase
      .from("bookings")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    if (error) throw error;

    return NextResponse.json({
      success: true,
      message: "Reservas obtidas com sucesso",
      data: bookings || [],
    });
  } catch (error: any) {
    console.error("[API] Erro ao buscar reservas:", error);
    
    return NextResponse.json(
      {
        success: false,
        error: error?.message || "Erro ao buscar reservas",
        errorCode: "BOOKING_FETCH_FAILED"
      },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/bookings?id=...
 * Cancelar uma reserva (soft delete)
 */
export async function DELETE(request: Request): Promise<NextResponse<ActionResult>> {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id || !id.trim()) {
      return NextResponse.json(
        {
          success: false,
          error: "ID da reserva é obrigatório",
          errorCode: "MISSING_ID"
        },
        { status: 400 }
      );
    }

    console.log("[API] Cancelando reserva:", id);

    // Soft delete - marcar como cancelada
    const { error } = await supabase
      .from("bookings")
      .update({ 
        status: "cancelled", 
        updated_at: new Date().toISOString() 
      })
      .eq("id", id);

    if (error) throw error;

    console.log("[API] Reserva cancelada com sucesso");

    return NextResponse.json({
      success: true,
      message: "Reserva cancelada com sucesso",
    });
  } catch (error: any) {
    console.error("[API] Erro ao cancelar reserva:", error);
    
    return NextResponse.json(
      {
        success: false,
        error: error?.message || "Erro ao cancelar reserva",
        errorCode: "BOOKING_CANCELLATION_FAILED"
      },
      { status: 500 }
    );
  }
}
