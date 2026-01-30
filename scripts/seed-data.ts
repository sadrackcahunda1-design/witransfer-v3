import { createClient } from "@supabase/supabase-js";
import { v4 as uuidv4 } from "uuid";
import * as bcrypt from "bcrypt";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseKey);

interface SeedConfig {
  partnersCount: number;
  vehiclesPerPartner: number;
  driversPerPartner: number;
  clientsCount: number;
  bookingsPerClient: number;
}

const CONFIG: SeedConfig = {
  partnersCount: 15, // 15 parceiros
  vehiclesPerPartner: 8, // 120 veículos total
  driversPerPartner: 5, // 75 motoristas total
  clientsCount: 25, // 25 clientes
  bookingsPerClient: 3, // 75 bookings total
};

// Dados realistas
const BRANDS = ["Toyota", "Mercedes", "BMW", "Audi", "Volkswagen", "Hyundai", "Kia", "Honda"];
const MODELS = ["Corolla", "Civic", "C-Class", "3 Series", "A4", "Passat", "Elantra", "Sportage"];
const CATEGORIES = ["economy", "comfort", "premium", "luxury"];
const SERVICE_TYPES = ["rental", "transfer", "both"];
const CITIES = [
  "Lisboa",
  "Porto",
  "Braga",
  "Aveiro",
  "Covilhã",
  "Guarda",
  "Viseu",
  "Castelo Branco",
];
const FIRST_NAMES = ["João", "Maria", "Carlos", "Ana", "Miguel", "Sofia", "Pedro", "Marta"];
const LAST_NAMES = ["Silva", "Santos", "Oliveira", "Ferreira", "Costa", "Martins", "Gomes", "Pereira"];

function generateEmail(firstName: string, lastName: string, index: number): string {
  return `${firstName.toLowerCase()}.${lastName.toLowerCase()}${index}@witransfer.pt`.replace(/\s/g, "");
}

async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

async function seedPartners() {
  console.log(`\n🏢 Criando ${CONFIG.partnersCount} parceiros...`);

  const partners = [];
  for (let i = 0; i < CONFIG.partnersCount; i++) {
    const firstName = FIRST_NAMES[Math.floor(Math.random() * FIRST_NAMES.length)];
    const lastName = LAST_NAMES[Math.floor(Math.random() * LAST_NAMES.length)];
    const email = generateEmail(firstName, lastName, i + 1);
    const city = CITIES[Math.floor(Math.random() * CITIES.length)];

    partners.push({
      id: uuidv4(),
      email,
      first_name: firstName,
      last_name: lastName,
      phone: `+351 ${Math.floor(200000000 + Math.random() * 800000000)}`,
      role: "PARTNER",
      company_name: `${firstName}'s Transport Services ${i + 1}`,
      company_registration: `PT${String(i + 1).padStart(8, "0")}`,
      base_location: city,
      is_verified: true,
      is_active: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
  }

  const { data, error } = await supabase.from("users").insert(partners).select();

  if (error) {
    console.error("❌ Erro ao criar parceiros:", error);
    return [];
  }

  console.log(`✅ ${data?.length || 0} parceiros criados`);
  return data || [];
}

async function seedVehicles(partners: any[]) {
  console.log(`\n🚗 Criando ${CONFIG.vehiclesPerPartner * partners.length} veículos...`);

  const vehicles = [];
  for (const partner of partners) {
    for (let i = 0; i < CONFIG.vehiclesPerPartner; i++) {
      const brand = BRANDS[Math.floor(Math.random() * BRANDS.length)];
      const model = MODELS[Math.floor(Math.random() * MODELS.length)];
      const category = CATEGORIES[Math.floor(Math.random() * CATEGORIES.length)];

      vehicles.push({
        id: uuidv4(),
        partner_id: partner.id,
        brand,
        model,
        license_plate: `${String(i + 1).padStart(2, "0")}-${Math.random().toString().slice(2, 7).toUpperCase()}-${Math.floor(Math.random() * 10)}`,
        year: 2020 + Math.floor(Math.random() * 5),
        category,
        available_for: SERVICE_TYPES[Math.floor(Math.random() * SERVICE_TYPES.length)],
        status: "active",
        seats: 4 + Math.floor(Math.random() * 3),
        mileage: Math.floor(Math.random() * 200000),
        features: ["air_conditioning", "power_steering", "automatic_transmission"].slice(
          0,
          2 + Math.floor(Math.random() * 2)
        ),
        daily_rate: 50 + Math.floor(Math.random() * 100),
        image: null,
        is_available: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
    }
  }

  const batchSize = 50;
  let inserted = 0;

  for (let i = 0; i < vehicles.length; i += batchSize) {
    const batch = vehicles.slice(i, i + batchSize);
    const { data, error } = await supabase.from("vehicles").insert(batch).select();

    if (error) {
      console.error(`❌ Erro ao criar veículos (batch ${Math.floor(i / batchSize) + 1}):`, error);
    } else {
      inserted += data?.length || 0;
    }
  }

  console.log(`✅ ${inserted} veículos criados`);
  return vehicles;
}

async function seedDrivers(partners: any[]) {
  console.log(`\n👨‍✈️ Criando ${CONFIG.driversPerPartner * partners.length} motoristas...`);

  const drivers = [];
  let driverIndex = 1;

  for (const partner of partners) {
    for (let i = 0; i < CONFIG.driversPerPartner; i++) {
      const firstName = FIRST_NAMES[Math.floor(Math.random() * FIRST_NAMES.length)];
      const lastName = LAST_NAMES[Math.floor(Math.random() * LAST_NAMES.length)];
      const email = generateEmail(firstName, lastName, driverIndex);

      drivers.push({
        id: uuidv4(),
        email,
        first_name: firstName,
        last_name: lastName,
        phone: `+351 ${Math.floor(900000000 + Math.random() * 99999999)}`,
        role: "DRIVER",
        partner_id: partner.id,
        license_number: `PT${Math.random().toString().slice(2, 11).toUpperCase()}`,
        license_expiry: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
        is_verified: true,
        is_active: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
      driverIndex++;
    }
  }

  const batchSize = 50;
  let inserted = 0;

  for (let i = 0; i < drivers.length; i += batchSize) {
    const batch = drivers.slice(i, i + batchSize);
    const { data, error } = await supabase.from("users").insert(batch).select();

    if (error) {
      console.error(`❌ Erro ao criar motoristas (batch ${Math.floor(i / batchSize) + 1}):`, error);
    } else {
      inserted += data?.length || 0;
    }
  }

  console.log(`✅ ${inserted} motoristas criados`);
  return drivers;
}

async function seedClients() {
  console.log(`\n👥 Criando ${CONFIG.clientsCount} clientes...`);

  const clients = [];
  for (let i = 0; i < CONFIG.clientsCount; i++) {
    const firstName = FIRST_NAMES[Math.floor(Math.random() * FIRST_NAMES.length)];
    const lastName = LAST_NAMES[Math.floor(Math.random() * LAST_NAMES.length)];
    const email = generateEmail(firstName, lastName, 100 + i);

    clients.push({
      id: uuidv4(),
      email,
      first_name: firstName,
      last_name: lastName,
      phone: `+351 ${Math.floor(910000000 + Math.random() * 89999999)}`,
      role: "CLIENT",
      is_verified: true,
      is_active: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
  }

  const { data, error } = await supabase.from("users").insert(clients).select();

  if (error) {
    console.error("❌ Erro ao criar clientes:", error);
    return [];
  }

  console.log(`✅ ${data?.length || 0} clientes criados`);
  return data || [];
}

async function seedBookings(clients: any[], vehicles: any[], drivers: any[]) {
  console.log(`\n📅 Criando ${CONFIG.bookingsPerClient * clients.length} reservas...`);

  const bookings = [];
  const cities = CITIES;

  for (const client of clients) {
    for (let i = 0; i < CONFIG.bookingsPerClient; i++) {
      const vehicle = vehicles[Math.floor(Math.random() * vehicles.length)];
      const driver = drivers.find((d) => d.partner_id === vehicle.partner_id) || drivers[0];
      const fromCity = cities[Math.floor(Math.random() * cities.length)];
      const toCity = cities[Math.floor(Math.random() * cities.length)];

      const startDate = new Date();
      startDate.setDate(startDate.getDate() + Math.floor(Math.random() * 30) + 1);
      const endDate = new Date(startDate);
      endDate.setDate(endDate.getDate() + Math.floor(Math.random() * 7) + 1);

      bookings.push({
        id: uuidv4(),
        client_id: client.id,
        vehicle_id: vehicle.id,
        driver_id: driver.id,
        partner_id: vehicle.partner_id,
        service_type: vehicle.available_for === "both" ? "rental" : vehicle.available_for,
        status: "confirmed",
        from_location: fromCity,
        to_location: toCity,
        start_date: startDate.toISOString(),
        end_date: endDate.toISOString(),
        total_price: Math.floor(Math.random() * 500) + 50,
        payment_status: "completed",
        notes: `Viagem de ${fromCity} para ${toCity}`,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
    }
  }

  const batchSize = 50;
  let inserted = 0;

  for (let i = 0; i < bookings.length; i += batchSize) {
    const batch = bookings.slice(i, i + batchSize);
    const { data, error } = await supabase.from("bookings").insert(batch).select();

    if (error) {
      console.error(`❌ Erro ao criar reservas (batch ${Math.floor(i / batchSize) + 1}):`, error);
    } else {
      inserted += data?.length || 0;
    }
  }

  console.log(`✅ ${inserted} reservas criadas`);
}

async function main() {
  try {
    console.log("🌱 Iniciando seed de dados em escala...\n");
    console.log(`Configuração:`);
    console.log(`  - Parceiros: ${CONFIG.partnersCount}`);
    console.log(`  - Veículos por parceiro: ${CONFIG.vehiclesPerPartner}`);
    console.log(`  - Motoristas por parceiro: ${CONFIG.driversPerPartner}`);
    console.log(`  - Clientes: ${CONFIG.clientsCount}`);
    console.log(`  - Reservas por cliente: ${CONFIG.bookingsPerClient}`);

    const partners = await seedPartners();
    const vehicles = await seedVehicles(partners);
    const drivers = await seedDrivers(partners);
    const clients = await seedClients();
    await seedBookings(clients, vehicles, drivers);

    console.log("\n✅ Seed completo com sucesso!");
    console.log("\nResumo de dados inseridos:");
    console.log(`  - Total de parceiros: ${partners.length}`);
    console.log(`  - Total de veículos: ${vehicles.length}`);
    console.log(`  - Total de motoristas: ${drivers.length}`);
    console.log(`  - Total de clientes: ${clients.length}`);
    console.log(`  - Total de reservas: ${CONFIG.bookingsPerClient * clients.length}`);
  } catch (error) {
    console.error("❌ Erro geral no seed:", error);
    process.exit(1);
  }
}

main();
