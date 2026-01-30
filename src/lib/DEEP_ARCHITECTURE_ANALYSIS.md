# ANÁLISE PROFUNDA DE ARQUITETURA - WiTransfer

## 1. FLUXO GERAL DO PROJETO

### Estrutura de 3 Camadas:
```
PUBLIC LAYER (Cliente Final)
├── /search/rental → Busca de carros para aluguel
├── /search/transfer → Busca de carros para transferência
├── /booking/[id] → Detalhes e checkout de booking
├── /history → Histórico de bookings do cliente
└── /register → Autenticação do cliente

PARTNER LAYER (Parceiros/Motoristas)
├── /partners/dashboard → Dashboard do parceiro
├── /partners/fleet/teams → Gestão de equipa
├── /partners/settings → Configurações

ADMIN LAYER (Admin do Sistema)
├── /admin/dashboard → Dashboard geral
├── /admin/categories/* → Gestão de categorias
├── /(common)/operations/* → Operações (bookings, transfers)
└── /(common)/fleet/* → Gestão de frota
```

---

## 2. FLUXO DE DADOS COMPLETO

### A. FLUXO DE BUSCA E BOOKING (Cliente)

```
Cliente abre /search/rental/
    ↓
RentalSearchPage (Server Component) carrega:
  - getSystemData() → Categorias, Extras, Serviços
  - getDraftAction(did) → Recupera rascunho anterior (se existir)
    ↓
SearchPageContent (Client Component) renderiza:
  - FilterSidebar (filtros lado esquerdo)
  - CarResults (resultados direita)
    ↓
Cliente preenche SearchForm e clica "Pesquisar"
    ↓
searchCars() (Server Action) executa:
  1. getBaseData() → Carrega veículos com cache
  2. calculateDistance() → ORS/OSRM para distância
  3. calculateCarPricing() → Preço por km + extras
  4. filterVehicles() → Filtra por disponibilidade
    ↓
Resultados renderizam com:
  - Veículo, preço, avaliação, localização
  - Opção de selecionar extras
    ↓
Cliente clica em veículo → BookingDetailsPage
    ↓
BookingDetailsPage (Client) carrega:
  - getCarsByIds() → Detalhes dos carros selecionados
  - getExtras() → Todos os extras disponíveis
  - Formulário com dados do cliente (NIF, telefone, etc)
    ↓
Cliente preenche dados → createDraftAction()
  - Salva rascunho no servidor
    ↓
Cliente clica "Confirmar" → createBookingAction()
  - POST /api/bookings
  - Cria user se não existe
  - Cria booking no BD
  - Envia email de confirmação
```

---

### B. FLUXO DE OPERAÇÕES (Admin/Parceiro)

```
Admin entra em /operations/bookings
    ↓
BookingsPage (Server) carrega:
  - getBookingsAction("rental") → Todos os bookings
    ↓
BookingsClient (Client Component) renderiza:
  - Tabela com filtros (nome, status, carro, data)
  - Botões: confirmar, cancelar, ver detalhes
    ↓
Admin clica "Confirmar" → updateBookingStatusAction()
    ↓
Admin clica "Cancelar" → cancelAndReassignBookingAction()
  1. Marca como "waiting_for_resources"
  2. Tenta buscar veículo alternativo
  3. Se encontrar: realoca (reassign)
  4. Se não: coloca em waitlist com 24h expiração
  5. Processa waitlist: /api/admin/process-waitlist
    ↓
Booking status muda:
  pending → confirmed → in_progress → completed
      ↓ (se problema)
   waiting_for_resources → reassigned → completed
```

---

## 3. COMPONENTES CRÍTICOS E LÓGICA

### A. SearchPageContent.tsx
**Problema**: Recuperação complexa de estado com múltiplos fallbacks
- Tenta: `did` (draft) → `s` (compressed) → `sid` → sessionStorage → localStorage
- RISCO: Estado inconsistente se múltiplas tentativas falham

**Fluxo**:
1. useEffect init() tenta 5 métodos diferentes
2. Se nenhum funciona, estado fica vazio
3. Cliente vê "Sincronizando Pesquisa..." indefinidamente

**ERRO CRÍTICO**: Sem tratamento de erro se init falhar
```tsx
if (isLoading) {
  return <div>Sincronizando...</div>; // Nunca sai disso se houver erro
}
```

---

### B. BookingDetailsPage.tsx
**Problema**: Múltiplas requisições síncronas desnecessárias

```tsx
useEffect(() => {
  // 1. Fetch cars
  const cars = await getCarsByIds(carIds);
  // 2. Fetch extras
  const extras = await getExtras();
  // 3. Verificar email
  const isReg = await verifyEmail(email);
  // 4. Validar NIF
  const nifValid = await validateNif(nif);
})
```

**ERRO**: Não usa Promise.all() → requisições sequenciais (lento)
**SOLUÇÃO**: Paralelizar requisições

---

### C. BookingsClient.tsx
**Problema 1**: Debug logs em produção
```tsx
console.log(`[DEBUG_UI] BookingsClient mounted...`);
```

**Problema 2**: Sem tratamento de erro em cancelAndReassignBookingAction
```tsx
if (status === 'canceled') {
  result = await cancelAndReassignBookingAction(id, "admin_cancel");
  // Se isso falhar, só mostra "erro genérico"
}
```

**Problema 3**: Filtros não sincronizam com URL
- Muda filtro local, mas URL não atualiza
- Se recarregar página, filtros perdem-se

---

### D. Actions de Search (cars.ts)
**Problema 1**: Cálculo de distância com 3 fallbacks cascata
```
ORS (pode falhar) → OSRM (pode falhar) → Valor padrão (30km)
```
Se ORS e OSRM falham, cliente vê preço errado

**Problema 2**: Geocoding lento
- Nominatim + ORS em paralelo
- Cada busca é ~500ms
- Com múltiplos pontos, pode demorar 2-3 segundos

**Problema 3**: Sem timeout em fetch Nominatim
```tsx
fetch(...).then(r => r.ok ? r.json() : []).catch(() => [])
```
Se Nominatim travar, bloqueia toda a busca

---

### E. Private Layout.tsx
**Problema 1**: Sem tratamento de erro em getCurrentUserAction()
```tsx
getCurrentUserAction().then((result) => {
  if (result.success) setUser(result.data);
  // O QUE ACONTECE SE FALHAR?
  setIsLoadingUser(false); // Continua de qualquer forma
})
```

**Problema 2**: Sem retry se falhar a autenticação
```tsx
if (isLoadingUser) {
  return <Loader2 />; // Se user fetch falhar, fica carregando
}
```

---

## 4. PROBLEMAS IDENTIFICADOS

### Críticos (Devem corrigir AGORA):
1. ❌ SearchPageContent - Sem tratamento de erro no estado
2. ❌ BookingsClient - Sem tratamento de erro em cancelamento
3. ❌ Private Layout - Sem feedback se getCurrentUserAction falhar
4. ❌ ORS Directions - Timeout indefinido
5. ❌ Nominatim - Sem timeout

### Altos (Pioram UX):
1. 🔴 BookingDetailsPage - Requisições sequenciais em vez de paralelas
2. 🔴 Filtros não persistem em URL
3. 🔴 Debug logs em produção
4. 🔴 Sem mensagens de erro específicas

### Médios (Refactoring):
1. 🟡 SearchPageContent tem 250+ linhas, muito complexo
2. 🟡 BookingsClient tem múltiplas responsabilidades
3. 🟡 Lógica de distância espalhada (3 serviços diferentes)

---

## 5. MELHORIAS PROPOSTAS

### Fluxo de Busca - NOVO:

```tsx
// 1. Centralizar erro com retry automático
async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries = 2
): Promise<T | null> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (e) {
      if (i === maxRetries - 1) throw e;
      await new Promise(r => setTimeout(r, 1000 * (i + 1)));
    }
  }
  return null;
}

// 2. Paralelizar requisições
const [cars, extras, userData] = await Promise.all([
  getCarsByIds(carIds),
  getExtras(),
  verifyEmail(email)
]);

// 3. Adicionar timeout
const withTimeout = <T,>(promise: Promise<T>, ms: number) =>
  Promise.race([
    promise,
    new Promise<T>((_, r) => setTimeout(() => r(new Error('Timeout')), ms))
  ]);
```

---

## 6. FLUXO DE ERRO NOVO - PROPOSTO

```
Qualquer Error
    ↓
getTierOfError() → Crítico/Alto/Normal
    ↓
Crítico (auth falha)  → Redireciona login
Alto (server falha)   → Toast erro + Retry automático
Normal (validação)    → Mostrar campo erro + dica

UserFeedback:
- Mínimo: Toast + escondes depois 3s
- Médio: Campo input com erro em vermelho
- Crítico: Modal com opções (retry, voltar, contactar)
```

---

## 7. MUDANÇAS DE FLUXO RECOMENDADAS

### De HOJE:
```
Busca → Resultado → Booking → Checkout → Confirmação
```

### Para MELHORADO:
```
Busca (com carregamento) 
    ↓ (mostrar placeholder enquanto carrega)
Resultado (com reload automático se falhar)
    ↓ (cada resultado com estado próprio)
Booking (validação em tempo real)
    ↓ (sem perder dados se falhar)
Checkout (com progresso visível)
    ↓ (não deixar perder dados)
Confirmação (com retry se email falhar)
```

---

## RESUMO EXECUTIVO

**Estado Atual**: Projeto funcional mas frágil em erros
**Principal Risco**: Falhas de rede deixam usuários sem feedback

**Ações Imediatas**:
1. Adicionar try-catch em todos useEffect/Server Actions
2. Implementar retry automático com backoff exponencial
3. Remover console.log de debug
4. Adicionar timeouts em todos fetch()
5. Paralelizar requisições onde possível
6. Persistir filtros/estado em URL
