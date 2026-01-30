"use client";
export const dynamic = "force-dynamic";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { getBookingByIdAction, cancelBookingAction, resendDigitalReceiptAction } from "@/actions/public/bookings";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
    Car,
    Calendar as CalendarIcon,
    MapPin,
    XCircle,
    Phone,
    Mail,
    ChevronLeft,
    ShieldCheck,
    User,
    Building2,
    Navigation,
    Clock,
    CreditCard,
    CheckCircle2,
    AlertCircle,
    Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useBookingPolling } from "@/hooks/use-booking-polling";
import { notificationService } from "@/lib/notification-service";

export default function BookingDetailPage() {
    const { id } = useParams();
    const router = useRouter();
    const [booking, setBooking] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [cancelling, setCancelling] = useState(false);
    const [sendingReceipt, setSendingReceipt] = useState(false);
    const [lastSeenStatus, setLastSeenStatus] = useState<string | null>(null);

    useEffect(() => {
        if (id) {
            fetchBookingDetail(id as string);
        }
    }, [id]);

    const fetchBookingDetail = async (bookingId: string) => {
        try {
            const data = await getBookingByIdAction(bookingId);
            setBooking(data);
            setLastSeenStatus(data?.status || null);
        } catch (error) {
            console.error("Error fetching booking detail:", error);
            notificationService.notifyError("Erro ao carregar detalhes da reserva");
        } finally {
            setLoading(false);
        }
    };

    // Polling automático para atualizar status
    useBookingPolling({
        bookingId: id as string,
        interval: 5000, // A cada 5 segundos
        enabled: !!id && !loading && !!booking,
        onUpdate: (updatedBooking) => {
            setBooking(updatedBooking);
        },
        onStatusChange: (newStatus, oldStatus) => {
            // Notificar cliente sobre mudança de status
            notificationService.notifyClientBookingUpdate(oldStatus, newStatus);
            setLastSeenStatus(newStatus);
        }
    });

    const handleCancel = async () => {
        if (!confirm("Tem certeza que deseja cancelar esta reserva?\n\nReceberá reembolso completo.")) return;
        setCancelling(true);
        try {
            const result = await cancelBookingAction(id as string);
            if (result.success) {
                notificationService.notifySuccess("Reserva cancelada com sucesso! Reembolso será processado em 3-5 dias.");
                fetchBookingDetail(id as string);
            } else {
                const errorMsg = result?.error || "Falha ao cancelar reserva. Tente novamente.";
                notificationService.notifyError(errorMsg);
            }
        } catch (error: any) {
            const errorMsg = error?.message || "Erro na comunicação com o servidor";
            notificationService.notifyError(errorMsg);
        } finally {
            setCancelling(false);
        }
    };

    const handleSendReceipt = async () => {
        const email = localStorage.getItem("user_email");
        if (!email) {
            notificationService.notifyError("Email do utilizador não encontrado. Por favor, recarregue a página.");
            return;
        }

        setSendingReceipt(true);
        try {
            const result = await resendDigitalReceiptAction(id as string, email);
            if (result.success) {
                notificationService.notifySuccess(`Recibo enviado com sucesso para ${email}`);
            } else {
                const errorMsg = result?.error || "Falha ao enviar recibo. Tente novamente.";
                notificationService.notifyError(errorMsg);
            }
        } catch (error: any) {
            const errorMsg = error?.message || "Erro na comunicação com o servidor";
            notificationService.notifyError(errorMsg);
        } finally {
            setSendingReceipt(false);
        }
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
                <div className="flex flex-col items-center gap-4">
                    <Loader2 className="h-10 w-10 animate-spin text-[#003580]" />
                    <p className="text-xs font-black tracking-[0.2em] text-[#003580]">Carregando Detalhes...</p>
                </div>
            </div>
        );
    }

    if (!booking) {
        return (
            <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4 text-center">
                <AlertCircle className="h-16 w-16 text-red-500 mb-4" />
                <h1 className="text-xl font-black text-gray-900">Reserva não encontrada</h1>
                <Button onClick={() => router.back()} className="mt-6 rounded-none bg-[#003580] hover:bg-blue-900 px-8 py-6 h-auto font-black tracking-widest text-xs">
                    Voltar ao Histórico
                </Button>
            </div>
        );
    }

    const vehicle = booking.vehicles;
    const vehicleClass = vehicle?.vehicle_classes;
    const partner = booking.partners;
    const bookingDriver = booking.driver;
    const vehicleDriver = vehicle?.current_driver;
    const activeDriver = bookingDriver || vehicleDriver;
    const extras = booking.available_extras || [];
    const transactions = booking.transactions;
    const isCancelled = booking.status === "cancelled" || booking.status === "canceled";

    const pickupDate = new Date(booking.start_time);
    const returnDate = booking.end_time ? new Date(booking.end_time) : null;

    const partnerAddress = partner ? [partner.address_street, partner.address_city, partner.address_province].filter(Boolean).join(", ") : booking.pickup_address;
    const isRental = booking.service_type === 'rental';
    const stops = Array.isArray(booking.stops) ? booking.stops : [];

    return (
        <div className="min-h-screen bg-gray-50 pt-24 pb-32 font-sans">
            <div className="container mx-auto px-4 max-w-5xl">

                {/* Navigation */}
                <div className="mb-8">
                    <Link
                        href="/history"
                        className="inline-flex items-center rounded-none text-gray-500 hover:text-[#003580] font-black tracking-widest text-[10px] p-0 transition-colors"
                    >
                        <ChevronLeft className="h-4 w-4 mr-1" />
                        Voltar ao Histórico
                    </Link>
                </div>

                {/* Header Section */}
                <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 mb-10 bg-white p-8 border border-gray-100 rounded-none shadow-sm">
                    <div>
                        <div className="flex items-center gap-3 mb-2">
                            <span className={cn(
                                "px-3 py-1 text-[10px] font-black tracking-widest rounded-none",
                                isCancelled ? "bg-red-50 text-red-600 border border-red-100" : "bg-green-50 text-green-700 border border-green-100"
                            )}>
                                {isCancelled ? "Cancelada" : "Confirmada"}
                            </span>
                            <span className="text-xs font-mono text-gray-400 font-bold">#{booking.code || booking.id.slice(0, 8)}</span>
                        </div>
                        <h1 className="text-4xl font-black text-gray-900 tracking-tighter">Detalhes da Reserva</h1>
                        <p className="text-gray-400 font-bold text-xs tracking-widest mt-1">Efetuada em {new Date(booking.created_at).toLocaleDateString("pt-PT")}</p>
                    </div>

                    <div className="flex flex-col items-end gap-2">
                        <p className="text-[10px] font-black text-gray-400 tracking-widest">Valor Total Investido</p>
                        <div className="flex items-baseline gap-1">
                            <span className="text-xs font-black text-[#003580] opacity-30">AOA</span>
                            <p className="text-4xl font-black text-[#003580] leading-none tabular-nums tracking-tighter">
                                {(booking.total_price || 0).toLocaleString("pt-AO")}
                            </p>
                        </div>
                    </div>
                </header>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">

                    {/* Main Column */}
                    <div className="lg:col-span-2 space-y-8">

                        {/* 1. Vehicle Information */}
                        <Card className="rounded-none border-gray-100 shadow-sm overflow-hidden border-t-4 border-t-[#003580]">
                            <CardContent className="p-8">
                                <div className="flex items-center gap-2 mb-6 text-[#003580]">
                                    <Car className="h-5 w-5" />
                                    <h2 className="text-sm font-black tracking-widest">Informações do Veículo</h2>
                                </div>

                                <div className="flex flex-col md:flex-row gap-8">
                                    <div className="w-full md:w-56 h-40 bg-gray-50 flex items-center justify-center border border-gray-100 rounded-none overflow-hidden group">
                                        {vehicle?.image_url ? (
                                            <img src={vehicle.image_url} alt={vehicle.model} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700" />
                                        ) : (
                                            <Car className="h-12 w-12 text-gray-200" />
                                        )}
                                    </div>
                                    <div className="flex-1 space-y-4">
                                        <div>
                                            <h3 className="text-2xl font-black text-gray-900 leading-none mb-1 tracking-tight">
                                                {vehicle ? `${vehicle.brand} ${vehicle.model}` : "Aguardando Viatura"}
                                            </h3>
                                            <p className="text-[#006ce4] font-black text-[10px] tracking-widest">
                                                Classe {vehicleClass?.name || "Standard Class"}
                                            </p>
                                        </div>

                                        <div className="grid grid-cols-2 gap-y-4 gap-x-8 pt-4 border-t border-gray-50">
                                            <div>
                                                <p className="text-[8px] font-black text-gray-400 tracking-widest mb-1">Matrícula</p>
                                                <p className="text-xs font-bold text-gray-800 bg-gray-100 px-2 py-1 w-fit border border-gray-200">{vehicle?.license_plate || "TBD"}</p>
                                            </div>
                                            <div>
                                                <p className="text-[8px] font-black text-gray-400 tracking-widest mb-1">Combustível</p>
                                                <p className="text-xs font-bold text-gray-800">{vehicle?.fuel_type || "Não especificado"}</p>
                                            </div>
                                            <div>
                                                <p className="text-[8px] font-black text-gray-400 tracking-widest mb-1">Transmissão</p>
                                                <p className="text-xs font-bold text-gray-800">{vehicle?.transmission || "Manual"}</p>
                                            </div>
                                            <div>
                                                <p className="text-[8px] font-black text-gray-400 tracking-widest mb-1">Lugares</p>
                                                <p className="text-xs font-bold text-gray-800">{vehicle?.seats || "5"} Passageiros</p>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>

                        {/* 2. Itinerary Details */}
                        <Card className="rounded-none border-gray-100 shadow-sm overflow-hidden border-t-4 border-t-amber-500">
                            <CardContent className="p-8">
                                <div className="flex items-center gap-2 mb-8 text-amber-600">
                                    <Clock className="h-5 w-5" />
                                    <h2 className="text-sm font-black tracking-widest">Itinerário e Agendamento</h2>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-12 relative">
                                    {/* Visual Connection */}
                                    <div className="hidden md:block absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-8 h-8 bg-gray-50 rounded-full border border-gray-100 z-10 flex items-center justify-center">
                                        <div className="w-1 h-1 bg-[#003580] rounded-full"></div>
                                    </div>

                                    <div className="space-y-4">
                                        <div className="bg-slate-50 p-4 border-l-2 border-[#003580]">
                                            <p className="text-[9px] font-black text-[#003580] tracking-widest mb-2">Check-in / Levantamento</p>
                                            <div className="flex items-center gap-2 text-lg font-black text-gray-900 mb-1">
                                                <CalendarIcon className="h-5 w-5 opacity-40" />
                                                <span>{pickupDate.toLocaleDateString("pt-PT", { day: '2-digit', month: 'long', year: 'numeric' })}</span>
                                            </div>
                                            <p className="text-xl font-mono font-black text-[#003580] opacity-60">
                                                {pickupDate.toLocaleTimeString("pt-PT", { hour: '2-digit', minute: '2-digit' })}
                                            </p>
                                        </div>
                                        <div className="flex items-start gap-3 px-1">
                                            <MapPin className="h-4 w-4 text-[#003580] shrink-0 mt-1" />
                                            <div>
                                                <p className="text-[8px] font-black text-gray-400 tracking-[0.2em] mb-1">Local de Levantamento {isRental && "(Rental Car)"}</p>
                                                <p className="text-xs font-bold text-gray-700 leading-relaxed">
                                                    {isRental ? partnerAddress : booking.pickup_address}
                                                </p>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="space-y-4">
                                        <div className="bg-slate-50 p-4 border-l-2 border-gray-300">
                                            <p className="text-[9px] font-black text-gray-400 tracking-widest mb-2">Check-out / Entrega</p>
                                            <div className="flex items-center gap-2 text-lg font-black text-gray-900 mb-1">
                                                <CalendarIcon className="h-5 w-5 opacity-40" />
                                                <span>{returnDate ? returnDate.toLocaleDateString("pt-PT", { day: '2-digit', month: 'long', year: 'numeric' }) : "---"}</span>
                                            </div>
                                            <p className="text-xl font-mono font-black text-gray-400 opacity-60">
                                                {returnDate ? returnDate.toLocaleTimeString("pt-PT", { hour: '2-digit', minute: '2-digit' }) : (isRental ? "POR DEFINIR" : "--:--")}
                                            </p>
                                        </div>
                                        <div className="flex items-start gap-3 px-1">
                                            <MapPin className="h-4 w-4 text-gray-300 shrink-0 mt-1" />
                                            <div>
                                                <p className="text-[8px] font-black text-gray-400 tracking-[0.2em] mb-1">Local de Devolução {isRental && "(Mesmo Local)"}</p>
                                                <p className="text-xs font-bold text-gray-500 leading-relaxed">
                                                    {isRental ? partnerAddress : (booking.dropoff_address || "A COMBINAR")}
                                                </p>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Stops Section */}
                                    {!isRental && stops.length > 0 && (
                                        <div className="md:col-span-2 mt-6 pt-6 border-t border-gray-100 bg-amber-50/20 -mx-8 px-8">
                                            <p className="text-[10px] font-black text-amber-600 tracking-widest mb-4 uppercase flex items-center gap-2">
                                                <Navigation className="h-3 w-3" />
                                                Paragens Intermédias ({stops.length})
                                            </p>
                                            <div className="space-y-4 pb-4">
                                                {stops.map((stop: string, index: number) => (
                                                    <div key={index} className="flex items-start gap-4 px-1 relative">
                                                        <div className="w-6 h-6 rounded-none bg-white border border-amber-200 flex items-center justify-center text-[10px] font-black text-amber-600 shrink-0 z-10 shadow-sm">
                                                            {index + 1}
                                                        </div>
                                                        <div className="flex-1">
                                                            <p className="text-[8px] font-black text-gray-400 tracking-[0.2em] mb-0.5">Local da Paragem</p>
                                                            <p className="text-xs font-bold text-gray-700 leading-tight">{stop}</p>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </CardContent>
                        </Card>


                        {/* 3. Extras & Services applied (Simulated for now based on total price difference or similar) */}
                        <Card className="rounded-none border-gray-100 shadow-sm overflow-hidden border-t-4 border-t-green-600">
                            <CardContent className="p-8">
                                <div className="flex items-center gap-2 mb-6 text-green-700">
                                    <ShieldCheck className="h-5 w-5" />
                                    <h2 className="text-sm font-black tracking-widest">Serviços Extra e Garantias</h2>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div className="flex items-center gap-4 p-4 border border-green-50 bg-green-50/20">
                                        <div className="bg-green-600 text-white p-2">
                                            <CheckCircle2 className="h-4 w-4" />
                                        </div>
                                        <div>
                                            <p className="text-xs font-black text-gray-900">Seguro WiTransfer Prime</p>
                                            <p className="text-[9px] text-green-700 font-bold tracking-widest">Incluso na reserva</p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-4 p-4 border border-gray-100">
                                        <div className="bg-gray-100 text-gray-400 p-2">
                                            <CheckCircle2 className="h-4 w-4" />
                                        </div>
                                        <div>
                                            <p className="text-xs font-black text-gray-500">Assistência 24/7</p>
                                            <p className="text-[9px] text-gray-400 font-bold tracking-widest">Suporte prioritário</p>
                                        </div>
                                    </div>

                                    {extras.map((extra: any) => (
                                        <div key={extra.id} className="flex items-center gap-4 p-4 border border-blue-50 bg-blue-50/10">
                                            <div className="bg-[#003580] text-white p-2">
                                                <CheckCircle2 className="h-4 w-4" />
                                            </div>
                                            <div>
                                                <p className="text-xs font-black text-gray-900">{extra.name}</p>
                                                <p className="text-[9px] text-[#003580] font-bold tracking-widest">Disponível no Parceiro</p>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </CardContent>
                        </Card>
                    </div>

                    {/* Sidebar Column */}
                    <div className="space-y-8">

                        {/* 4. Driver Assignment */}
                        <Card className="rounded-none border-gray-100 shadow-sm border-l-4 border-l-blue-400">
                            <CardContent className="p-6">
                                <div className="flex items-center gap-2 mb-6 text-blue-600">
                                    <User className="h-4 w-4" />
                                    <h2 className="text-[10px] font-black tracking-widest">Motorista Designado</h2>
                                </div>

                                {activeDriver ? (
                                    <div className="flex items-center gap-4">
                                        <div className="h-14 w-14 bg-[#003580] flex items-center justify-center text-white text-xl font-black rounded-none overflow-hidden">
                                            {activeDriver.avatar_url ? (
                                                <img src={activeDriver.avatar_url} alt={activeDriver.full_name} className="w-full h-full object-cover" />
                                            ) : (
                                                activeDriver.full_name.charAt(0)
                                            )}
                                        </div>
                                        <div>
                                            <p className="text-sm font-black text-gray-900 mb-0.5">{activeDriver.full_name}</p>
                                            <p className="text-[10px] text-gray-400 font-bold flex items-center gap-1 tracking-tighter">
                                                <Phone className="h-3 w-3" /> {activeDriver.phone || "Indisponível"}
                                            </p>
                                            {activeDriver.license_number && (
                                                <p className="text-[8px] text-slate-400 font-bold mt-1">Carta: {activeDriver.license_number}</p>
                                            )}
                                        </div>
                                    </div>
                                ) : (
                                    <div className="py-4 px-2 border-2 border-dashed border-gray-50 text-center">
                                        <p className="text-[10px] font-black text-gray-300">Aguardando atribuição de motorista pela central</p>
                                    </div>
                                )}
                            </CardContent>
                        </Card>

                        {/* 5. Partner Info */}
                        <Card className="rounded-none border-gray-100 shadow-sm border-l-4 border-l-slate-400">
                            <CardContent className="p-6">
                                <div className="flex items-center gap-2 mb-6 text-slate-500">
                                    <Building2 className="h-4 w-4" />
                                    <h2 className="text-[10px] font-black tracking-widest">Parceiro WiTransfer</h2>
                                </div>

                                {partner ? (
                                    <div className="space-y-4">
                                        <div className="flex items-center gap-4">
                                            <div className="h-10 w-10 bg-slate-100 flex items-center justify-center text-slate-400 text-lg font-black rounded-none">
                                                {partner.name.charAt(0)}
                                            </div>
                                            <div>
                                                <p className="text-xs font-black text-gray-900 mb-0.5">{partner.name}</p>
                                                <p className="text-[9px] text-slate-400 font-bold tracking-widest">Frota Autorizada</p>
                                            </div>
                                        </div>
                                        <div className="pt-3 border-t border-gray-50 flex items-center justify-between text-[10px] font-bold text-slate-500">
                                            <span>Avaliação Parceiro</span>
                                            <span className="text-[#003580]">{(partner.rating || 5).toFixed(1)} ★</span>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="py-2">
                                        <p className="text-xs font-black text-gray-900">WiTransfer Official Fleet</p>
                                    </div>
                                )}
                            </CardContent>
                        </Card>

                        {/* 6. Payment Summary */}
                        <Card className="rounded-none border-gray-100 shadow-sm bg-slate-900 text-white">
                            <CardContent className="p-6">
                                <div className="flex items-center gap-2 mb-6 text-blue-400">
                                    <CreditCard className="h-4 w-4" />
                                    <h2 className="text-[10px] font-black tracking-widest">Detalhes do Faturamento</h2>
                                </div>

                                <div className="space-y-3">
                                    <div className="flex justify-between items-center text-[10px] font-bold tracking-widest opacity-60">
                                        <span>VALOR BASE</span>
                                        <span>AOA {(booking.total_price * 0.85).toLocaleString("pt-AO")}</span>
                                    </div>
                                    <div className="flex justify-between items-center text-[10px] font-bold tracking-widest opacity-60">
                                        <span>SERVIÇOS EXTRA</span>
                                        <span>AOA 0</span>
                                    </div>
                                    <div className="flex justify-between items-center text-[10px] font-bold tracking-widest opacity-60">
                                        <span>TAXAS & IVA (14%)</span>
                                        <span>AOA {(booking.total_price * 0.15).toLocaleString("pt-AO")}</span>
                                    </div>
                                    <div className="h-[1px] bg-slate-800 my-2"></div>
                                    <div className="flex justify-between items-center">
                                        <span className="text-[10px] font-black tracking-widest">TOTAL PAGO</span>
                                        <span className="text-xl font-black text-blue-400 tabular-nums">AOA {(booking.total_price || 0).toLocaleString("pt-AO")}</span>
                                    </div>

                                    <div className="pt-4">
                                        {transactions && transactions.length > 0 ? (
                                            <div className="bg-blue-500/10 border border-blue-500/20 p-3 flex items-center gap-3">
                                                <ShieldCheck className="h-4 w-4 text-blue-400" />
                                                <p className="text-[9px] font-black tracking-wider text-blue-400">Pagamento Confirmado em {new Date(transactions[0].created_at).toLocaleDateString()}</p>
                                            </div>
                                        ) : (
                                            <div className="bg-amber-500/10 border border-amber-500/20 p-3 flex items-center gap-3">
                                                <AlertCircle className="h-4 w-4 text-amber-500" />
                                                <p className="text-[9px] font-black tracking-wider text-amber-500">Pagamento em Processamento</p>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </CardContent>
                        </Card>

                        {/* 7. Action Buttons */}
                        <div className="space-y-3 pt-4">
                            <Button
                                onClick={handleSendReceipt}
                                disabled={sendingReceipt}
                                className="w-full rounded-none bg-blue-600 hover:bg-blue-700 h-14 font-black tracking-widest text-xs flex items-center justify-center gap-3"
                            >
                                {sendingReceipt ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
                                Reenviar Recibo Digital
                            </Button>
                        </div>

                        <div className="p-4 bg-blue-50 border border-blue-100 rounded-none text-center">
                            <Phone className="h-5 w-5 text-[#003580] mx-auto mb-2" />
                            <p className="text-[9px] font-black text-[#003580] tracking-widest mb-1">Apoio ao Cliente 24/7</p>
                            <p className="text-sm font-black text-[#003580]">+244 9XX XXX XXX</p>
                        </div>

                    </div>
                </div>
            </div>
        </div>
    );
}
