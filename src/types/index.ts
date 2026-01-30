/**
 * WITRANSFER DEFINITIVE TYPES V5
 * Fully aligned with DB Schema V5 and Frontend Forms
 */

// ===================================
// SHARED
// ===================================
export type { ActionResult, ApiResponse, ServerActionResult } from "./action-result";
export { 
    createSuccessResult, 
    createErrorResult, 
    fromError, 
    isSuccess, 
    isError, 
    getResultData, 
    getErrorMessage 
} from "./action-result";

// ===================================
// PARTNERS (Empresas)
// ===================================
export interface PartnerFormData {
    // Identity
    id?: string;
    nome: string; // name
    nomeEmpresa?: string; // name (alias)
    nomeComercial?: string; // name (alias)
    legalName?: string;
    nif?: string;
    tipo: "empresa" | "individual";

    // Contacts
    email: string;
    telefonePrincipal?: string;
    telefoneAlternativo?: string;
    whatsapp?: string;
    nomeResponsavel?: string; // manager_name
    website?: string;

    // Address
    provincia?: string; // address_province
    municipio?: string; // address_city
    bairro?: string; // address_street
    rua?: string;
    numeroPorta?: string;
    codigoPostal?: string;

    // Config
    servicos?: string[];
    commissionRate?: number;
    tipoRemuneracao?: "percentual" | "fixo";
    valorRemuneracao?: string;

    // Assets
    avatarUrl?: string;
    logo?: any; // File or string
    documentUrl?: string;

    // Meta
    status?: "pending" | "active" | "suspended" | "rejected";
    isVerified?: boolean;
    parceiroVerificado?: boolean; // Form compatibility alias
    registroComercial?: string; // Form compatibility
    createdAt?: string;

    // Extended Registration Fields
    cargo?: string; // Job Title of the contact person
    objetivo?: string; // Goal for becoming a partner
    areaAtividade?: string; // Main activity area
    tamanhoEmpresa?: string; // "1 a 3", "4 a 9", etc.
    setoresAtuacao?: string[]; // Array of sectors
    mercadosAtuacao?: string[]; // Array of markets (countries)
    pais?: string;
    distrito?: string; // Maps to or used alongside provincia
    aceitouPolitica?: boolean;

    // Legacy/Form Compatibility
    password?: string;
    confirmPassword?: string;
    role?: string;
}

export type Partner = PartnerFormData & { id: string };

// ===================================
// TEAM & CLIENTS (Team, Staff, Clients)
// ===================================
export type UserRole = "ADMIN" | "PARTNER" | "PARTNER_ADMIN" | "PARTNER_STAFF" | "DRIVER" | "CLIENT";
export type MemberStatus = "online" | "offline" | "busy";

export interface User {
    id: string;
    email: string;
    full_name: string;
    name?: string; // Session display name
    nickname?: string;
    avatar_url?: string;
    avatarUrl?: string; // Session avatar
    phone?: string;
    phone_alt?: string;
    role: UserRole;
    sub_role?: string;

    // Links
    partner_id?: string;
    partnerId?: string; // Session partner id
    partnerName?: string;
    partnerStatus?: string;
    isVerified?: boolean;

    // Team Details
    license_number?: string;
    license_category?: string;
    license_expiry?: string;
    status?: MemberStatus;

    is_active: boolean;
    created_at: string;
}

export type TeamMember = User;

export interface Client {
    id: string;
    name: string;
    email: string;
    phone?: string;
    status: "active" | "inactive";
    customerType?: string;
    lastBookingDate?: string;
    activeBookings?: number;
    createdAt?: string;
}

// Form Data for Team Member Creation
export interface TeamMemberFormData {
    id?: string;
    // Personal
    name: string;
    nickName?: string;
    email: string;
    telefone: string;
    telefoneAlternativo?: string;
    dateOfBirth?: string;
    gender?: string;
    nacionalidade?: string;
    nif?: string;
    numeroDocumento?: string; // BI
    fotoPerfil?: string;

    // Address
    address?: string;
    city?: string; // address_city
    province?: string; // address_province

    // Professional
    role: "motorista" | "atendente" | "gestor_financas" | "manager" | "attendant" | "finance_manager";
    partnerId?: string; // partner_id
    vehicleId?: string; // current assigned vehicle
    status?: MemberStatus;
    startDate?: string;

    // License
    cartaConducao?: string;
    dataEmissaoCarta?: string;
    dataValidadeCarta?: string;
    cartaProfissional?: boolean;

    // Skills
    experienciaAnos?: number;
    idiomasFalados?: string[];
    disponibilidade?: string;

    // Access Credentials (for non-driver roles)
    username?: string;
    password?: string;
}

export type TeamMemberData = TeamMemberFormData; // Alias

// ===================================
// VEHICLES
// ===================================
export interface VehicleFormData {
    id?: string;
    partnerId?: string; // previously companyId

    // Basic
    brand: string;
    model: string;
    licensePlate: string;
    year: number;
    color?: string;
    category?: string;
    services?: string[];
    status?: string;
    image_url?: string; // image_url
    image?: string; // mapped from image_url
    imageUrl?: string; // mapped from image_url
    extras?: string[]; // IDs dos extras associados
    perDay?: boolean;
    availableFor?: "rental" | "transfer" | "both" | string;

    // Tech
    vin?: string;
    engineNumber?: string;
    fuelType?: string;
    transmission?: string;
    potency?: string;
    displacement?: string;
    mileage?: number;

    // Condition
    condition?: string;
    conditionLevel?: string;
    lastService?: string;
    nextService?: string;

    // Docs
    insuranceCompany?: string;
    insurancePolicy?: string;
    insuranceExpiry?: string;
    inspectionLast?: string;
    inspectionExpiry?: string;

    // Features
    seats?: number;
    doors?: number;
    luggageCapacity?: number;
    smallLuggageCapacity?: number;
    hasAC?: boolean;
    hasABS?: boolean;
    hasAirbags?: boolean;
    hasLSD?: boolean;
    hasEB?: boolean;

    // Assignment
    memberId?: string;
    extrasList?: Extra[];
}

export type Vehicle = VehicleFormData & {
    id: string;
    memberName?: string;
    categoryName?: string;
    createdAt?: string;
    updatedAt?: string;
};

export type Viatura = Vehicle; // Alias

// ===================================
// BOOKINGS
// ===================================
export interface Booking {
    id: string;
    code?: string;
    serviceType: "transfer" | "rental";

    partnerId?: string;
    clientId?: string;
    memberId?: string;
    vehicleId?: string;

    pickupAddress: string;
    dropoffAddress?: string;
    stops?: string[]; // Intermediate stops for transfers
    startTime: string;
    endTime?: string;

    totalPrice: number;
    status: "pending" | "confirmed" | "completed" | "cancelled" | "canceled";

    client?: {
        name: string;
        email: string;
        phone?: string;
    };

    createdAt: string;
}

export interface BookingFilter {
    type?: "rental" | "transfer";
    status?: string;
    startDate?: string;
    endDate?: string;
}

// ===================================
// UI / UTILS
// ===================================
export interface NavigationItem {
    label: string;
    icon: any;
    href?: string;
    roles?: string[];
    forbiddenSubRoles?: string[];
    children?: NavigationItem[];
}

export interface DashboardStats {
    revenue: number;
    trips: number;
    activeMembers: number;
    activeVehicles: number;
}

// ===================================
// SEARCH & SYSTEM
// ===================================

export interface SearchFilters {
    pickup?: string;
    pickupCoords?: [number, number];
    dropoff?: string;
    dropoffCoords?: [number, number];
    stops?: string[]; // Intermediate waypoints
    stopsCoords?: ([number, number] | null)[];
    from?: string;
    to?: string;
    time1?: string;
    time2?: string;
    passengers?: number | string;
    luggage?: number | string;
    type?: "rental" | "transfer";
    categories?: string[];
    loc?: string[];
    sup?: string[];
    trans?: string[];
    seats?: string[];
    spec?: string[];
    extras?: string[];
    mileage?: string[];
    price_range?: string[];
    pol?: string[];
    sortBy?: string;
    limit?: number;
    offset?: number;
    ids?: string[];
    date?: string;
    score?: string[];
    pay?: string[];
    electric?: string[];
    fuel?: string[];
    deposit?: string[];
}

export interface Supplier {
    id: string;
    name: string;
    logo?: string;
}

export interface Category {
    id: string;
    name: string;
    label?: string;
    icon?: string;
}

export interface Service {
    id: string;
    partnerId?: string;
    name: "Transfer" | "Rental" | string;
    description?: string;
    billingType: "per_km" | "per_day" | "fixed" | "per_hour";
    includedQuantity: number;
    extraQuantityPrice?: number;
    isActive: boolean;
    createdAt?: string;
}

export interface ServiceFormData {
    id?: string;
    name: string;
    description?: string;
    billingType: string;
    includedQuantity: number;
    isActive: boolean;
}

export interface RecommendationInfo {
    needsMultiple: boolean;
    totalPassengers: number;
    totalLuggage: number;
    vehiclesNeeded: number;
    maxSeatsPerVehicle: number;
    maxLuggagePerVehicle: number;
    message: string;
}

export interface Car extends Vehicle {
    price: number;
    name: string;
    luggage_big?: number;
    luggage_small?: number;
    pricePerKm?: number;
    pricePerUnit?: number;
    billingType?: string;
    distanceString?: string;
    includedServices?: string[];
    supplier?: string;
    supplierLogo?: string;
    locationName?: string;
    locationType?: string;
    type: string; // Category ID or name
    isRecommendedForMultiple?: boolean;
    capacityInfo?: {
        seats: number;
        luggage: number;
    };
    insurance?: {
        dailyPrice: number;
        name?: string;
    };
    luggage?: string;
    isPartialMatch?: boolean;
    extras?: string[];
    extrasObjects?: Extra[];
    perDay?: boolean;

    // Pricing (Calculated)
    totalPrice?: number;
    baseTotal?: number;
    extrasTotal?: number;
    distance?: number;
    isBusy?: boolean;
}

export interface SearchResponse {
    results: Car[];
    totalCount: number;
    facets: Record<string, Record<string, number>>;
    suppliers: Supplier[];
    recommendationInfo?: RecommendationInfo | null;
}

export interface SystemData {
    categories: Category[];
    services: Service[];
    extras: Extra[];
}

export interface Extra {
    id: string;
    name: string;
    description?: string;
    price: number;
    type: string;
    partnerId?: string;
    perDay?: boolean;
}
