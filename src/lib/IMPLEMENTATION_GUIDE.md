# Guia de Implementação - WiTransfer v2

## Mudanças Implementadas

### 1. SEED COM DADOS EM ESCALA

**Arquivo**: `/scripts/seed-data.ts` e `/scripts/seed-data.sql`

**Dados Inseridos**:
- 15 parceiros
- 120 veículos (8 por parceiro)
- 75 motoristas (5 por parceiro)
- 25 clientes
- 75 bookings (3 por cliente)

**Como executar**:
```bash
# Opção 1: TypeScript (recomendado)
npm run seed

# Opção 2: SQL direto no Supabase
# Copiar e colar scripts/seed-data.sql no editor SQL
```

**Configuração no package.json**:
```json
{
  "scripts": {
    "seed": "ts-node scripts/seed-data.ts"
  }
}
```

---

### 2. VERIFICAÇÃO DE NOMES

**Status**: Verificado e correto
- Todos os arquivos usam "WiTransfer" (correto)
- Nenhuma instância de "Wiitransfer" encontrada
- Templates de email também corretos

---

### 3. CORREÇÕES DE LÓGICA

#### ORS.TS - Geolocalização
**Problemas Corrigidos**:
- ✅ Header "Authorization" removido (ORS usa query param)
- ✅ Timeout consistente 10s em todas as operações
- ✅ Radius de snap reduzido de 5km para 500m
- ✅ Tratamento de erro melhorado (loga body de erro)
- ✅ Log estruturado com `[ORS]` prefix

**Impacto**: Requisições à API ORS agora funcionam corretamente

#### LISTING-BOOKINGS - Realocação
**Problemas Corrigidos**:
- ✅ Partner ID não é mais sobrescrito
- ✅ Novo campo `reassigned_partner_id` rastreia realocação
- ✅ Lógica paralela para busca de recursos
- ✅ Status correto após realocação

**Impacto**: Auditoria de bookings muito melhor

---

### 4. MÁQUINA DE ESTADO

**Arquivo**: `/src/lib/booking-state-machine.ts`

Define estados válidos e transições permitidas:

```typescript
pending_assignment → assigned → confirmed → in_progress → completed
                  → pending_partner_acceptance → ...
                  → waiting_for_resources → ...
```

**Estados e Regras**:
| Estado | Cancelável | Realocável | Expira |
|--------|-----------|-----------|--------|
| pending_assignment | Sim | Não | 24h |
| assigned | Sim | Não | - |
| waiting_for_resources | Sim | Sim | 24h |
| in_progress | Não | Não | - |
| completed | Não | Não | - |

---

### 5. REGRAS DE NEGÓCIO

**Arquivo**: `/src/lib/business-rules.ts`

Define e implementa:
- **Preços**: Base €0.50/km, mínimo €10
- **Disponibilidade**: 30min antecedência, máx 180 dias
- **Cancelamento**: Reembolso grátis até 24h antes
- **Qualidade**: Rating mín 3.0 clientes, 3.5 parceiros

**Validações**:
```typescript
validateClientCanBook() // Verifica se cliente pode fazer booking
validatePartnerCanAccept() // Verifica se parceiro pode aceitar
calculateRefund() // Calcula % reembolso
validateBookingDateTime() // Valida data/hora
```

---

## Próximas Etapas

### 1. APLICAR NO BANCO
```sql
-- Scripts em /src/lib/SCHEMA_UPDATES_NEEDED.sql
ALTER TABLE bookings ADD COLUMN reassigned_partner_id UUID;
ALTER TABLE bookings ADD COLUMN reassignments_count INT DEFAULT 0;
ALTER TABLE bookings ADD COLUMN reassignment_reason TEXT;

CREATE INDEX idx_bookings_status ON bookings(status);
CREATE INDEX idx_bookings_partner_status ON bookings(partner_id, status);
```

### 2. USAR NOS ACTIONS
```typescript
import { isValidTransition, BOOKING_STATE_RULES } from "@/lib/booking-state-machine";
import { validateBookingDateTime, calculateRefund } from "@/lib/business-rules";

// Em cancelamento
if (!isValidTransition(current.status, "cancelled")) {
  throw new Error("Transição inválida");
}

// Em cancelamento, calcular reembolso
const refund = calculateRefund(booking.price, hoursBeforeBooking);
```

### 3. TESTAR WORKFLOWS
Ver `/src/lib/TESTING_GUIDE.md` para plano de testes completo.

---

## Estrutura de Arquivos

```
/src/lib/
├── booking-state-machine.ts   # Estados e transições de booking
├── business-rules.ts          # Regras de preço, cancelamento, etc
├── ors.ts                      # CORRIGIDO: Geolocalização
├── LOGIC_ANALYSIS.md          # Análise de problemas encontrados
└── IMPLEMENTATION_GUIDE.md    # Este arquivo

/scripts/
├── seed-data.ts               # Script TypeScript de seed
└── seed-data.sql              # Script SQL de seed
```

---

## Checklist de Implementação

- [ ] Executar seed com dados (`npm run seed`)
- [ ] Aplicar migrations SQL do schema
- [ ] Adicionar imports nos actions
- [ ] Testar transições de estado
- [ ] Validar cálculos de preço
- [ ] Testar fluxo de cancelamento
- [ ] Deploy em staging
- [ ] Testes de integração
- [ ] Deploy em produção

---

## Suporte

Dúvidas sobre:
- **ORS**: Ver correções em LOGIC_ANALYSIS.md
- **Estados**: Ver booking-state-machine.ts
- **Regras**: Ver business-rules.ts
- **Testes**: Ver TESTING_GUIDE.md
