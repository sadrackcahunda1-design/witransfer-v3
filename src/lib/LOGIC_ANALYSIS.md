# Análise Profunda de Lógica Destorcida - WiTransfer

## 1. PROBLEMAS ENCONTRADOS EM ORS.TS

### Problema 1: Autenticação ORS está INVERTIDA
**Arquivo**: `/src/lib/ors.ts`
**Linha**: 113

**Problema**:
```typescript
// ERRADO - Está usando ORS_API_KEY como Authorization header
headers: {
    "Content-Type": "application/json",
    "Authorization": ORS_API_KEY,  // ❌ INCORRETO
}
```

**Correto**:
- OpenRouteService usa query parameter, NÃO header de Authorization
- Header "Authorization" é para outras APIs (não ORS)

**Solução**:
```typescript
// A chave já está na URL como `api_key=...`
// Remover header "Authorization" completamente
headers: {
    "Content-Type": "application/json"
}
```

---

### Problema 2: Timeout inconsistente
**Arquivo**: `/src/lib/ors.ts`
**Linhas**: 33, 79

**Problema**:
- Geocode usa 10 segundos de timeout
- Reverse geocode não tem timeout definido (default indefinido)
- Directions usa 12 segundos

**Impacto**: Requisições podem travar indefinidamente se API falhar

**Solução**: Usar timeouts consistentes (10s) para todas as operações

---

### Problema 3: Tratamento de erro incompleto
**Arquivo**: `/src/lib/ors.ts`
**Linhas**: 45-50

**Problema**:
```typescript
if (!res.ok) {
    if (res.status === 403 || res.status === 401) {
        console.error("❌ ORS: API Key expirada ou inválida.");
    } else {
        console.error(`❌ ORS Geocode falhou com status: ${res.status}`);
    }
    return [];  // Retorna array vazio sem logar corpo de erro
}
```

**Impacto**: Difícil debugar erros reais da API

**Solução**: Logar response body para entender erro real

---

### Problema 4: Nomes de campos ambíguos para neighbor
**Arquivo**: `/src/lib/ors.ts`
**Linhas**: 60-61, 91-92

**Problema**:
```typescript
neighborhood: props.neighbourhood || props.quarter || props.suburb || props.district || props.borough,
```

**Impacto**: 
- Fallback é ambíguo e confuso
- Pode retornar campo errado em contexto local

**Solução**: Criar tipo específico para location com validação

---

### Problema 5: Waypoints muito perto (5km radius)
**Arquivo**: `/src/lib/ors.ts`
**Linha**: 110

**Problema**:
```typescript
radiuses: waypoints.map(() => 5000), // 5km é MUITO grande para snapping
```

**Impacto**:
- Pode snapper pontos para estradas completamente diferentes
- Especialmente ruim em Angola com cidades próximas

**Solução**: Usar 500m de raio para snapping em cidades

---

## 2. PROBLEMAS NOS ACTIONS DE BOOKING

### Problema 1: Status de booking inconsistente
**Arquivo**: `/src/actions/private/bookings/actions.ts`

**Problema**: Estados possíveis não estão bem definidos
- "pending", "confirmed", "assigned", "waiting_for_resources"
- Transições entre estados não são validadas

**Solução**: Criar máquina de estado com transições válidas

---

### Problema 2: Cancelamento não reverte estado
**Problema**: Quando parceiro cancela:
- Status é marcado como "cancelled"
- MAS veículo/motorista não são liberados
- MAS cliente não é notificado automaticamente

**Solução**: Implementar workflow completo de cancelamento

---

## 3. PROBLEMAS NA API DE WAITLIST

### Problema 1: Fila é FIFO mas sem prioridade
**Arquivo**: `/src/app/api/admin/process-waitlist/route.ts`

**Problema**:
```typescript
.order("created_at", { ascending: true }); // FIFO puro
```

**Impacto**: Cliente que coloca request à última hora tem mesma prioridade que primeiro

**Solução**: Adicionar tipo de serviço como prioridade

---

### Problema 2: Expiração hardcoded em 24h
**Problema**: Configuração de expiração está hardcoded
- Sem possibilidade de customizar por tipo de serviço
- Sem alert antes de expirar

**Solução**: Usar env vars para configuração

---

## 4. PROBLEMAS NA LÓGICA DE REALOCAÇÃO

### Problema 1: Partner ID mudando causa auditoria incorreta
**Problema**: 
```typescript
partner_id: altVehicle.partner_id, // Pode mudar de parceiro
```

**Impacto**: Histórico de booking fica confuso (qual parceiro??)

**Solução**: Manter novo partner em campo `reassigned_to_partner`, não sobrescrever original

---

### Problema 2: Sem validação de compatibilidade
**Problema**: Ao reallocar motorista/veículo, não valida:
- Se motorista está na mesma cidade?
- Se veículo tem feature necessária?
- Se motorista tem licença válida?

---

## 5. SCHEMA ISSUES

### Problema 1: Faltam colunas para auditoria
- `previous_partner_id` - rastrear realocação
- `reassignment_count` - quantas vezes foi realocado
- `original_booking_id` - para linked bookings

---

### Problema 2: Falta índice em booking status
```sql
CREATE INDEX idx_bookings_status ON bookings(status);
CREATE INDEX idx_bookings_partner_status ON bookings(partner_id, status);
```

---

## RESUMO DE CORREÇÕES NECESSÁRIAS

| Arquivo | Problema | Severidade | Solução |
|---------|----------|-----------|----------|
| ors.ts | Header Authorization errado | CRÍTICA | Remove Authorization, usa query param |
| ors.ts | Timeout inconsistente | ALTA | Define 10s para todas |
| ors.ts | Radius 5km grande demais | MÉDIA | Muda para 500m |
| booking-actions | Status inconsistente | ALTA | Criar máquina de estado |
| waitlist-processor | Sem priorização | MÉDIA | Add priority field |
| reallocations | Partner ID sobrescrito | ALTA | Usar campo novo |
| schema | Faltam índices | MÉDIA | ADD INDEX statements |

