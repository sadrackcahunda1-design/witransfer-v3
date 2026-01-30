# QUICK REFERENCE - WiTransfer Architecture

## TL;DR - O que precisa saber

### 1. Estrutura do Projeto
- `/app/(public)/` → Cliente final (busca, booking, histórico)
- `/app/(private)/partners/` → Parceiros/Motoristas
- `/app/(private)/admin/` → Admin do sistema
- `/components/` → Componentes UI reutilizáveis
- `/actions/` → Server Actions (Supabase queries)
- `/lib/` → Utilities e helpers

### 2. Padrão de Fluxo de Dados

```
Page (Server Component)
    ↓
Action (Server Action) ← Supabase query
    ↓
Component (Client Component) ← Usa dados
    ↓
User Interaction ← Chama Action novamente
```

### 3. Problemas Críticos - Já Corrigidos

| Ficheiro | Problema | Status |
|----------|----------|--------|
| BookingsClient.tsx | Debug logs | ✅ Removido |
| BookingsClient.tsx | Erro em cancelamento | ✅ Tratado |
| Private Layout | getCurrentUserAction falha | ✅ Tratado |
| Search cars.ts | Debug logs | ✅ Removido |
| SearchPageContent.tsx | Estado sem tratamento erro | ✅ Try-catch adicionado |

### 4. Funções Novas Disponíveis

```tsx
import { 
  withRetry,           // Retry automático
  withTimeout,         // Timeout garantido
  fetchWithRetry,      // Fetch robusto
  handleFetchResponse  // Tratamento de resposta
} from "@/lib/request-helpers";
```

---

## REFERÊNCIA RÁPIDA POR TAREFA

### Tarefa: Fazer requisição robusta

```tsx
import { fetchWithRetry, handleFetchResponse } from "@/lib/request-helpers";

try {
  const res = await fetchWithRetry(
    "https://api.example.com/data",
    { headers: { "Authorization": "Bearer token" } },
    { maxRetries: 2 },
    5000 // 5 segundo timeout
  );
  
  const data = await handleFetchResponse(res, 'json');
  return data;
} catch (err) {
  console.error("Falha após retries:", err);
  throw err;
}
```

---

### Tarefa: Paralelizar requisições

```tsx
// Antes (lento): 900ms
const a = await fn1();
const b = await fn2();
const c = await fn3();

// Depois (rápido): 400ms
const [a, b, c] = await Promise.all([
  fn1(),
  fn2(),
  fn3()
]);
```

---

### Tarefa: Adicionar timeout

```tsx
import { withTimeout } from "@/lib/request-helpers";

try {
  const result = await withTimeout(
    someAsyncOperation(),
    5000,
    "Operação demorou demais"
  );
} catch (err) {
  if (err.message.includes("demorou demais")) {
    console.log("Timeout!");
  }
}
```

---

### Tarefa: Adicionar retry

```tsx
import { withRetry } from "@/lib/request-helpers";

const result = await withRetry(
  () => validateNif(nif),
  {
    maxRetries: 3,
    delayMs: 500,
    backoffMultiplier: 2
  }
);
```

---

### Tarefa: Tratar erro em useEffect

```tsx
useEffect(() => {
  let mounted = true;
  
  async function loadData() {
    try {
      const data = await someAction();
      if (mounted) setData(data);
    } catch (err) {
      if (mounted) {
        setError(err.message);
        toast.error(err.message);
      }
    }
  }
  
  loadData();
  
  return () => { mounted = false; }; // Cleanup
}, []);
```

---

### Tarefa: Persistir estado em URL

```tsx
import { useSearchParams, useRouter } from "next/navigation";

const searchParams = useSearchParams();
const router = useRouter();
const [filters, setFilters] = useState({});

// Quando filters muda, atualizar URL
useEffect(() => {
  const params = new URLSearchParams({
    search: filters.search || '',
    status: filters.status || 'all',
    // ... outros campos
  });
  
  router.push(`?${params.toString()}`);
}, [filters, router]);

// Ao carregar, buscar URL
useEffect(() => {
  const search = searchParams.get('search') || '';
  const status = searchParams.get('status') || 'all';
  
  setFilters({ search, status });
}, [searchParams]);
```

---

## COMPONENTES PRINCIPAIS

### Public Flow
```
/search/rental/page.tsx
    ↓ RentalSearchPage (RSC)
    ↓
SearchPageContent (Client)
    ├─ FilterSidebar
    └─ CarResults

/booking/[id]/page.tsx
    ↓ BookingDetailsPage (Client)
    ├─ Car details
    ├─ Extras selection
    ├─ Client form
    └─ Checkout
```

### Private Flow
```
/admin/dashboard/page.tsx
    ↓
AppSidebar + AppHeader (layout)
    ├─ /operations/bookings/page.tsx
    │   ↓ BookingsClient
    │   └─ Booking table + filters
    │
    ├─ /fleet/vehicles/page.tsx
    │   ↓ VehiclesClient
    │   └─ Vehicle list
    │
    └─ /categories/*/page.tsx
        ↓ ClassesClient/ServicesClient
        └─ Lists
```

---

## ACTIONS IMPORTANTES

### Public
- `getCarsByIds()` - Buscar carros por IDs
- `searchCars()` - Buscar com filtros
- `getExtras()` - Todos os extras
- `createDraftAction()` - Salvar rascunho
- `createBookingAction()` - Criar booking

### Private (Admin)
- `getBookingsAction()` - Todos os bookings
- `updateBookingStatusAction()` - Mudar status
- `cancelAndReassignBookingAction()` - Cancelar e realoca
- `getActivePartnersAction()` - Parceiros ativos
- `getFilteredBookingsAction()` - Com filtros

---

## PADRÕES DE ERRO

### Erro Crítico (Modal)
```tsx
showErrorModal({
  title: "Autenticação expirada",
  message: "Sua sessão expirou. Faça login novamente.",
  actions: ["Fazer login", "Voltar"]
});
```

### Erro Alto (Toast + Retry)
```tsx
toast.error("Falha ao carregar. Tentando novamente em 3s...");
setTimeout(() => retry(), 3000);
```

### Erro Normal (Toast)
```tsx
toast.error("NIF inválido. Tente novamente.");
```

---

## PERFORMANCE CHECKLIST

- [ ] Todas requisições têm timeout
- [ ] Requisições independentes em Promise.all()
- [ ] Sem console.log em produção
- [ ] Handled de erro em useEffect
- [ ] Cleanup com mounted flag
- [ ] Estado em URL quando apropriado
- [ ] Cache implementado para dados estáticos

---

## FICHEIROS DE REFERÊNCIA

Leia nesta ordem:
1. **QUICK_REFERENCE.md** (este)
2. **COMPREHENSIVE_OVERVIEW.md** (contexto geral)
3. **DEEP_ARCHITECTURE_ANALYSIS.md** (análise técnica)
4. **REFACTORING_EXAMPLES.md** (código prático)
5. **PERFORMANCE_IMPROVEMENTS.md** (estratégia)

---

## DÚVIDAS FREQUENTES

**P: Como debugar?**
A: Usar DevTools Network throttling:
```
DevTools → Network → Throttle → Slow 3G
Recarregar página
Ver se funciona bem em rede lenta
```

**P: Como testar erro de rede?**
A: DevTools Network → Offline
Clicar em algo
Ver se mostra mensagem apropriada

**P: Posso usar localStorage?**
A: ❌ NÃO. Usar sessionStorage ou URL para estado.

**P: Como sair do "Sincronizando..."?**
A: Todos useEffect agora têm timeout ou fallback.
Se ainda ficar, verificar console para erro.

**P: Preciso fazer cache?**
A: ✅ SIM. Categorias e extras raramente mudam.
Implementar com 24h TTL.

---

## COMO REPORTAR BUG

1. Reproduzir em DevTools com Network Throttling
2. Tirar screenshot ou vídeo
3. Checklist:
   - [ ] Qual página?
   - [ ] Qual ação?
   - [ ] Qual erro no console?
   - [ ] Resultado esperado vs actual?

---

## MÉTRICAS A MONITORAR

- Tempo de busca: Deve ser <1.5s
- Taxa de erro: Deve ser <5%
- Bounce rate: Se >50%, algo está errado
- Performance score: Deve ser >80
