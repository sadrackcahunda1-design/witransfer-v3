const ORS_API_KEY = process.env.ORS;

export interface LatLng {
    lat: number;
    lng: number;
}

export interface GeocodeResult {
    label: string;
    lat: number;
    lng: number;
    street?: string;
    number?: string;
    neighborhood?: string;
    city?: string;
    province?: string;
    layer?: string;
}

/**
 * Helper para fazer fetch com timeout garantido
 * Previne requisições travando indefinidamente
 */
async function fetchWithTimeout(url: string, options: RequestInit = {}, timeout = 10000) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
        console.warn(`[ORS] Timeout de ${timeout}ms atingido para ${url}`);
        controller.abort();
    }, timeout);

    try {
        const response = await fetch(url, {
            ...options,
            signal: controller.signal,
        });
        return response;
    } finally {
        clearTimeout(timeoutId);
    }
}

export async function orsGeocode(text: string): Promise<GeocodeResult[]> {
    if (!ORS_API_KEY) {
        console.warn("⚠️ ORS: API Key não configurada.");
        return [];
    }

    try {
        // Usamos o perfil de geocoding para Angola para máxima precisão local
        const url = `https://api.openrouteservice.org/geocode/search?api_key=${ORS_API_KEY}&text=${encodeURIComponent(text)}&boundary.country=AO&size=10&layers=address,venue,neighbourhood,locality`;
        const res = await fetchWithTimeout(url);

        if (!res.ok) {
            let errorDetails = "";
            try {
                const errorBody = await res.json();
                errorDetails = errorBody.error?.message || JSON.stringify(errorBody);
            } catch {
                errorDetails = await res.text();
            }

            if (res.status === 403 || res.status === 401) {
                console.error("[ORS-Geocode] API Key expirada ou inválida.", errorDetails);
            } else {
                console.error(`[ORS-Geocode] Erro ${res.status}:`, errorDetails);
            }
            return [];
        }

        const data = await res.json();
        return (data.features || []).map((f: any) => {
            const props = f.properties;
            return {
                label: props.label,
                lng: f.geometry.coordinates[0],
                lat: f.geometry.coordinates[1],
                street: props.street,
                number: props.housenumber,
                neighborhood: props.neighbourhood || props.quarter || props.suburb || props.district || props.borough,
                city: props.locality || props.city || props.county,
                province: props.region || props.state,
                layer: props.layer
            };
        });
    } catch (error: any) {
        if (error.name === 'AbortError') {
            console.error("⏱️ ORS Geocode: Timeout atingido.");
        } else {
            console.error("❌ ORS Geocode erro:", error);
        }
        return [];
    }
}

export async function orsReverseGeocode(lat: number, lng: number): Promise<{
    label: string;
    street?: string;
    name?: string;
    number?: string;
    neighborhood?: string;
    city?: string;
    province?: string;
    layer?: string;
} | null> {
    if (!ORS_API_KEY) {
        console.warn("[ORS] API Key não configurada para Reverse Geocode");
        return null;
    }

    try {
        const url = `https://api.openrouteservice.org/geocode/reverse?api_key=${ORS_API_KEY}&point.lat=${lat}&point.lon=${lng}&boundary.country=AO&size=1`;
        const res = await fetchWithTimeout(url, {}, 10000); // Timeout consistente de 10s

        if (!res.ok) return null;

        const data = await res.json();
        if (data.features && data.features.length > 0) {
            const props = data.features[0].properties;
            return {
                label: props.label,
                street: props.street,
                name: props.name,
                number: props.housenumber,
                neighborhood: props.neighbourhood || props.quarter || props.suburb || props.district || props.borough,
                city: props.locality || props.city || props.county,
                province: props.region || props.state,
                layer: props.layer
            };
        }
        return null;
    } catch (error) {
        console.error("❌ ORS Reverse Geocode erro:", error);
        return null;
    }
}

export async function orsDirections(waypoints: LatLng[]): Promise<{ distance: number; duration: number } | null> {
    if (!ORS_API_KEY) {
        console.warn("⚠️ ORS: API Key não configurada para Directions.");
        return null;
    }
    if (waypoints.length < 2) return null;

    try {
        const url = `https://api.openrouteservice.org/v2/directions/driving-car`;
        const body = {
            coordinates: waypoints.map(w => [w.lng, w.lat]),
            instructions: false,
            units: "m",
            preference: "fastest",
            radiuses: waypoints.map(() => 500), // CORRIGIDO: 500m radius para snap mais preciso
        };

        console.log(`[ORS-Directions] Solicitando rota para ${waypoints.length} pontos...`);

        // CORRIGIDO: ORS não usa Authorization header, chave vai na URL
        const res = await fetchWithTimeout(url, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                ...body,
                api_key: ORS_API_KEY, // Chave deve ir no body para POST
            }),
        }, 12000); // Timeout maior para rotas longas

        if (!res.ok) {
            const errorText = await res.text();
            console.error(`❌ ORS Directions falhou (Status ${res.status}):`, errorText);
            return null;
        }

        const data = await res.json();
        if (!data.routes || data.routes.length === 0) {
            console.warn("⚠️ ORS: Nenhuma rota encontrada para estas coordenadas.");
            return null;
        }

        const route = data.routes[0];

        // O summary contém a distância em metros e duração em segundos
        return {
            distance: route.summary.distance,
            duration: route.summary.duration,
        };
    } catch (error: any) {
        if (error.name === 'AbortError') {
            console.error("⏱️ ORS Directions: Timeout atingido ao calcular rota.");
        } else {
            console.error("❌ ORS Directions erro:", error);
        }
        return null;
    }
}
