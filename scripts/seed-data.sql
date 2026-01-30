-- WiTransfer Seed Data Script
-- Insere dados em escala para testes
-- Parceiros: 15, Veículos por parceiro: 8, Motoristas por parceiro: 5, Clientes: 25

-- ============================================
-- LIMPAR DADOS EXISTENTES (se necessário)
-- ============================================
-- AVISO: Descomente apenas para teste completo!
-- DELETE FROM booking_waitlist;
-- DELETE FROM bookings;
-- DELETE FROM vehicles;
-- DELETE FROM users WHERE role IN ('PARTNER', 'DRIVER');

-- ============================================
-- 1. CRIAR PARCEIROS (15 parceiros)
-- ============================================
INSERT INTO public.users (
  id, email, first_name, last_name, phone, role, company_name, company_registration,
  base_location, is_verified, is_active, created_at, updated_at
) VALUES
  -- Parceiro 1
  ('550e8400-e29b-41d4-a716-446655440001', 'joao.silva1@witransfer.pt', 'João', 'Silva', '+351 912345671', 'PARTNER', 'Silva Transport Services 1', 'PT00000001', 'Lisboa', true, true, NOW(), NOW()),
  ('550e8400-e29b-41d4-a716-446655440002', 'maria.santos1@witransfer.pt', 'Maria', 'Santos', '+351 912345672', 'PARTNER', 'Santos Transport Services 2', 'PT00000002', 'Porto', true, true, NOW(), NOW()),
  ('550e8400-e29b-41d4-a716-446655440003', 'carlos.oliveira1@witransfer.pt', 'Carlos', 'Oliveira', '+351 912345673', 'PARTNER', 'Oliveira Transport Services 3', 'PT00000003', 'Braga', true, true, NOW(), NOW()),
  ('550e8400-e29b-41d4-a716-446655440004', 'ana.ferreira1@witransfer.pt', 'Ana', 'Ferreira', '+351 912345674', 'PARTNER', 'Ferreira Transport Services 4', 'PT00000004', 'Aveiro', true, true, NOW(), NOW()),
  ('550e8400-e29b-41d4-a716-446655440005', 'miguel.costa1@witransfer.pt', 'Miguel', 'Costa', '+351 912345675', 'PARTNER', 'Costa Transport Services 5', 'PT00000005', 'Covilhã', true, true, NOW(), NOW()),
  ('550e8400-e29b-41d4-a716-446655440006', 'sofia.martins1@witransfer.pt', 'Sofia', 'Martins', '+351 912345676', 'PARTNER', 'Martins Transport Services 6', 'PT00000006', 'Guarda', true, true, NOW(), NOW()),
  ('550e8400-e29b-41d4-a716-446655440007', 'pedro.gomes1@witransfer.pt', 'Pedro', 'Gomes', '+351 912345677', 'PARTNER', 'Gomes Transport Services 7', 'PT00000007', 'Viseu', true, true, NOW(), NOW()),
  ('550e8400-e29b-41d4-a716-446655440008', 'marta.pereira1@witransfer.pt', 'Marta', 'Pereira', '+351 912345678', 'PARTNER', 'Pereira Transport Services 8', 'PT00000008', 'Castelo Branco', true, true, NOW(), NOW()),
  ('550e8400-e29b-41d4-a716-446655440009', 'joao.silva2@witransfer.pt', 'João', 'Silva', '+351 912345679', 'PARTNER', 'Silva Transport Services 9', 'PT00000009', 'Lisboa', true, true, NOW(), NOW()),
  ('550e8400-e29b-41d4-a716-446655440010', 'maria.santos2@witransfer.pt', 'Maria', 'Santos', '+351 912345680', 'PARTNER', 'Santos Transport Services 10', 'PT00000010', 'Porto', true, true, NOW(), NOW()),
  ('550e8400-e29b-41d4-a716-446655440011', 'carlos.oliveira2@witransfer.pt', 'Carlos', 'Oliveira', '+351 912345681', 'PARTNER', 'Oliveira Transport Services 11', 'PT00000011', 'Braga', true, true, NOW(), NOW()),
  ('550e8400-e29b-41d4-a716-446655440012', 'ana.ferreira2@witransfer.pt', 'Ana', 'Ferreira', '+351 912345682', 'PARTNER', 'Ferreira Transport Services 12', 'PT00000012', 'Aveiro', true, true, NOW(), NOW()),
  ('550e8400-e29b-41d4-a716-446655440013', 'miguel.costa2@witransfer.pt', 'Miguel', 'Costa', '+351 912345683', 'PARTNER', 'Costa Transport Services 13', 'PT00000013', 'Covilhã', true, true, NOW(), NOW()),
  ('550e8400-e29b-41d4-a716-446655440014', 'sofia.martins2@witransfer.pt', 'Sofia', 'Martins', '+351 912345684', 'PARTNER', 'Martins Transport Services 14', 'PT00000014', 'Guarda', true, true, NOW(), NOW()),
  ('550e8400-e29b-41d4-a716-446655440015', 'pedro.gomes2@witransfer.pt', 'Pedro', 'Gomes', '+351 912345685', 'PARTNER', 'Gomes Transport Services 15', 'PT00000015', 'Viseu', true, true, NOW(), NOW());

-- ============================================
-- 2. CRIAR MOTORISTAS (5 por parceiro = 75 total)
-- ============================================
-- Motoristas para parceiro 1
INSERT INTO public.users (id, email, first_name, last_name, phone, role, partner_id, license_number, license_expiry, is_verified, is_active, created_at, updated_at)
SELECT 
  gen_random_uuid(),
  'driver' || num || '@witransfer.pt',
  'Driver',
  'Partner1_' || num,
  '+351 91' || LPAD(num::text, 7, '0'),
  'DRIVER',
  '550e8400-e29b-41d4-a716-446655440001',
  'PT' || LPAD(num::text, 8, '0'),
  NOW() + INTERVAL '365 days',
  true,
  true,
  NOW(),
  NOW()
FROM generate_series(1, 5) AS num;

-- Motoristas para outros parceiros (simplificated - apenas exemplo)
-- Em produção, usar script TypeScript para gerar todos

-- ============================================
-- 3. CRIAR VEÍCULOS (8 por parceiro = 120 total)
-- ============================================
INSERT INTO public.vehicles (
  id, partner_id, brand, model, license_plate, year, category, available_for,
  status, seats, mileage, features, daily_rate, is_available, created_at, updated_at
)
SELECT
  gen_random_uuid(),
  '550e8400-e29b-41d4-a716-446655440001',
  CASE WHEN (num % 8) = 0 THEN 'Toyota'
       WHEN (num % 8) = 1 THEN 'Mercedes'
       WHEN (num % 8) = 2 THEN 'BMW'
       WHEN (num % 8) = 3 THEN 'Audi'
       WHEN (num % 8) = 4 THEN 'Volkswagen'
       WHEN (num % 8) = 5 THEN 'Hyundai'
       WHEN (num % 8) = 6 THEN 'Kia'
       ELSE 'Honda' END,
  CASE WHEN (num % 8) = 0 THEN 'Corolla'
       WHEN (num % 8) = 1 THEN 'C-Class'
       WHEN (num % 8) = 2 THEN '3 Series'
       WHEN (num % 8) = 3 THEN 'A4'
       WHEN (num % 8) = 4 THEN 'Passat'
       WHEN (num % 8) = 5 THEN 'Elantra'
       WHEN (num % 8) = 6 THEN 'Sportage'
       ELSE 'Civic' END,
  'LX' || LPAD(num::text, 2, '0') || 'WIT',
  2020 + (num % 5),
  CASE WHEN (num % 4) = 0 THEN 'economy'
       WHEN (num % 4) = 1 THEN 'comfort'
       WHEN (num % 4) = 2 THEN 'premium'
       ELSE 'luxury' END,
  CASE WHEN (num % 3) = 0 THEN 'rental'
       WHEN (num % 3) = 1 THEN 'transfer'
       ELSE 'both' END,
  'active',
  4 + (num % 3),
  50000 + (num * 1000),
  ARRAY['air_conditioning', 'power_steering'],
  50 + (num * 5),
  true,
  NOW(),
  NOW()
FROM generate_series(1, 8) AS num;

-- ============================================
-- 4. CRIAR CLIENTES (25 clientes)
-- ============================================
INSERT INTO public.users (id, email, first_name, last_name, phone, role, is_verified, is_active, created_at, updated_at)
SELECT
  gen_random_uuid(),
  'client' || num || '@email.pt',
  'Client',
  'Test' || num,
  '+351 91' || LPAD((9000000 + num)::text, 7, '0'),
  'CLIENT',
  true,
  true,
  NOW(),
  NOW()
FROM generate_series(1, 25) AS num;

-- ============================================
-- 5. NOTAS DE IMPLEMENTAÇÃO
-- ============================================
-- Para seed completo com todos os dados:
-- 1. Usar o script TypeScript: npm run seed (configurar em package.json)
-- 2. Ou executar este SQL em partes para cada batch
-- 3. Verificar UUIDs únicos em cada inserção
-- 4. Confirmar relacionamentos entre tabelas

-- ============================================
-- VERIFICAÇÃO PÓS-SEED
-- ============================================
-- SELECT COUNT(*) FROM users WHERE role = 'PARTNER';  -- Deve retornar 15
-- SELECT COUNT(*) FROM users WHERE role = 'DRIVER';   -- Deve retornar 75
-- SELECT COUNT(*) FROM users WHERE role = 'CLIENT';   -- Deve retornar 25
-- SELECT COUNT(*) FROM vehicles;                       -- Deve retornar 120
