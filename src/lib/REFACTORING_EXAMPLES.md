# EXEMPLOS PRÁTICOS DE REFATORAÇÃO

## 1. PARALELIZAR REQUISIÇÕES

### Exemplo 1: BookingDetailsPage

**ANTES (Sequencial)**:
```tsx
useEffect(() => {
  async function load() {
    setLoading(true);
    try {
      const rawId = Array.isArray(id) ? id[0] : id;
      const carIds = rawId.split(",").filter(Boolean);
      
      // Requisição 1: ~400ms
      const cars = await getCarsByIds(carIds);
      setCars(cars);
      
      // Requisição 2: ~300ms (só começa depois que 1 termina)
      const extras = await getExtras();
      setExtras(extras);
      
      // Requisição 3: ~200ms (só começa depois que 2 termina)
      const sysData = await getSystemData();
      setSystemData(sysData);
      
      // Total: 900ms
      setLoading(false);
    } catch (err) {
      setError(err.message);
      setLoading(false);
    }
  }
  load();
}, [id]);
```

**DEPOIS (Paralelo)**:
```tsx
useEffect(() => {
  async function load() {
    setLoading(true);
    setError(null);
    try {
      const rawId = Array.isArray(id) ? id[0] : id;
      const carIds = rawId.split(",").filter(Boolean);
      
      // Todas executam simultaneamente
      const [cars, extras, sysData] = await Promise.all([
        getCarsByIds(carIds),      // ~400ms
        getExtras(),               // ~300ms (paralelo)
        getSystemData()            // ~200ms (paralelo)
      ]);
      
      setCars(cars);
      setExtras(extras);
      setSystemData(sysData);
      
      // Total: 400ms (tempo máximo, não soma)
      setLoading(false);
    } catch (err) {
      const msg = err?.message || "Falha ao carregar dados";
      setError(msg);
      toast.error(msg);
      setLoading(false);
    }
  }
  load();
}, [id]);
```

**Ganho**: 900ms → 400ms (55% mais rápido)

---

### Exemplo 2: SearchPageContent

**ANTES**:
```tsx
useEffect(() => {
  async function init() {
    // Carregar sistema data
    const systemData = await getSystemData();
    setCategoriesData(systemData.categories);
    setExtrasData(systemData.extras);
    
    // Carregar draft
    const draft = await getDraftAction(draftId);
    setSearchData(draft);
    
    setIsLoading(false);
  }
  init();
}, [draftId]);
```

**DEPOIS**:
```tsx
useEffect(() => {
  async function init() {
    setIsLoading(true);
    try {
      // Ambas em paralelo
      const [systemData, draft] = await Promise.all([
        getSystemData(),
        draftId ? getDraftAction(draftId) : Promise.resolve(null)
      ]);
      
      if (systemData) {
        setCategoriesData(systemData.categories);
        setExtrasData(systemData.extras);
      }
      
      if (draft) {
        setSearchData(draft);
      }
    } catch (err) {
      console.warn("[Search] Erro ao inicializar:", err);
      // Continua sem falhar, UX degrada gracefully
    } finally {
      setIsLoading(false);
    }
  }
  init();
}, [draftId]);
```

---

## 2. ADICIONAR TIMEOUT EM REQUISIÇÕES

### Exemplo 1: ORS Geocoding

**ANTES** (Sem timeout):
```tsx
async function orsReverseGeocode(lat: number, lng: number) {
  const url = `https://api.openrouteservice.org/...`;
  const res = await fetch(url); // Pode travar indefinidamente
  return res.json();
}
```

**DEPOIS** (Com timeout):
```tsx
import { fetchWithRetry, withTimeout } from "@/lib/request-helpers";

async function orsReverseGeocode(lat: number, lng: number) {
  const url = `https://api.openrouteservice.org/...`;
  
  try {
    const res = await withTimeout(
      fetch(url),
      5000, // 5 segundo timeout
      "Serviço de localização indisponível"
    );
    
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  } catch (err) {
    console.warn("[ORS] Falha no geocode reverso:", err);
    return null; // Fallback gracioso
  }
}
```

---

### Exemplo 2: Múltiplas requisições com timeout

**ANTES**:
```tsx
const [cars, extras] = await Promise.all([
  getCarsByIds(carIds),
  getExtras()
]);
// Se uma demorar >30s, ambas travam
```

**DEPOIS**:
```tsx
const [cars, extras] = await Promise.all([
  withTimeout(
    getCarsByIds(carIds),
    10000,
    "Falha ao carregar veículos"
  ),
  withTimeout(
    getExtras(),
    5000,
    "Falha ao carregar extras"
  )
]);
// Cada uma tem seu timeout, não bloqueiam uma à outra
```

---

## 3. RETRY AUTOMÁTICO

### Exemplo 1: Geocoding com retry

**ANTES** (Sem retry):
```tsx
const coords = await orsGeocode("Luanda"); // Falha? Pronto
```

**DEPOIS** (Com retry automático):
```tsx
import { withRetry } from "@/lib/request-helpers";

const coords = await withRetry(
  () => orsGeocode("Luanda"),
  {
    maxRetries: 3,
    delayMs: 500,
    backoffMultiplier: 2,
    shouldRetry: (err) => {
      // Não retry em erros de validação
      return !err.message.includes("inválido");
    }
  }
);
// Tenta 3 vezes com delay: 500ms, 1s, 2s
```

---

### Exemplo 2: Validação de NIF com retry

**ANTES**:
```tsx
const result = await validateNif(nif);
if (!result.success) {
  toast.error("NIF inválido"); // Usuário tem que clicar novamente
}
```

**DEPOIS**:
```tsx
import { withRetry } from "@/lib/request-helpers";

try {
  const result = await withRetry(
    () => validateNif(nif),
    { maxRetries: 2 }
  );
  
  if (!result.success) {
    setNifError("NIF inválido. Tente novamente.");
  } else {
    setNifValid(true);
  }
} catch (err) {
  toast.error("Erro ao validar NIF. Tente novamente.");
}
```

---

## 4. PERSISTÊNCIA DE ESTADO EM URL

### Exemplo: Filtros de Busca

**ANTES** (Estado perdido ao recarregar):
```tsx
const [searchData, setSearchData] = useState(initialData);

// Usuário preenche, pesquisa, recarrega → PERDIDO
```

**DEPOIS** (Estado em URL):
```tsx
const searchParams = useSearchParams();
const router = useRouter();

const [searchData, setSearchData] = useState(initialData);

// Sempre que searchData muda, atualizar URL
useEffect(() => {
  const params = new URLSearchParams({
    type: searchData.type,
    from: searchData.from?.toISOString() || '',
    to: searchData.to?.toISOString() || '',
    pickup: searchData.pickup || '',
    dropoff: searchData.dropoff || '',
    passengers: String(searchData.passengers || ''),
  });
  
  router.push(`?${params.toString()}`);
}, [searchData, router]);

// Ao carregar, buscar URL primeiro
useEffect(() => {
  const urlData: SearchFilters = {};
  
  searchParams.forEach((value, key) => {
    if (key === 'from' || key === 'to') {
      urlData[key] = new Date(value);
    } else if (key === 'passengers') {
      urlData[key] = parseInt(value);
    } else {
      urlData[key] = value;
    }
  });
  
  if (Object.keys(urlData).length > 0) {
    setSearchData(urlData);
  }
}, [searchParams]);
```

**Resultado**: `/search?type=rental&from=2024-02-01&passengers=3&pickup=Luanda`

---

## 5. TRATAMENTO DE ERRO POR TIPO

### Exemplo: Componente com erro estratificado

**ANTES** (Tudo igual):
```tsx
try {
  const result = await action();
  if (!result.success) {
    toast.error(result.error);
  }
} catch (err) {
  toast.error("Erro ao processar");
}
```

**DEPOIS** (Diferenciado por tipo):
```tsx
import { getTierOfError } from "@/lib/error-handlers";

try {
  const result = await action();
  
  if (!result.success) {
    const tier = getTierOfError(result.error);
    
    if (tier === 'critical') {
      // Erro crítico: Modal com opções
      showCriticalErrorModal({
        message: result.error,
        onRetry: () => handleRetry(),
        onCancel: () => goBack()
      });
    } else if (tier === 'high') {
      // Erro alto: Toast + Retry automático
      toast.error(result.error);
      setTimeout(() => handleRetry(), 3000);
    } else {
      // Erro normal: Toast simples
      toast.error(result.error);
    }
  }
} catch (err) {
  const tier = getTierOfError(err);
  // ... mesmo tratamento por tier
}
```

---

## 6. CACHE COM EXPIRAÇÃO

### Exemplo: Categorias com cache

**ANTES** (Sem cache):
```tsx
async function getCategories() {
  const { data } = await supabase
    .from("vehicle_classes")
    .select("*");
  return data;
}
// Toda vez que chama, busca do servidor
```

**DEPOIS** (Com cache):
```tsx
interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

const cache = new Map<string, CacheEntry<any>>();

async function getCategoriesWithCache(maxAge = 24 * 60 * 60 * 1000) {
  const cacheKey = 'categories';
  const cached = cache.get(cacheKey);
  
  // Se tem cache válido, retornar imediatamente
  if (cached && cached.expiresAt > Date.now()) {
    return cached.data;
  }
  
  // Senão, buscar servidor
  const { data } = await supabase
    .from("vehicle_classes")
    .select("*");
  
  // Guardar em cache
  cache.set(cacheKey, {
    data,
    expiresAt: Date.now() + maxAge
  });
  
  return data;
}
```

---

## 7. COMPONENTE COM ESTADO ROBUSTO

### Exemplo: BookingsClient melhorado

**ANTES** (Frágil a erros):
```tsx
const [bookings, setBookings] = useState(initialBookings);

const handleUpdateStatus = async (id: string, status: string) => {
  try {
    const result = await updateBookingStatusAction(id, status);
    if (result.success) {
      toast.success("Sucesso!");
      router.refresh();
    } else {
      toast.error(result.error);
    }
  } catch {
    toast.error("Erro");
  }
};
```

**DEPOIS** (Robusto):
```tsx
const [bookings, setBookings] = useState(initialBookings);
const [updating, setUpdating] = useState<string | null>(null);
const [errors, setErrors] = useState<Record<string, string>>({});

const handleUpdateStatus = async (id: string, status: string) => {
  setUpdating(id);
  setErrors(prev => ({ ...prev, [id]: '' }));
  
  try {
    const result = await withRetry(
      () => updateBookingStatusAction(id, status),
      { maxRetries: 2 }
    );
    
    if (result?.success) {
      toast.success(`Pedido ${status === 'canceled' ? 'cancelado' : 'confirmado'}!`);
      
      // Atualizar estado local
      setBookings(prev => 
        prev.map(b => b.id === id ? { ...b, status } : b)
      );
      
      router.refresh();
    } else {
      const errorMsg = result?.error || "Falha ao processar";
      setErrors(prev => ({ ...prev, [id]: errorMsg }));
      toast.error(errorMsg);
    }
  } catch (err) {
    const errorMsg = err?.message || "Erro na comunicação";
    setErrors(prev => ({ ...prev, [id]: errorMsg }));
    toast.error(errorMsg);
  } finally {
    setUpdating(null);
  }
};
```

---

## CHECKLIST DE REFATORAÇÃO

- [ ] Encontrar todas requisições sequenciais
- [ ] Agrupar em Promise.all()
- [ ] Adicionar timeout a cada requisição
- [ ] Implementar retry automático
- [ ] Persistir estado em URL (onde apropriado)
- [ ] Remover console.log de debug
- [ ] Adicionar tratamento de erro específico
- [ ] Testar com conexão lenta (DevTools)
- [ ] Testar com falhas de rede (DevTools)
