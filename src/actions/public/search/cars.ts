"use server";

import { Car, SearchFilters, SearchResponse, Supplier, SystemData, Extra } from "@/types";
import { createPublicAction } from "@/middlewares/actions/action-factory";
import { supabase } from "@/lib/supabase";
import { revalidatePath } from "next/cache";
import {
  getCachedVehicles,
  getCachedVehicleClasses,
  getCachedExtras,
  getCachedServices,
  getCachedClassPrices,
  getCachedVehiclePrices,
  getConflictingBookings
} from "@/lib/cache";
import { orsGeocode, orsDirections } from "@/lib/ors";

function normalize(s: string) {
  if (!s) return "";
  return s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

// Helper to fetch core data from Supabase with caching
async function getBaseData() {
  const [vehicles, categories, extras, services, classPrices, vehiclePrices] = await Promise.all([
    getCachedVehicles(),
    getCachedVehicleClasses(),
    getCachedExtras(),
    getCachedServices(),
    getCachedClassPrices(),
    getCachedVehiclePrices(),
  ]);

  const cars = vehicles.map((v: any) => {
    const car: Car = {
      ...v,
      id: v.id,
      name: `${v.brand} ${v.model}`,
      brand: v.brand,
      model: v.model,
      licensePlate: v.license_plate,
      year: v.year,
      color: v.color,
      type: v.vehicle_class_id,
      category: v.vehicle_classes?.name,
      supplier: v.partners?.name,
      supplierLogo: v.partners?.avatar_url,
      locationName: `${v.partners?.address_province || ""}, ${v.partners?.address_city || ""}`.replace(/^, /, ""),
      locationType: "Agência",
      transmission: v.transmission,
      seats: v.seats || 4,
      doors: v.doors || 4,
      luggage: `${v.luggage_big || 0} Grandes, ${v.luggage_small || 0} Pequenas`,
      luggage_big: v.luggage_big || 0,
      luggage_small: v.luggage_small || 0,
      hasAC: v.has_ac,
      image: v.image_url,
      mileage: v.mileage ? String(v.mileage) : "0",
      price: 0,
      availableFor: "both",
      includedServices: [
        v.has_ac ? "AR-CONDICIONADO" : null,
        v.transmission === "automatic" ? "CÂMBIO AUTOMÁTICO" : null,
        "SEGURO BÁSICO INCLUSO"
      ].filter(Boolean),
      // insurance: no default insurance added here; partners may provide insurance via data
    } as any;

    // ONLY include extras that are explicitly linked to this vehicle in the DB
    const rawExtras = v.extras;
    let vehicleExtraIds: string[] = [];
    if (Array.isArray(rawExtras)) {
      vehicleExtraIds = rawExtras;
    } else if (typeof rawExtras === "string" && rawExtras.trim()) {
      try {
        const parsed = JSON.parse(rawExtras);
        if (Array.isArray(parsed)) vehicleExtraIds = parsed;
      } catch (e) {
        // leave as empty array
      }
    }



    (car as any).extras = vehicleExtraIds;

    // Handle Services strictly
    const rawServices = v.services;
    let vehicleServiceIds: string[] = [];
    if (Array.isArray(rawServices)) {
      vehicleServiceIds = rawServices;
    } else if (typeof rawServices === "string" && rawServices.trim()) {
      try {
        const parsed = JSON.parse(rawServices);
        if (Array.isArray(parsed)) vehicleServiceIds = parsed;
      } catch (e) { }
    }
    (car as any).services = vehicleServiceIds;

    // ONLY include extras that are explicitly linked to this vehicle in the DB
    const extrasObjects = (extras || []).filter((ex: any) => vehicleExtraIds.includes(ex.id));
    (car as any).extrasObjects = extrasObjects;

    return car;
  });



  return {
    cars,
    categories,
    extras,
    services,
    classPrices,
    vehiclePrices,
  };
}

async function getCoords(query: string): Promise<{ lat: number; lng: number } | null> {
  try {
    // Busca em paralelo para maior rapidez e redundância
    const [orsResults, nominatimResults] = await Promise.all([
      orsGeocode(query),
      fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=1&countrycodes=ao`, {
        headers: { "User-Agent": "WiTransfer-App" },
        next: { revalidate: 3600 }
      }).then(r => r.ok ? r.json() : []).catch(() => [])
    ]);

    // 1. Preferência para ORS (Geralmente mais preciso para moradas)
    if (orsResults && orsResults.length > 0) {
      console.log(`📍 [GEO] Coordenadas obtidas via ORS para: ${query}`);
      return {
        lat: orsResults[0].lat,
        lng: orsResults[0].lng
      };
    }

    // 2. Fallback para Nominatim
    if (nominatimResults && nominatimResults.length > 0) {
      console.log(`📍 [GEO] Fallback para Nominatim para: ${query}`);
      return {
        lat: parseFloat(nominatimResults[0].lat),
        lng: parseFloat(nominatimResults[0].lon)
      };
    }

    return null;
  } catch (e) {
    console.error("❌ [GEO] Erro crítico no Geocoding:", e);
    return null;
  }
}

async function calculateDistance(
  origin: string,
  destination: string,
  stops: string[] = [],
  originCoords?: [number, number],
  destCoords?: [number, number],
  stopsCoords?: ([number, number] | null)[]
): Promise<number> {
  try {
    const allWaypoints = [origin, ...stops, destination].filter(Boolean);
    console.log(`🗺️ [DISTANCE] Calculando rota: ${allWaypoints.join(" -> ")}`);

    // 1. Obter todas as coordenadas (usar as fornecidas ou buscar via Geocoding)
    let validCoords: { lat: number; lng: number }[] = [];

    // Se as coordenadas básicas foram passadas, montamos o array diretamente (mais rápido)
    if (originCoords && destCoords) {
      console.log("⚡ [DISTANCE] Usando coordenadas diretas fornecidas pelo cliente.");
      validCoords.push({ lat: originCoords[0], lng: originCoords[1] });

      // Adicionar paragens se existirem
      if (Array.isArray(stopsCoords)) {
        stopsCoords.forEach(c => {
          if (c) validCoords.push({ lat: c[0], lng: c[1] });
        });
      }

      validCoords.push({ lat: destCoords[0], lng: destCoords[1] });
    } else {
      // Fallback: Geocoding tradicional (lento)
      console.log("🐌 [DISTANCE] Coordenadas ausentes. Usando geocoding lento...");
      const coords = await Promise.all(allWaypoints.map(w => getCoords(w)));
      validCoords = coords.filter((c): c is { lat: number; lng: number } => c !== null);
    }

    if (validCoords.length < 2) {
      console.warn("⚠️ [DISTANCE] Coordenadas insuficientes para calcular rota real. Usando padrão.");
      return 30 + (stops.length * 10);
    }

    // 2. Usar ORS Directions
    const route = await orsDirections(validCoords);

    if (route) {
      const distanceInKm = parseFloat((route.distance / 1000).toFixed(1)) || 0.1;
      console.log(`✅ [DISTANCE] Distância total ORS: ${distanceInKm} km`);
      return distanceInKm;
    }

    // 3. Fallback to OSRM if ORS fails
    console.log(`📡 [DISTANCE] Fallback para OSRM...`);
    const coordsString = validCoords.map(c => `${c.lng},${c.lat}`).join(";");
    const osrmUrl = `http://router.project-osrm.org/route/v1/driving/${coordsString}?overview=false`;

    const osrmRes = await fetch(osrmUrl).then(r => r.json());

    if (osrmRes.code === "Ok" && osrmRes.routes && osrmRes.routes.length > 0) {
      const distanceInMeters = osrmRes.routes[0].distance;
      const distanceInKm = parseFloat((distanceInMeters / 1000).toFixed(1)) || 0.1;
      console.log(`✅ [DISTANCE] Distância total OSRM: ${distanceInKm} km`);
      return distanceInKm;
    }

    return 30 + (stops.length * 10);
  } catch (err) {
    console.error("❌ [DISTANCE] Erro ao calcular distância:", err);
    return 30 + (stops.length * 10);
  }
}

/**
 * REUSABLE PRICING LOGIC
 */
function calculateCarPricing(
  car: Car,
  searchType: string,
  diffDays: number,
  currentDistance: number,
  services: any[],
  classPrices: any[],
  vehiclePrices: any[],
  allExtras: any[] = [],
  selectedExtraIds: string[] = []
): any {
  const partnerId = (car as any).partner_id;
  const partnerService = services.find((s: any) => {
    const sName = s.name.toLowerCase();
    const sType = searchType.toLowerCase();
    const isMatch =
      (sType === "rental" && (sName.includes("rental") || sName.includes("aluguer") || s.billing_type === "per_day")) ||
      (sType === "transfer" && (sName.includes("transfer") || sName.includes("transfers") || s.billing_type === "per_km"));

    // Check if service belongs to partner (or is global/template)
    const partnerMatch = (s.partner_id === partnerId || s.partner_id === null || !s.partner_id);

    return partnerMatch && isMatch;
  });

  if (!partnerService) return null;

  // RELAXED CHECK: If vehicle has services defined, check if this service is supported
  // If no services defined, allow all services (backward compatibility)
  const vehicleServices = Array.isArray((car as any).services) ? (car as any).services : [];
  if (vehicleServices.length > 0 && !vehicleServices.includes(partnerService.id)) {
    console.log(`⛔ [SERVICE-CHECK] Car ${car.id} does not support service ${partnerService.id} (${partnerService.name}). Linked services: [${vehicleServices}]`);
    return null;
  }

  const isDistanceBased = partnerService.billing_type === "per_km";
  let usedRate = 18000;

  const vsp = vehiclePrices.find((p: any) => p.service_id === partnerService.id && p.vehicle_id === car.id);
  const cp = classPrices.find((p: any) => p.service_id === partnerService.id && p.vehicle_class_id === car.type);

  usedRate = (vsp && vsp.price) ? Number(vsp.price) : (cp ? Number(cp.price) : 18000);

  const minQty = Number(partnerService.min_quantity || 1);
  let baseTotal = 0;
  if (isDistanceBased) {
    const unitsToCharge = Math.max(currentDistance || 0, minQty);
    baseTotal = Math.round(unitsToCharge * usedRate);
    console.log(`📏 [PRICING] Distance-based: actual=${currentDistance}km, min=${minQty}km, charging=${unitsToCharge}km`);
  } else {
    const unitsToCharge = Math.max(diffDays, minQty);
    baseTotal = Math.round(unitsToCharge * usedRate);
    console.log(`📅 [PRICING] Day-based: actual=${diffDays}d, min=${minQty}d, charging=${unitsToCharge}d`);
  }

  // Mandatory Extras Calculation (Include ALL available extras by default as per business rule)
  let extrasTotal = 0;

  // 1. Process all vehicle extras (available for this vehicle/partner)
  const vehicleExtras = (car as any).extrasObjects || [];
  for (const ex of vehicleExtras) {
    const exPrice = Number(ex.price || 0);
    const isPerDay = ex.per_day === true || ex.perDay === true;
    const calcPrice = isPerDay ? exPrice * diffDays : exPrice;

    // Add ALL available extras to total by default
    extrasTotal += calcPrice;
  }

  // 2. Include other extras explicitly selected by the user that might not be in vehicleExtras
  if (Array.isArray(selectedExtraIds) && selectedExtraIds.length > 0) {
    const selectedExtras = (allExtras || []).filter((e: any) => selectedExtraIds.includes(e.id));
    for (const ex of selectedExtras) {
      // skip if already processed in vehicleExtras
      if (vehicleExtras.find((ve: any) => ve.id === ex.id)) continue;

      const exPrice = Number(ex.price || 0);
      const isPerDay = ex.per_day === true || ex.perDay === true;
      const calcPrice = isPerDay ? exPrice * diffDays : exPrice;
      extrasTotal += calcPrice;
    }
  }

  const totalPrice = baseTotal + extrasTotal;
  try {
    console.log(`🔢 [PRICING] car=${car.id} partnerService=${partnerService?.id} billing=${partnerService?.billing_type} usedRate=${usedRate} baseTotal=${baseTotal} extrasTotal=${extrasTotal} totalPrice=${totalPrice}`);
    // Detailed extras listing for debugging
    try {
      const vehicleExtrasDebug = (vehicleExtras || []).map((e: any) => ({ id: e.id, name: e.name, price: e.price, per_day: e.per_day }));
      const selectedExtrasDebug = (allExtras || []).filter((e: any) => selectedExtraIds.includes(e.id)).map((e: any) => ({ id: e.id, name: e.name, price: e.price, per_day: e.per_day }));
      console.log(`🔢 [PRICING-DETAILS] car=${car.id} vehicleExtras=${JSON.stringify(vehicleExtrasDebug)} selectedExtras=${JSON.stringify(selectedExtrasDebug)}`);
    } catch (e) {
      // ignore extras debug errors
    }
  } catch (e) {
    // ignore logging errors
  }

  return {
    ...car,
    price: usedRate,
    totalPrice,
    baseTotal,
    extrasTotal,
    pricePerUnit: usedRate,
    billingType: partnerService.billing_type,
    distance: isDistanceBased ? currentDistance : undefined,
    distanceString: isDistanceBased ? `${currentDistance} km` : undefined,
  };
}

export async function searchCarsInternal(filters: SearchFilters): Promise<SearchResponse> {
  console.log('🔎 [SEARCH] Iniciando pesquisa com filtros:', JSON.stringify(filters));
  const { cars, categories, extras, services, classPrices, vehiclePrices } = await getBaseData();

  if (!filters.pickup) {
    console.log('⚠️ [SEARCH] Nenhum local de levantamento fornecido. Retornando resultados vazios.');
    return {
      results: [],
      totalCount: 0,
      facets: { cat: {}, trans: {}, sup: {}, seats: {} },
      suppliers: [],
    };
  }

  console.log(`📋 [SEARCH] Total de carros da base: ${cars.length}`);

  const searchType = filters.type || "rental";
  let results = cars.filter(car => {
    if (searchType === "rental") return car.availableFor === "rental" || car.availableFor === "both";
    return car.availableFor === "transfer" || car.availableFor === "both";
  });

  console.log(`📋 [SEARCH] Carros após filtro de tipo (${searchType}): ${results.length}`);

  const fromDate = filters.from ? new Date(filters.from) : new Date();
  let toDate = filters.to ? new Date(filters.to) : new Date(fromDate.getTime() + 3 * 86400000);

  if (searchType === "transfer") {
    // Para transfers, assumimos uma janela de 4 horas de ocupação para evitar conflitos próximos
    toDate = new Date(fromDate.getTime() + 4 * 3600000);
  }

  // 1.5 FILTRO DE DISPONIBILIDADE REAL + DISTANCE CALCULATION (PARALLEL)
  console.log(`📡 [AVAILABILITY] Verificando conflitos de agenda para: ${fromDate.toISOString()} até ${toDate.toISOString()}`);

  let currentDistance = 0;
  const [busyVehicleIds, calculatedDistance] = await Promise.all([
    getConflictingBookings(fromDate.toISOString(), toDate.toISOString()),
    searchType === "transfer" && filters.pickup && filters.dropoff
      ? calculateDistance(
        filters.pickup,
        filters.dropoff,
        filters.stops || [],
        filters.pickupCoords,
        filters.dropoffCoords,
        filters.stopsCoords
      )
      : Promise.resolve(0)
  ]);

  if (searchType === "transfer") {
    currentDistance = calculatedDistance;
  }

  // Marcamos os veículos como ocupados em vez de os removermos, para permitir lista de espera
  results = results.map(car => ({
    ...car,
    isBusy: busyVehicleIds.includes(car.id)
  }));

  // 1.7 Pontuação de Relevância e Ordenação
  if (filters.pickup && searchType === "rental") {
    const q = normalize(filters.pickup);
    const keywords = q.split(/[\s,]+/).filter(k => k.length > 2);

    const scoredResults = results.map(car => {
      let score = 0;
      const loc = normalize(car.locationName || "");
      const prov = normalize((car as any).partners?.address_province || "");
      const city = normalize((car as any).partners?.address_city || "");

      if (loc === q) score += 100;
      else if (loc.includes(q)) score += 80;

      keywords.forEach(k => {
        if (loc.includes(k)) score += 10;
        if (city.includes(k)) score += 10;
        if (prov.includes(k)) score += 10;
      });

      return { car, score };
    });

    console.log(`📊 [SEARCH] Rental scoring complete. Best score: ${Math.max(...scoredResults.map(s => s.score), 0)}`);

    // If we have scored results, we sort them. 
    // We only filter out score 0 if there are actually any matches > 0.
    // This provides a fallback so the user always sees something if the location match is weak.
    const hasMatches = scoredResults.some(item => item.score > 0);

    results = scoredResults
      .filter(item => hasMatches ? item.score > 0 : true)
      .sort((a, b) => {
        // 1. Disponibilidade primeiro (Recomendação implícita)
        if (a.car.isBusy && !b.car.isBusy) return 1;
        if (!a.car.isBusy && b.car.isBusy) return -1;
        // 2. Pontuação de relevância
        return b.score - a.score;
      })
      .map(item => item.car);
  } else {
    // Para Transfers ou sem pickup, ordenamos apenas por disponibilidade
    results = [...results].sort((a, b) => {
      if (a.isBusy && !b.isBusy) return 1;
      if (!a.isBusy && b.isBusy) return -1;
      return 0;
    });
  }

  // Filters (Location, Category, Trans, etc.)

  if (filters.categories && filters.categories.length > 0) {
    console.log(`🔎 [FILTER] Applying Category filter: ${filters.categories}`);
    results = results.filter(car => filters.categories!.includes(car.type));
    console.log(`   Running Total: ${results.length}`);
  }
  if (filters.trans && filters.trans.length > 0) {
    console.log(`🔎 [FILTER] Applying Transmission filter: ${filters.trans}`);
    results = results.filter(car => {
      const trans = car.transmission === "automatic" ? "automatico" : "manual";
      return filters.trans!.includes(trans);
    });
    console.log(`   Running Total: ${results.length}`);
  }
  if (filters.sup && filters.sup.length > 0) {
    console.log(`🔎 [FILTER] Applying Supplier filter: ${filters.sup}`);
    results = results.filter(car => filters.sup!.includes((car as any).partner_id));
    console.log(`   Running Total: ${results.length}`);
  }
  if (filters.seats && filters.seats.length > 0) {
    console.log(`🔎 [FILTER] Applying Seats filter: ${filters.seats}`);
    results = results.filter(car => {
      const s = car.seats || 0;
      if (filters.seats!.includes("6+") && s >= 6) return true;
      return filters.seats!.includes(String(s));
    });
    console.log(`   Running Total: ${results.length}`);
  }
  if (filters.extras && filters.extras.length > 0) {
    console.log(`🔎 [FILTER] Applying Extras filter: ${filters.extras}`);
    results = results.filter(car => {
      const carExtraIds = car.extras || [];
      const hasAllRequested = filters.extras!.every((requestedId: string) => carExtraIds.includes(requestedId));
      if (!hasAllRequested) console.log(`   ❌ Car ${car.id} rejected by extras filter. Has: [${carExtraIds}], Requested: [${filters.extras}]`);
      return hasAllRequested;
    });
    console.log(`   Running Total: ${results.length}`);
  }

  let recommendationInfo = null;
  if (searchType === "transfer") {
    const passengerCount = Number(filters.passengers || 0);
    const luggageCount = Number(filters.luggage || 0);
    if (passengerCount > 0) results = results.filter(car => (car.seats || 0) >= passengerCount);
    if (luggageCount > 0) results = results.filter(car => ((car.luggage_big || 0) + (car.luggage_small || 0)) >= luggageCount);

    if (results.length === 0 && (passengerCount > 4 || luggageCount > 4)) {
      recommendationInfo = {
        needsMultiple: true,
        message: "Para este volume de passageiros/bagagem, recomendamos a reserva de múltiplos veículos.",
        totalPassengers: passengerCount,
        totalLuggage: luggageCount,
        vehiclesNeeded: Math.max(Math.ceil(passengerCount / 4), Math.ceil(luggageCount / 4)),
        maxSeatsPerVehicle: 4,
        maxLuggagePerVehicle: 4
      };
      results = cars.filter(car => (car.availableFor === "transfer" || car.availableFor === "both"));
    }
  }

  // const fromDate = filters.from ? new Date(filters.from) : new Date(); // REMOVED DUPLICATE
  // const toDate = filters.to ? new Date(filters.to) : new Date(Date.now() + 3 * 86400000); // REMOVED DUPLICATE
  let diffDays = Math.ceil((toDate.getTime() - fromDate.getTime()) / (1000 * 3600 * 24)) || 1;
  if (searchType === "transfer") diffDays = 1;

  const baseResults: any[] = [];
  for (const car of results) {
    const pricedCar = calculateCarPricing(car, searchType, diffDays, currentDistance, services, classPrices, vehiclePrices, extras, filters?.extras || [] as any);
    if (pricedCar) {
      baseResults.push(pricedCar);
    } else {
      console.log(`❌ [PRICING] Car ${car.id} rejected by pricing/service check`);
    }
  }

  // Calculate Facets
  const facets: Record<string, Record<string, number>> = {
    cat: {},
    trans: {},
    sup: {},
    seats: {},
  };

  baseResults.forEach(car => {
    // Category facets
    const catId = car.type;
    if (catId) {
      facets.cat[catId] = (facets.cat[catId] || 0) + 1;
    }

    // Transmission facets
    const trans = car.transmission === "automatic" ? "automatico" : "manual";
    facets.trans[trans] = (facets.trans[trans] || 0) + 1;

    // Supplier facets
    const supId = car.partner_id;
    if (supId) {
      facets.sup[supId] = (facets.sup[supId] || 0) + 1;
    }

    // Seats facets
    const seats = String(car.seats);
    let seatKey = seats;
    if (Number(seats) >= 6) seatKey = "6+";
    facets.seats[seatKey] = (facets.seats[seatKey] || 0) + 1;

    // Extras facets
    const carExtras = car.extras || [];
    carExtras.forEach((exId: string) => {
      facets.extras = facets.extras || {};
      facets.extras[exId] = (facets.extras[exId] || 0) + 1;
    });
  });

  console.log(`🎉 [SEARCH] Retornando ${baseResults.length} resultados totais`);
  console.log(`📄 [SEARCH] Página atual: ${baseResults.slice(filters.offset || 0, (filters.offset || 0) + (filters.limit || 10)).length} resultados`);

  return {
    results: baseResults.slice(filters.offset || 0, (filters.offset || 0) + (filters.limit || 10)),
    totalCount: baseResults.length,
    facets,
    suppliers: [], // Could be populated if needed, but FilterSidebar uses baseData or facets
    recommendationInfo,
  };
}

export async function searchCars(filters: SearchFilters): Promise<SearchResponse> {
  return createPublicAction("SearchCars", async (f: SearchFilters) => await searchCarsInternal(f), filters);
}

export async function getSystemDataInternal() {
  const { categories, extras, services } = await getBaseData();
  return {
    categories: categories.map((c: any) => ({
      id: c.id,
      name: c.name,
      label: c.name,
      description: c.description,
      icon: c.icon
    })),
    extras: extras.map((e: any) => ({
      id: e.id,
      name: e.name,
      description: e.description,
      price: e.price,
      type: e.type,
      partnerId: e.partner_id,
      perDay: e.per_day,
    })),
    services,
  };
}

export async function getSystemData() {
  return createPublicAction("GetSystemData", async () => await getSystemDataInternal(), {});
}

export async function getCarById(id: string): Promise<Car | undefined> {
  return createPublicAction("GetCarById", async (carId: string) => {
    const { cars } = await getBaseData();
    return cars.find((c: any) => c.id === carId);
  }, id);
}

export async function getCarsByIds(ids: string[], searchContext?: SearchFilters): Promise<Car[]> {
  return createPublicAction("GetCarsByIds", async (carIds: string[]) => {
    const { cars, extras, services, classPrices, vehiclePrices } = await getBaseData();
    const filtered = cars.filter((c: any) => carIds.includes(c.id));

    if (!searchContext) return filtered;

    const searchType = searchContext.type || "rental";
    const fromDate = searchContext.from ? new Date(searchContext.from) : new Date();
    const toDate = searchContext.to ? new Date(searchContext.to) : new Date(Date.now() + 3 * 86400000);
    let diffDays = Math.ceil((toDate.getTime() - fromDate.getTime()) / (1000 * 3600 * 24)) || 1;
    if (searchType === "transfer") diffDays = 1;

    let distance = 30;
    if (searchType === "transfer" && searchContext.pickup && searchContext.dropoff) {
      distance = await calculateDistance(
        searchContext.pickup,
        searchContext.dropoff,
        searchContext.stops || [],
        searchContext.pickupCoords,
        searchContext.dropoffCoords,
        searchContext.stopsCoords
      );
    }

    return filtered.map(car => calculateCarPricing(car, searchType, diffDays, distance, services, classPrices, vehiclePrices, extras, (searchContext as any)?.extras || [])).filter(Boolean);
  }, ids);
}
