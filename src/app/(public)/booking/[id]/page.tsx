"use client";

import { useEffect, useState, useMemo } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useParams, useRouter } from "next/navigation";
import { format, parseISO } from "date-fns";
import { pt } from "date-fns/locale";
import { getCarsByIds } from "@/actions/public/search/cars";
import { getExtras } from "@/actions/public/extras";
import { createDraftAction } from "@/actions/public/drafts";
import { getUserByEmail } from "@/actions/public/users";
import { Car, Extra, SearchFilters } from "@/types";
import { Header } from "@/components/header/public";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Check,
  Plus,
  Minus,
  ChevronRight,
  ShieldCheck,
  X,
  Loader2,
  MapPin,
  Navigation,
  Flag,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { validateNif } from "@/actions/public/nif";
import { verifyEmail } from "@/actions/public/auth";
import { LoginDialog } from "@/components/modal/auth";
import { useSearchParams } from "next/navigation";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
// No URL-encoded state; use server-side drafts (`did`)
import { getDraftAction } from "@/actions/public/drafts";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { LocationAutocomplete } from "@/components/ui/location-autocomplete";



export default function BookingDetailsPage() {
  const { id } = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();

  const [cars, setCars] = useState<Car[]>([]);
  const [extras, setExtras] = useState<Extra[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [isValidatingNif, setIsValidatingNif] = useState(false);
  const [validationError, setValidationError] = useState(false);
  const [isNavigating, setIsNavigating] = useState(false);
  const [searchContext, setSearchContext] = useState<SearchFilters | null>(null);
  const [reservationDates, setReservationDates] = useState<{
    from?: string;
    to?: string;
  }>({});
  const [isEmailChecked, setIsEmailChecked] = useState(false);
  const [isRegistered, setIsRegistered] = useState(false);
  const [isCheckingEmail, setIsCheckingEmail] = useState(false);

  const currentType =
    (searchContext?.type ||
      searchParams.get("type") ||
      (cars[0]?.availableFor === "transfer" ? "transfer" : "rental")) as "rental" | "transfer";

  const [isRecalculating, setIsRecalculating] = useState(false);

  const handleUpdateRoute = async (field: 'pickup' | 'dropoff' | 'stops', value: any, coords?: any) => {
    if (!searchContext) return;

    const updatedCtx: SearchFilters = { ...searchContext, [field]: value };
    if (field === 'pickup' && coords) updatedCtx.pickupCoords = coords;
    if (field === 'dropoff' && coords) updatedCtx.dropoffCoords = coords;
    if (field === 'stops' && coords) updatedCtx.stopsCoords = coords;

    setSearchContext(updatedCtx);

    // Recalculate if we have both endpoints or if stops changed
    if (updatedCtx.pickup && updatedCtx.dropoff) {
      setIsRecalculating(true);
      try {
        const rawId = Array.isArray(id) ? id[0] : id;
        if (typeof rawId === "string") {
          const carIds = rawId.split(",").filter(Boolean);
          const updatedCars = await getCarsByIds(carIds, updatedCtx);
          setCars(updatedCars);
          try { await fetchExtrasForCars(updatedCars); } catch (e) { }

          // Update draft in sessionStorage
          const did = searchParams.get("did");
          if (did) {
            const stored = sessionStorage.getItem(did);
            if (stored) {
              const parsed = JSON.parse(stored);
              // Ensure search context is preserved
              parsed.search = { ...(parsed.search || {}), ...updatedCtx };
              // Update summaries with new prices
              parsed.summaries = updatedCars.map((c: any) => ({
                id: c.id,
                totalPrice: c.totalPrice,
                baseTotal: c.baseTotal,
                extrasTotal: c.extrasTotal,
              }));
              sessionStorage.setItem(did, JSON.stringify(parsed));
              // Also update the global last_search for consistency if the user goes back
              sessionStorage.setItem("witransfer_last_search", JSON.stringify(parsed.search));
            }
          }
        }
      } catch (err) {
        console.error("Route recalculation failed:", err);
        toast.error("Erro ao atualizar rota. Tente novamente.");
      } finally {
        setIsRecalculating(false);
      }
    }
  };

  const [formData, setFormData] = useState({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    ddi: "+244",
    billingType: "individual",
    documentId: "",
    drivingLicense: "",
    billingName: "",
    nif: "",
    address: "",
  });

  // Determine IDs that represent a professional driver based on name or ID
  const driverExtraIds = useMemo(() => {
    return (extras || [])
      .filter(ex => {
        const normalizedName = (ex.name || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        const normalizedId = (ex.id || "").toLowerCase();
        return normalizedName.includes("motorista") ||
          normalizedName.includes("driver") ||
          normalizedName.includes("condutor") ||
          normalizedId.includes("driver") ||
          normalizedId.includes("motorista");
      })
      .map(ex => ex.id);
  }, [extras]);

  const hasProfessionalDriver = useMemo(() => {
    // Se é transfer, sempre tem motorista
    if (currentType === "transfer") {
      return true;
    }

    // LÓGICA SIMPLES: Se existe QUALQUER extra de motorista disponível, esconder formulário
    // Todos os extras vêm com o veículo, então se "Motorista Bilíngue" está na lista, está disponível
    if (driverExtraIds.length > 0) {
      return true;
    }

    return false;
  }, [currentType, driverExtraIds, extras]);

  const handleNifChange = async (val: string) => {
    setFormData((prev) => ({ ...prev, nif: val }));
    setValidationError(false);
    if (val.length >= 9) {
      setIsValidatingNif(true);
      const result = await validateNif(val);
      if (result.success && result.data) {
        setFormData((prev) => ({
          ...prev,
          billingName: result.data.name,
          firstName: !hasProfessionalDriver
            ? result.data.name.split(" ")[0]
            : prev.firstName,
          lastName: !hasProfessionalDriver
            ? result.data.name.split(" ").slice(1).join(" ")
            : prev.lastName,
        }));
        setValidationError(false);
      } else {
        setValidationError(true);
        setFormData((prev) => ({ ...prev, billingName: "" }));
      }
      setIsValidatingNif(false);
    } else {
      setFormData((prev) => ({ ...prev, billingName: "" }));
    }
  };

  const handleEmailBlur = async () => {
    if (!formData.email || !formData.email.includes("@")) return;

    setIsCheckingEmail(true);
    try {
      const res = await verifyEmail(formData.email);
      if (res.exists) {
        setIsRegistered(true);
      } else {
        setIsRegistered(false);
      }
      setIsEmailChecked(true);
    } catch (err) {
      console.error("Error checking email:", err);
    } finally {
      setIsCheckingEmail(false);
    }
  };

  async function fetchExtrasForCars(loadedCars: any[]) {
    try {
      const vehicleIds = Array.from(new Set(loadedCars.map((c) => c.id).filter(Boolean)));
      const partnerIds = Array.from(new Set(loadedCars.map((c) => c.partnerId || c.partner_id).filter(Boolean)));
      const extrasMap: Record<string, any> = {};

      await Promise.all(vehicleIds.map(async (vid) => {
        try {
          const ev = await getExtras({ vehicleId: vid });
          (ev || []).forEach((e: any) => { extrasMap[e.id] = e; });
        } catch (e) { }
      }));

      await Promise.all(partnerIds.map(async (pid) => {
        try {
          const ep = await getExtras({ partnerId: pid });
          (ep || []).forEach((e: any) => { extrasMap[e.id] = e; });
        } catch (e) { }
      }));

      setExtras(Object.values(extrasMap));
    } catch (e) {
      console.error('Erro ao buscar extras para a reserva', e);
    }
  }

  useEffect(() => {
    async function syncAuth() {
      if (typeof window !== "undefined") {
        const isAuth = localStorage.getItem("is_auth") === "true";
        const userEmail = localStorage.getItem("user_email");

        if (isAuth && userEmail) {
          setFormData(prev => ({ ...prev, email: userEmail }));
          setIsRegistered(true);
          setIsEmailChecked(true);

          // Buscar dados completos do usuário para preencher o formulário
          try {
            const res = await getUserByEmail(userEmail);
            if (res.exists && res.data) {
              const u = res.data;
              const nameParts = (u.full_name || "").split(" ");
              setFormData(prev => ({
                ...prev,
                firstName: nameParts[0] || "",
                lastName: nameParts.slice(1).join(" ") || "",
                phone: u.phone || prev.phone,
                nif: u.nif || prev.nif,
                drivingLicense: u.license_number || prev.drivingLicense
              }));
            }
          } catch (err) {
            console.error("Error fetching user data for pre-fill:", err);
          }
        }
      }
    }
    syncAuth();
  }, []);


  useEffect(() => {
    async function loadData() {
      setLoading(true);
      try {
        const draftId = searchParams.get("did");
        let draft: any = null;

        // 1. Try Local Cache (fastest & handles large data without 431)
        if (typeof window !== "undefined") {
          // Priority order:
          // 1. Specific draft ID (has carIds + summaries + search)
          // 2. Last draft (witransfer_last_draft)
          // 3. Merge with witransfer_last_search for complete search context

          const specificDraft = draftId ? sessionStorage.getItem(draftId) : null;
          const lastDraft = sessionStorage.getItem("witransfer_last_draft");
          const lastSearch = sessionStorage.getItem("witransfer_last_search");

          const localData = specificDraft || lastDraft;

          if (localData) {
            try {
              draft = JSON.parse(localData);
              console.log("✅ [BookingPage] Loaded draft from sessionStorage:", draftId || "witransfer_last_draft");

              // If draft.search exists but has null values, merge with witransfer_last_search
              if (draft.search && lastSearch) {
                try {
                  const searchData = JSON.parse(lastSearch);
                  // Only merge if draft.search has null/undefined values
                  const hasNullValues = Object.values(draft.search).some(v => v === null || v === undefined);
                  if (hasNullValues) {
                    draft.search = { ...searchData, ...draft.search };
                    // Filter out any remaining null values
                    draft.search = Object.fromEntries(
                      Object.entries(draft.search).filter(([_, v]) => v !== null && v !== undefined)
                    );
                    console.log("✅ [BookingPage] Merged search data from witransfer_last_search");
                  }
                } catch (e) {
                  console.warn("Failed to merge with witransfer_last_search:", e);
                }
              }
            } catch (e) {
              console.error("Error parsing local draft:", e);
            }
          }
        }

        // 2. Try Server Draft (reliablilty fallback)
        if (draftId && draftId.length > 10) {
          try {
            const serverDraft = await getDraftAction(draftId) as any;
            if (serverDraft) {
              draft = { ...serverDraft, ...(serverDraft.data || {}) };
              console.log("Loaded draft from server");
            }
          } catch (err) {
            console.warn("BookingPage: failed to load server draft", err);
          }
        }

        if (draft) {
          console.log("🔍 [BookingPage] ===== DRAFT CARREGADO =====");
          console.log("🔍 carIds:", draft.carIds);
          console.log("🔍 search:", JSON.stringify(draft.search || draft.searchContext, null, 2));
          console.log("🔍 summaries:", draft.summaries);
          console.log("🔍 ==========================================");
          // Handle optimized draft structure (carIds + summaries)
          if (Array.isArray(draft.carIds) && draft.carIds.length > 0) {
            const fetchedCars = await getCarsByIds(draft.carIds);
            const enhancedCars = fetchedCars.map(car => {
              const summary = (draft.summaries || []).find((s: any) => s.id === car.id);
              if (summary) {
                return {
                  ...car,
                  totalPrice: summary.totalPrice,
                  baseTotal: summary.baseTotal,
                  extrasTotal: summary.extrasTotal
                };
              }
              return car;
            });
            setCars(enhancedCars);
            try { await fetchExtrasForCars(enhancedCars); } catch (e) { }
          } else if (draft.offers) {
            setCars(draft.offers as any[]);
            try { await fetchExtrasForCars(draft.offers as any[]); } catch (e) { }
          }

          if (draft.search || draft.searchContext || draft.pickup) {
            const ctx = draft.search || draft.searchContext || {
              pickup: draft.pickup,
              dropoff: draft.dropoff,
              from: draft.from,
              to: draft.to,
              date: draft.date,
              time: draft.time,
              time1: draft.time1,
              time2: draft.time2,
              type: draft.type,
              passengers: draft.passengers,
              luggage: draft.luggage,
            };
            // Filter out null values to ensure they're not displayed as "null" in UI
            const cleanCtx: any = Object.fromEntries(
              Object.entries(ctx).filter(([_, v]) => v !== null && v !== undefined)
            );
            setSearchContext(cleanCtx as SearchFilters);
            setReservationDates({
              from: cleanCtx.from || cleanCtx.date || undefined,
              to: cleanCtx.to || cleanCtx.date || undefined,
            });
            // Re-fetch cars with context to ensure pricing is correct
            if (Array.isArray(draft.carIds) && draft.carIds.length > 0) {
              const fetchedCars = await getCarsByIds(draft.carIds, cleanCtx as SearchFilters);
              setCars(fetchedCars);
            }
          }

          if (draft.customer) {
            setFormData(prev => ({ ...prev, ...draft.customer }));
          }

          setLoading(false);
          return;
        }
      } catch (err) {
        console.error("BookingPage: draft handling error", err);
      }
      try {

        if (id && id !== "checkout") {
          const rawId = Array.isArray(id) ? id[0] : id;
          const decodedId = decodeURIComponent(rawId);
          const ids = decodedId
            .split(",")
            .map((part) => part.trim())
            .filter(Boolean);
          const ctx: SearchFilters = {
            pickup: searchParams.get("pickup") || "",
            dropoff: searchParams.get("dropoff") || "",
            from: searchParams.get("from") || "",
            to: searchParams.get("to") || "",
            passengers: searchParams.get("passengers") || "",
            luggage: searchParams.get("luggage") || "",
            stops: searchParams.get("stops")?.split(",").filter(Boolean) || [],
            type: (searchParams.get("type") as any) || "rental",
          };
          const data = await getCarsByIds(ids, ctx);
          if (data && data.length > 0) {
            setCars(data);
            try { await fetchExtrasForCars(data); } catch (e) { }
            // If no draft, reconstruct search context from URL params
            setSearchContext(ctx);
            setReservationDates({
              from: ctx.from || undefined,
              to: ctx.to || undefined,
            });
          }
        }
      } catch (error) {
        console.error("BookingPage: Error", error);
      } finally {
        setLoading(false);
      }
    }

    async function fetchExtrasForCars(loadedCars: any[]) {
      try {
        const vehicleIds = Array.from(new Set(loadedCars.map((c) => c.id).filter(Boolean)));
        const partnerIds = Array.from(new Set(loadedCars.map((c) => c.partnerId || c.partner_id).filter(Boolean)));
        const extrasMap: Record<string, any> = {};

        await Promise.all(vehicleIds.map(async (vid) => {
          try {
            const ev = await getExtras({ vehicleId: vid });
            (ev || []).forEach((e: any) => { extrasMap[e.id] = e; });
          } catch (e) { }
        }));

        await Promise.all(partnerIds.map(async (pid) => {
          try {
            const ep = await getExtras({ partnerId: pid });
            (ep || []).forEach((e: any) => { extrasMap[e.id] = e; });
          } catch (e) { }
        }));

        setExtras(Object.values(extrasMap));
      } catch (e) {
        console.error('Erro ao buscar extras para a reserva', e);
      }
    }

    loadData();
  }, [id, searchParams]);

  // Preços já vêm calculados do servidor - não precisa recalcular

  // Persistent Save - Sync state to sessionStorage when requested (e.g. on blur)
  const saveFormDataToSession = () => {
    if (loading) return;
    const draftId = searchParams.get("did");
    if (draftId && typeof window !== "undefined") {
      try {
        const currentDraft = sessionStorage.getItem(draftId);
        let baseDraft = currentDraft ? JSON.parse(currentDraft) : {};

        const updatedDraft = {
          ...baseDraft,
          customer: { ...formData },
          firstName: formData.firstName,
          lastName: formData.lastName,
          email: formData.email,
          phone: formData.phone,
          nif: formData.nif,
          drivingLicense: formData.drivingLicense,
        };

        sessionStorage.setItem(draftId, JSON.stringify(updatedDraft));
        console.log("💾 [BookingPage] Progress saved to sessionStorage");
      } catch (e) {
        console.error("Failed to persist booking state:", e);
      }
    }
  };

  const isTransfer = currentType === "transfer";

  // Calculate days from search context if available, otherwise fallback to 3
  let rentalDays = 3;
  if (searchContext?.from && searchContext?.to && !isTransfer) {
    const d1 = new Date(searchContext.from);
    const d2 = new Date(searchContext.to);
    const diffTime = Math.abs(d2.getTime() - d1.getTime());
    rentalDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) || 1;
  } else if (isTransfer) {
    rentalDays = 1;
  }

  const calculateTotal = () => {
    return cars.reduce((total: number, car: Car) => total + (car.totalPrice || 0), 0);
  };

  const finalTotal = calculateTotal();

  if (loading)
    return (
      <div className="min-h-screen flex items-center justify-center bg-white text-gray-900 font-bold tracking-tighter">
        A carregar detalhes...
      </div>
    );
  if (cars.length === 0)
    return (
      <div className="min-h-screen flex items-center justify-center bg-white text-gray-900 font-bold">
        Nenhum veículo selecionado.
      </div>
    );

  return (
    <div className="min-h-screen bg-[#f8faff] pb-32">
      <div className="bg-white border-b border-gray-100 shadow-sm sticky top-0 z-40">
        <div className="container mx-auto px-4 py-3">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div className="flex items-center gap-2 text-xs md:text-sm font-medium text-gray-500 overflow-x-auto pb-1 md:pb-0 w-full md:w-auto no-scrollbar whitespace-nowrap">
              <span>Resultados</span>{" "}
              <ChevronRight className="h-4 w-4 shrink-0" />
              <span className="text-[#006ce4] font-bold">
                Serviços Extra & Dados
              </span>{" "}
              <ChevronRight className="h-4 w-4 shrink-0" />
              <span>Pagamento</span>
            </div>
            <div className="flex items-center gap-3 bg-green-50 px-3 py-1.5 rounded-none border border-green-100 shrink-0">
              <ShieldCheck className="h-4 w-4 text-green-600" />
              <span className="text-[10px] md:text-xs font-bold text-green-800 tracking-tight">
                Checkout Seguro
              </span>
            </div>
          </div>
        </div>
      </div>
      <main className="container mx-auto px-4 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_390px] gap-8">
          <div className="space-y-6">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 mb-2 tracking-tight">
                Personalize sua Reserva
              </h1>
              <p className="text-gray-600 text-base font-medium">
                Adicione extras e preencha os dados do condutor para concluir.
              </p>
            </div>

            {isTransfer && (
              <div className="bg-white rounded-none p-7 shadow-sm border border-gray-100">
                <h2 className="text-xl font-bold text-gray-900 mb-6 flex items-center gap-3">
                  <span className="bg-[#003580] text-white w-9 h-9 rounded-none flex items-center justify-center text-sm font-bold">
                    1
                  </span>
                  Trajeto & Paragens
                </h2>
                <div className="space-y-6">
                  {/* Pickup */}
                  <LocationAutocomplete
                    label="Ponto de Partida"
                    icon={MapPin}
                    color="text-green-600"
                    value={searchContext?.pickup || ""}
                    onChange={(v) => setSearchContext(prev => prev ? { ...prev, pickup: v } : null)}
                    onSelect={(v, lat, lng) => handleUpdateRoute('pickup', v, (lat && lng) ? [lat, lng] : undefined)}
                    placeholder="Local de início"
                    inputClassName="h-12 text-base border-gray-300 rounded-none bg-slate-50/50"
                    showMap={isTransfer}
                  />

                  {/* Stops */}
                  <div className="space-y-4">
                    <Label className="text-sm font-bold text-gray-700 flex items-center gap-2">
                      <Navigation className="h-4 w-4 text-amber-500" />
                      Paragens Intermédias
                    </Label>
                    <div className="space-y-3">
                      {(searchContext?.stops || []).map((stop, index) => (
                        <div key={index} className="flex gap-2 group animate-in slide-in-from-left-2 duration-300 w-full">
                          <LocationAutocomplete
                            value={stop}
                            onChange={(v) => {
                              const next = [...(searchContext?.stops || [])];
                              next[index] = v;
                              setSearchContext(prev => prev ? { ...prev, stops: next } : null);
                            }}
                            onSelect={(v, lat, lng) => {
                              const next = [...(searchContext?.stops || [])];
                              next[index] = v;
                              const nextCoords = [...(searchContext?.stopsCoords || [])];
                              nextCoords[index] = (lat && lng) ? [lat, lng] : null;
                              handleUpdateRoute('stops', next, nextCoords);
                            }}
                            className="flex-1"
                            inputClassName="h-11 text-sm border-amber-100 rounded-none focus:border-amber-400 bg-amber-50/10 w-full"
                            placeholder={`Paragem ${index + 1}`}
                            icon={Navigation}
                            color="text-amber-500"
                            showMap={isTransfer}
                          />
                          <Button
                            variant="outline"
                            size="icon"
                            className="h-11 w-11 shrink-0 text-red-500 border-red-100 hover:bg-red-50 hover:border-red-200"
                            onClick={() => {
                              const next = (searchContext?.stops || []).filter((_, i) => i !== index);
                              const nextCoords = (searchContext?.stopsCoords || []).filter((_, i) => i !== index);
                              handleUpdateRoute('stops', next, nextCoords);
                            }}
                          >
                            <Minus className="h-4 w-4" />
                          </Button>
                        </div>
                      ))}
                      <Button
                        variant="outline"
                        className="w-full border-dashed border-2 border-slate-200 text-slate-500 font-bold hover:border-[#003580] hover:text-[#003580] hover:bg-slate-50 py-7 transition-all flex flex-col items-center justify-center gap-1 h-auto"
                        onClick={() => {
                          const next = [...(searchContext?.stops || []), ""];
                          const nextCoords = [...(searchContext?.stopsCoords || []), null];
                          setSearchContext(prev => prev ? { ...prev, stops: next, stopsCoords: nextCoords } : null);
                        }}
                      >
                        <Plus className="h-5 w-5" />
                        <span className="text-xs uppercase tracking-wider">Adicionar outra paragem</span>
                      </Button>
                    </div>
                  </div>

                  {/* Dropoff */}
                  <LocationAutocomplete
                    label="Destino Final"
                    icon={Flag}
                    color="text-red-600"
                    value={searchContext?.dropoff || ""}
                    onChange={(v) => setSearchContext(prev => prev ? { ...prev, dropoff: v } : null)}
                    onSelect={(v, lat, lng) => handleUpdateRoute('dropoff', v, (lat && lng) ? [lat, lng] : undefined)}
                    placeholder="Local de destino"
                    inputClassName="h-12 text-base border-gray-300 rounded-none bg-slate-50/50"
                    showMap={isTransfer}
                  />

                  {isRecalculating && (
                    <div className="flex items-center gap-3 p-4 bg-blue-50 border border-blue-100 rounded-none animate-pulse">
                      <Loader2 className="h-5 w-5 animate-spin text-[#003580]" />
                      <div className="flex flex-col">
                        <span className="text-sm font-black text-[#003580] uppercase tracking-tighter">A Recalcular Rota...</span>
                        <span className="text-[10px] font-bold text-blue-600">Atualizando distância (KM) e preço total</span>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Profile/Billing Info */}
            <div className="bg-white rounded-none p-7 shadow-sm border border-gray-100">
              <h2 className="text-xl font-bold text-gray-900 mb-6 flex items-center gap-3">
                <span className="bg-[#003580] text-white w-9 h-9 rounded-none flex items-center justify-center text-sm font-bold">
                  2
                </span>
                Dados da Faturação
              </h2>

              <div className="space-y-7">


                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  <div className="space-y-2">
                    <Label className="text-base font-bold text-gray-700">
                      Primeiro Nome <span className="text-red-500">*</span>
                    </Label>
                    <Input
                      value={formData.firstName}
                      onChange={(e) =>
                        setFormData({ ...formData, firstName: e.target.value })
                      }
                      onBlur={saveFormDataToSession}
                      className="h-13 text-base border-gray-300 rounded-none"
                      placeholder="Primeiro nome"
                      name="firstName"
                      autoComplete="given-name"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-base font-bold text-gray-700">
                      Último Nome <span className="text-red-500">*</span>
                    </Label>
                    <Input
                      value={formData.lastName}
                      onChange={(e) =>
                        setFormData({ ...formData, lastName: e.target.value })
                      }
                      onBlur={saveFormDataToSession}
                      className="h-13 text-base border-gray-300 rounded-none"
                      placeholder="Último nome"
                      name="lastName"
                      autoComplete="family-name"
                    />
                  </div>
                  <div className="flex gap-6 items-end">
                    <div className="flex flex-col w-full">
                      <Label className="text-base font-bold text-gray-700 mb-2">
                        Telefone <span className="text-red-500">*</span>
                      </Label>
                      <Input
                        value={formData.phone}
                        onChange={(e) =>
                          setFormData({ ...formData, phone: e.target.value })
                        }
                        className="h-13 text-base border-gray-300 rounded-none"
                        onBlur={saveFormDataToSession}
                        placeholder="9..."
                        name="phone"
                        autoComplete="tel"
                      />
                    </div>
                  </div>
                  <div className="space-y-2 md:col-span-2">
                    <Label className="text-base font-bold text-gray-700">
                      Email <span className="text-red-500">*</span>
                    </Label>
                    <div className="relative">
                      <Input
                        value={formData.email}
                        onChange={(e) =>
                          setFormData({ ...formData, email: e.target.value })
                        }
                        onBlur={() => {
                          handleEmailBlur();
                          saveFormDataToSession();
                        }}
                        className={cn(
                          "h-13 text-base border-gray-300 rounded-none pr-10",
                          isRegistered && "border-blue-400 bg-blue-50/20"
                        )}
                        placeholder="examplo@email.com"
                        name="email"
                        autoComplete="email"
                      />
                      {isCheckingEmail && (
                        <div className="absolute right-3 top-1/2 -translate-y-1/2">
                          <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
                        </div>
                      )}
                    </div>
                    {isEmailChecked && isRegistered && (
                      <div className="mt-2 p-3 bg-blue-50 border border-blue-100 flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2">
                          <Check className="h-4 w-4 text-blue-600" />
                          <span className="text-[11px] font-bold text-blue-800">
                            Já possui uma conta connosco.
                          </span>
                        </div>
                        <LoginDialog
                          trigger={
                            <Button variant="link" className="h-auto p-0 text-xs font-black text-[#003580] hover:underline">
                              FAZER LOGIN
                            </Button>
                          }
                        />
                      </div>
                    )}
                  </div>
                </div>
                {/* NIF FIELD */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mt-5">
                  <div className="space-y-2 md:col-span-2">
                    <Label className="text-base font-bold text-gray-700">
                      NIF (Número de Identificação Fiscal)
                    </Label>
                    <Input
                      value={formData.nif}
                      onChange={(e) => setFormData({ ...formData, nif: e.target.value })}
                      className="h-13 text-base border-gray-300 rounded-none"
                      onBlur={saveFormDataToSession}
                      placeholder="NIF para faturação"
                      name="nif"
                      autoComplete="tax-id"
                    />
                  </div>
                </div>
              </div>
            </div>

            {!hasProfessionalDriver && (
              <div className="bg-white rounded-none p-7 shadow-sm border border-gray-100">
                <h2 className="text-xl font-bold text-gray-900 mb-6 flex items-center gap-3">
                  <span className="bg-[#003580] text-white w-9 h-9 rounded-none flex items-center justify-center text-sm font-bold">
                    3
                  </span>
                  Informação do Condutor
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  <div className="space-y-2">
                    <Label className="text-base font-bold text-gray-700">
                      Primeiro Nome <span className="text-red-500">*</span>
                    </Label>
                    <Input
                      value={formData.firstName}
                      onChange={(e) =>
                        setFormData({ ...formData, firstName: e.target.value })
                      }
                      className="h-13 text-base border-gray-300 rounded-none"
                      placeholder="João"
                      name="driverFirstName"
                      autoComplete="given-name"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-base font-bold text-gray-700">
                      Apelido <span className="text-red-500">*</span>
                    </Label>
                    <Input
                      value={formData.lastName}
                      onChange={(e) =>
                        setFormData({ ...formData, lastName: e.target.value })
                      }
                      className="h-13 text-base border-gray-300 rounded-none"
                      onBlur={saveFormDataToSession}
                      placeholder="Silva"
                      name="driverLastName"
                      autoComplete="family-name"
                    />
                  </div>
                  <div className="md:col-span-2 space-y-2">
                    <Label className="text-base font-bold text-gray-700">
                      Carta de Condução <span className="text-red-500">*</span>
                    </Label>
                    <Input
                      value={formData.drivingLicense}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          drivingLicense: e.target.value,
                        })
                      }
                      onBlur={saveFormDataToSession}
                      className="h-13 text-base border-gray-300"
                      placeholder="Nº da Carta"
                    />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Right Column - Summary */}
          <aside className="space-y-6">
            {/* Extras já vêm incluídos com o veículo - não precisa de seleção */}

            <div className="bg-white rounded-none p-5 shadow-xl border border-blue-50 sticky top-24">
              <h4 className="text-xs font-bold text-[#003580] tracking-widest mb-4 pb-2 border-b border-gray-100">
                Resumo da Reserva
              </h4>

              <div className="flex gap-4 mb-6 border-b border-gray-100 pb-5">
                <div className="flex flex-col gap-1">
                  <span className="text-[9px] font-bold text-gray-400">
                    Levantamento
                  </span>
                  <span className="font-bold text-gray-900 text-[10px] md:text-xs">
                    {searchContext?.from || searchContext?.date
                      ? format(parseISO(searchContext.from || searchContext.date!), "dd MMM yyyy", { locale: pt })
                      : "---"}
                  </span>
                  <span className="text-[10px] text-gray-500">
                    {searchContext?.from || searchContext?.date
                      ? format(parseISO(searchContext.from || searchContext.date!), "HH:mm")
                      : "10:00"}
                  </span>
                </div>
                <div className="flex-1 flex items-center justify-center">
                  <ChevronRight className="h-4 w-4 text-gray-300" />
                </div>
                <div className="flex flex-col gap-1 text-right">
                  <span className="text-[9px] font-bold text-gray-400">
                    Devolução
                  </span>
                  <span className="font-bold text-gray-900 text-[10px] md:text-xs">
                    {isTransfer
                      ? (searchContext?.date ? format(parseISO(searchContext.date), "dd MMM yyyy", { locale: pt }) : "---")
                      : (searchContext?.to ? format(parseISO(searchContext.to), "dd MMM yyyy", { locale: pt }) : "---")}
                  </span>
                  <span className="text-[10px] text-gray-500">
                    {isTransfer
                      ? (searchContext?.date ? format(parseISO(searchContext.date), "HH:mm") : "10:00")
                      : (searchContext?.to ? format(parseISO(searchContext.to), "HH:mm") : "10:00")}
                  </span>
                </div>
              </div>

              {isTransfer && (
                <div className="mb-6 p-4 bg-blue-50/30 border border-blue-100 rounded-none space-y-3 transition-all hover:bg-blue-50/50">
                  <div className="flex items-start gap-3">
                    <div className="flex flex-col items-center gap-1 mt-1">
                      <div className="w-2.5 h-2.5 rounded-full border-2 border-green-500 bg-white"></div>
                      <div className="w-0.5 h-full bg-gray-200 min-h-[10px]"></div>
                    </div>
                    <div className="flex flex-col">
                      <span className="text-[9px] font-black text-green-600 uppercase tracking-widest">Partida</span>
                      <span className="text-[11px] font-bold text-gray-800 line-clamp-1">{searchContext?.pickup}</span>
                    </div>
                  </div>
                  {(searchContext?.stops || []).map((stop: string, i: number) => (
                    <div key={i} className="flex items-start gap-3">
                      <div className="flex flex-col items-center gap-1 mt-1">
                        <div className="w-2.5 h-2.5 rounded-full border-2 border-amber-500 bg-white"></div>
                        <div className="w-0.5 h-full bg-gray-200 min-h-[10px]"></div>
                      </div>
                      <div className="flex flex-col">
                        <span className="text-[9px] font-black text-amber-600 uppercase tracking-widest">Paragem {i + 1}</span>
                        <span className="text-[11px] font-bold text-gray-700 line-clamp-1">{stop}</span>
                      </div>
                    </div>
                  ))}
                  <div className="flex items-start gap-3">
                    <div className="mt-1">
                      <div className="w-2.5 h-2.5 rounded-full border-2 border-red-500 bg-white"></div>
                    </div>
                    <div className="flex flex-col">
                      <span className="text-[9px] font-black text-red-600 uppercase tracking-widest">Destino</span>
                      <span className="text-[11px] font-bold text-gray-800 line-clamp-1">{searchContext?.dropoff}</span>
                    </div>
                  </div>
                  <div className="pt-2 border-t border-blue-100 mt-2">
                    <div className="flex justify-between items-center text-[10px] font-bold text-blue-800">
                      <span>Distância Total</span>
                      <span>{cars[0] && cars[0].distance ? `${cars[0].distance} km` : "--- km"}</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Show pickup/dropoff for both transfer and rental */}
              {!isTransfer && searchContext?.pickup && (
                <div className="mb-6 p-4 bg-blue-50/30 border border-blue-100 rounded-none space-y-2 transition-all hover:bg-blue-50/50">
                  <div className="flex items-start gap-3">
                    <div className="flex flex-col items-center gap-1 mt-1">
                      <div className="w-2.5 h-2.5 rounded-full border-2 border-green-500 bg-white"></div>
                      <div className="w-0.5 h-full bg-gray-200 min-h-[10px]"></div>
                    </div>
                    <div className="flex flex-col">
                      <span className="text-[9px] font-black text-green-600 uppercase tracking-widest">Partida</span>
                      <span className="text-[11px] font-bold text-gray-800 line-clamp-1">{searchContext.pickup}</span>
                    </div>
                  </div>
                  {searchContext?.dropoff && (
                    <div className="flex items-start gap-3">
                      <div className="mt-1">
                        <div className="w-2.5 h-2.5 rounded-full border-2 border-red-500 bg-white"></div>
                      </div>
                      <div className="flex flex-col">
                        <span className="text-[9px] font-black text-red-600 uppercase tracking-widest">Destino</span>
                        <span className="text-[11px] font-bold text-gray-800 line-clamp-1">{searchContext.dropoff}</span>
                      </div>
                    </div>
                  )}
                </div>
              )}

              <div className="space-y-4">
                {cars.map((car) => {
                  return (
                    <div key={car.id} className="pb-3 border-b border-gray-50">
                      <div className="flex justify-between items-start mb-1 text-sm">
                        <span className="font-bold text-black">{car.name}</span>
                        <span className="font-black">
                          AOA {((car as any).baseTotal || 0).toLocaleString()}
                        </span>
                      </div>
                      <div className="text-[11px] text-gray-400 font-bold tracking-tight">
                        {currentType === "transfer"
                          ? "Serviço de Transfer"
                          : `Aluguer - ${rentalDays} ${rentalDays === 1 ? "dia" : "dias"}`}
                      </div>
                    </div>
                  );
                })}

                <AnimatePresence>
                  {cars.map((car) => {
                    const vehicleExtras = (car as any).extrasObjects || [];
                    const effectiveDays = (currentType === "transfer" || (car as any).billingType === "per_km") ? 1 : rentalDays;

                    return (
                      <div key={`extras-group-${car.id}`}>
                        {/* 1. Included Vehicle Extras */}
                        {vehicleExtras.map((ex: any) => {
                          const isPerDay = ex.per_day || ex.perDay;
                          const price = Number(ex.price || 0) * (isPerDay ? effectiveDays : 1);
                          if (price === 0) return null;

                          return (
                            <motion.div
                              {...{ className: "flex justify-between items-center text-[11px] font-bold py-1" } as any}
                              key={`included-${car.id}-${ex.id}`}
                              initial={{ opacity: 0, x: 10 }}
                              animate={{ opacity: 1, x: 0 }}
                            >
                              <div className="flex items-center gap-2">
                                <span className="w-1.5 h-1.5 rounded-none bg-blue-400"></span>
                                <span className="text-gray-600">
                                  {ex.name} (Incluído)
                                </span>
                              </div>
                              <span className="text-[#003580]">
                                AOA {price.toLocaleString()}
                              </span>
                            </motion.div>
                          );
                        })}

                        {/* Todos os extras já estão incluídos acima - não há seleção adicional */}
                      </div>
                    );
                  })}
                </AnimatePresence>

                <div className="mt-6 pt-4 border-t-2 border-dashed border-gray-100">
                  <div className="flex justify-between items-center text-black">
                    <span className="text-sm font-bold tracking-tight">
                      Preço Total
                    </span>
                    <span className="text-lg font-bold">
                      AOA {finalTotal.toLocaleString("pt-AO")}
                    </span>
                  </div>
                  <p className="text-[10px] text-gray-400 font-medium mt-2">
                    * Taxas e impostos inclusos no valor total.
                  </p>
                </div>

                <Button
                  className="w-full h-14 bg-[#003580] hover:bg-black text-white font-bold mt-6 rounded-none border-none transition-all active:scale-95"
                  loading={isNavigating || isRecalculating}
                  disabled={isNavigating || isRecalculating}
                  onClick={async () => {
                    setIsNavigating(true);
                    try {
                      const allIds = cars.map((c) => c.id).join(",");

                      // Merge searchContext with witransfer_last_search to ensure all fields are preserved
                      let completeSearchContext = { ...searchContext };
                      try {
                        const lastSearchRaw = sessionStorage.getItem("witransfer_last_search");
                        if (lastSearchRaw) {
                          const lastSearch = JSON.parse(lastSearchRaw);
                          completeSearchContext = { ...lastSearch, ...searchContext };
                        }
                      } catch (e) {
                        console.warn("Failed to merge with witransfer_last_search:", e);
                      }

                      const checkoutPayload = {
                        carIds: cars.map((c) => c.id),
                        search: completeSearchContext,
                        searchContext: completeSearchContext, // Keep both for compatibility
                        customer: {
                          firstName:
                            formData.firstName ||
                            formData.billingName?.split(" ")[0] ||
                            "",
                          lastName:
                            formData.lastName ||
                            formData.billingName
                              ?.split(" ")
                              .slice(1)
                              .join(" ") ||
                            "",
                          email: formData.email,
                          phone: formData.phone,
                          ddi: formData.ddi,
                          billingType: formData.billingType,
                          documentId: formData.documentId,
                          drivingLicense: formData.drivingLicense,
                          billingName: formData.billingName,
                          nif: formData.nif,
                          address: formData.address,
                        },
                        firstName:
                          formData.firstName ||
                          formData.billingName?.split(" ")[0] ||
                          "",
                        lastName:
                          formData.lastName ||
                          formData.billingName
                            ?.split(" ")
                            .slice(1)
                            .join(" ") ||
                          "",
                        email: formData.email,
                        phone: `${formData.ddi} ${formData.phone}`,
                        billingType: formData.billingType,
                        nif: formData.nif,
                        billingName: formData.billingName,
                        drivingLicense: formData.drivingLicense,
                        // Preserve pricing summaries
                        summaries: cars.map(c => {
                          const perUnit = (c as any).pricePerUnit ?? c.price;
                          const extrasTotal = (c as any).extrasTotal ?? 0;
                          const basePriceTotal = (c as any).baseTotal ?? (c.price * rentalDays); // Assuming 'rentalDays' is the 'days' variable
                          const displayTotal = (c as any).totalPrice ?? (basePriceTotal + extrasTotal);
                          return {
                            id: c.id,
                            perUnit,
                            extrasTotal,
                            basePriceTotal,
                            displayTotal,
                            totalPrice: (c as any).totalPrice, // Keep original if needed, or remove
                            baseTotal: (c as any).baseTotal,   // Keep original if needed, or remove
                          };
                        })
                      };

                      // 1. Salvar novo draft
                      const localId = `draft_checkout_${Date.now()}`;
                      try {
                        sessionStorage.setItem(localId, JSON.stringify(checkoutPayload));
                        sessionStorage.setItem("witransfer_last_draft", JSON.stringify(checkoutPayload));
                      } catch (e) { }

                      // 2. Usar ID local para navegação (persistência via sessionStorage)
                      const finalDraftId = localId;

                      const params = new URLSearchParams();
                      params.set("did", finalDraftId);

                      const toastMessage = isRegistered
                        ? "Conta Witransfer identificada!"
                        : "Pré-registo confirmado!";

                      const toastDescription = isRegistered
                        ? "A redirecionar para pagamento seguro..."
                        : "A sua conta será criada no próximo passo.";

                      toast.success(toastMessage, {
                        description: toastDescription,
                      });

                      await new Promise(resolve => setTimeout(resolve, 1500));

                      router.push(`/booking/checkout/${allIds}?${params.toString()}`);
                      // We don't set isNavigating(false) here to maintain loading state until page unmounts
                    } catch (error) {
                      console.error("Erro ao processar checkout:", error);
                      setIsNavigating(false);
                      toast.error("Ocorreu um erro ao preparar o checkout.");
                    }
                  }}
                >
                  <div className="flex flex-col items-center">
                    <span className="text-[10px] uppercase font-black opacity-70">
                      {isNavigating ? "A processar..." : isRecalculating ? "A calcular..." : "Finalizar Reserva"}
                    </span>
                    <span className="text-base">AOA {finalTotal.toLocaleString("pt-AO")}</span>
                  </div>
                </Button>
              </div>
            </div>
          </aside>
        </div>
      </main>
    </div>
  );
}
