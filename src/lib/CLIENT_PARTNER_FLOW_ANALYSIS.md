# Análise Detalhada: Fluxo Cliente vs Parceiro

## 1. FLUXO DE CLIENTE (PUBLIC)

### 1.1 Etapas do Cliente

```
1. BUSCA (SearchPage)
   └─ Pesquisa veículos/serviços
   └─ Filtra por datas, preço, localização
   └─ Vê resultados em tempo real

2. SELEÇÃO (BookingDetailsPage)
   └─ Escolhe veículo específico
   └─ Configura extras
   └─ Verifica preço total

3. CHECKOUT (CheckoutPage)
   └─ Preenche dados pessoais
   └─ Valida NIF
   └─ Seleciona forma de pagamento

4. CONFIRMAÇÃO (HistoryPage)
   └─ Vê status do booking
   └─ Pode cancelar em até 24h (100% reembolso)
   └─ Recebe notificações
```

### 1.2 Problemas Identificados (Cliente)

**PROBLEMA 1: Sem feedback de atualização**
- Cliente faz booking, não sabe quando está confirmado
- Precisa F5 ou voltar a History
- Solução: WebSocket ou polling a cada 5s

**PROBLEMA 2: Sem notificações em tempo real**
- Cliente não recebe alert quando parceiro cancela
- Descobre apenas quando volta à página
- Solução: Toast push + email + SMS

**PROBLEMA 3: Sem histórico de tentativas de busca**
- Se página falha, cliente perde filtros
- Precisa pesquisar de novo
- Solução: Persistência em URL + localStorage

**PROBLEMA 4: Sem estimativa de espera (Waitlist)**
- Se em waitlist, cliente não sabe quanto tempo espera
- Sem comunicação automática quando realocado
- Solução: Enviar email com ETA + notificação

**PROBLEMA 5: Cancelamento confuso**
- Não mostra reembolso automático em tempo real
- Sem rastreamento de reembolso
- Solução: Show refund amount antes de confirmar

---

## 2. FLUXO DE PARCEIRO (PRIVATE)

### 2.1 Etapas do Parceiro

```
1. DASHBOARD (PartnerDashboard)
   └─ Vê bookings pendentes
   └─ Vê estatísticas
   └─ Gerencia frota

2. ACEITAR/REJEITAR (BookingsClient)
   └─ Recebe notificação de novo booking
   └─ Visualiza detalhes
   └─ Aceita ou rejeita em 30min

3. REALIZAR (OperationsPage)
   └─ Vê booking atribuído
   └─ Marca como iniciado
   └─ Marca como completo

4. GESTÃO DE FROTA (FleetPage)
   └─ Adiciona novos veículos
   └─ Edita disponibilidade
   └─ Gerencia motoristas
```

### 2.2 Problemas Identificados (Parceiro)

**PROBLEMA 1: Notificações lentas**
- Parceiro não notificado imediatamente de novo booking
- Lag de 5-30 segundos
- Solução: Server-sent events (SSE) ou WebSocket

**PROBLEMA 2: Sem rejuvenescimento de bookings**
- Se rejeita, não volta a ver (desaparece)
- Sem histórico de rejeições
- Solução: Manter record com reason, possibilitar re-accept

**PROBLEMA 3: Sem automação de realocação**
- Se cancela, admin precisa realocação manual
- Espera horas antes de ser realocado
- Solução: Realocação automática em <5min

**PROBLEMA 4: Sem alertas de pendente expirado**
- Booking fica em "pending_partner_acceptance" 30+ min
- Parceiro não é alertado
- Vai para waitlist automaticamente
- Solução: Alert após 15min, auto-cancel após 30min

**PROBLEMA 5: Sem visibilidade de estatísticas em tempo real**
- Dashboard atualiza a cada página load
- Dados desatualizados
- Solução: Dashboard com polling a cada 10s

**PROBLEMA 6: Frota desorganizada**
- Sem agrupamento por tipo/categoria
- Sem status visual (ativo/inativo)
- Difícil encontrar veículo
- Solução: Cards visuais com status cores

---

## 3. PROBLEMAS COMPARTILHADOS

### 3.1 Sincronização de Estado

**Problema**:
```
Cliente vê booking confirmado
Parceiro rejeita simultaneamente
Cliente pensa que está confirmado
Parceiro acha que rejeitou
→ CAOS
```

**Solução**: Mutex/Lock no banco de dados
```sql
ALTER TABLE bookings ADD COLUMN locked_at TIMESTAMP;
-- Lock prevents concurrent updates
```

### 3.2 Sem Auditoria

**Problema**: Não conseguimos rastrear o quê/quem mudou
- Cliente não sabe por que booking foi cancelado
- Parceiro não sabe por que foi realocado
- Admin não consegue debugar

**Solução**: Audit log em cada mudança
```sql
CREATE TABLE booking_audit_log (
  id UUID PRIMARY KEY,
  booking_id UUID,
  action VARCHAR (20),
  changed_by VARCHAR (20),
  old_value JSONB,
  new_value JSONB,
  created_at TIMESTAMP
);
```

### 3.3 Sem Retry Automático

**Problema**: Falha de rede = erro direto
- Sem retry
- Cliente vê erro mesmo com conexão instável
- Parceiro vê rejeição falhar

**Solução**: Implementado em `request-helpers.ts`

---

## 4. MELHORIAS PROPOSTAS (ROADMAP)

### SEMANA 1: Feedback em Tempo Real

**Cliente**:
- Polling a cada 5s no History (mostra status updated)
- Toast quando parceiro aceita/rejeita
- Email + SMS de confirmação

**Parceiro**:
- Polling a cada 10s no Dashboard
- Toast quando novo booking chega
- Email alertando bookings expirando

**Código**:
```typescript
// /src/lib/polling-service.ts
export function createPollingService(interval: number = 5000) {
  return setInterval(() => {
    // Refresh data
  }, interval);
}

// Usar em useEffect:
useEffect(() => {
  const poller = createPollingService(5000);
  return () => clearInterval(poller);
}, []);
```

### SEMANA 2: Notificações Push

**Sistema de Notificação**:
```typescript
// Supabase Real-time para mudanças
const subscription = supabase
  .channel(`bookings:${bookingId}`)
  .on('postgres_changes', 
    { event: 'UPDATE', schema: 'public', table: 'bookings' },
    (payload) => {
      toast.info(`Booking atualizado: ${payload.new.status}`);
    }
  )
  .subscribe();
```

### SEMANA 3: Melhorias de UX

**Cliente**:
- Mostrar refund amount antes de cancelar
- Timeline visual do booking
- Notificação de espera (ETA)

**Parceiro**:
- Cards visuais de veículos
- Dashboard colorido
- Botão rápido "Aceitar"

### SEMANA 4: Audit & Locks

**Database**:
- Audit log em cada mudança
- Mutex em bookings críticos
- Soft deletes (nunca apagar dados)

---

## 5. CÓDIGO DE EXEMPLO (Polling)

```typescript
// /src/hooks/use-booking-polling.ts
'use client';

import { useCallback, useEffect, useRef } from 'react';
import { getBookingDetailsAction } from '@/actions/private/bookings/actions';

interface UseBookingPollingOptions {
  bookingId: string;
  interval?: number;
  onUpdate?: (booking: any) => void;
  enabled?: boolean;
}

export function useBookingPolling({
  bookingId,
  interval = 5000,
  onUpdate,
  enabled = true
}: UseBookingPollingOptions) {
  const pollerRef = useRef<NodeJS.Timeout>();

  const poll = useCallback(async () => {
    try {
      const result = await getBookingDetailsAction(bookingId);
      if (result.success) {
        onUpdate?.(result.data);
      }
    } catch (error) {
      console.warn('[Polling] Erro:', error);
    }
  }, [bookingId, onUpdate]);

  useEffect(() => {
    if (!enabled) return;

    // Poll imediatamente
    poll();

    // Depois a cada interval
    pollerRef.current = setInterval(poll, interval);

    return () => {
      if (pollerRef.current) clearInterval(pollerRef.current);
    };
  }, [poll, enabled, interval]);
}

// Usar em página:
export function HistoryPage() {
  const [booking, setBooking] = useState(null);

  useBookingPolling({
    bookingId: id,
    interval: 5000,
    onUpdate: (data) => {
      if (data.status !== booking?.status) {
        toast.info(`Status atualizado: ${data.status}`);
      }
      setBooking(data);
    }
  });

  return <div>{booking?.status}</div>;
}
```

---

## 6. RESUMO DE MUDANÇAS

| Componente | Problema | Solução | Prioridade |
|-----------|----------|---------|-----------|
| History | Sem atualização | Polling + toast | ALTA |
| Dashboard | Desatualizado | Polling + SSE | ALTA |
| Cancelamento | Sem refund visual | Show amount | MÉDIA |
| Waitlist | Sem ETA | Email + countdown | MÉDIA |
| Auditoria | Sem rastreamento | Audit log table | BAIXA |
| Performance | Lento | Cache + paralelização | ALTA |

