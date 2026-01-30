/**
 * Helpers para requisiçõesmais robustas com retry e timeout
 */

export interface RetryOptions {
  maxRetries?: number;
  delayMs?: number;
  backoffMultiplier?: number;
  shouldRetry?: (error: any) => boolean;
}

/**
 * Executa função com retry automático e backoff exponencial
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const {
    maxRetries = 3,
    delayMs = 500,
    backoffMultiplier = 2,
    shouldRetry = (err) => err?.name !== 'AbortError' // Não retry em abort
  } = options;

  let lastError: any;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      
      // Não retry se a função disser que não deve
      if (!shouldRetry(error)) {
        throw error;
      }

      // Se é última tentativa, desiste
      if (attempt === maxRetries - 1) {
        throw error;
      }

      // Espera com backoff exponencial
      const delayTime = delayMs * Math.pow(backoffMultiplier, attempt);
      await new Promise(resolve => setTimeout(resolve, delayTime));
    }
  }

  throw lastError;
}

/**
 * Executa promise com timeout
 */
export async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  timeoutMessage = `Tempo limite excedido (${timeoutMs}ms)`
): Promise<T> {
  const timeoutPromise = new Promise<T>((_, reject) =>
    setTimeout(() => reject(new Error(timeoutMessage)), timeoutMs)
  );

  return Promise.race([promise, timeoutPromise]);
}

/**
 * Executa requisição fetch com retry, timeout e tratamento robusto
 */
export async function fetchWithRetry(
  url: string,
  options: RequestInit = {},
  retryOptions: RetryOptions = {},
  timeoutMs: number = 10000
): Promise<Response> {
  return withRetry(
    () => withTimeout(
      fetch(url, options),
      timeoutMs,
      `Falha ao conectar a ${url}`
    ),
    {
      maxRetries: 2,
      ...retryOptions,
      shouldRetry: (err) => {
        // Não retry em abortos ou erros de validação
        if (err?.name === 'AbortError' || err?.message?.includes('timeout')) {
          return true; // Retry em timeout
        }
        // Só retry em erros de rede
        return !navigator?.onLine === false; // Se offline, não retry
      }
    }
  );
}

/**
 * Paralelizar múltiplas requisições com tratamento de erro
 */
export async function fetchParallel<T>(
  requests: Array<{ name: string; promise: Promise<T> }>
): Promise<{ success: T[]; failed: Array<{ name: string; error: string }> }> {
  const results = await Promise.allSettled(requests.map(r => r.promise));

  const success: T[] = [];
  const failed: Array<{ name: string; error: string }> = [];

  results.forEach((result, index) => {
    const { name } = requests[index];
    if (result.status === 'fulfilled') {
      success.push(result.value);
    } else {
      failed.push({
        name,
        error: result.reason?.message || 'Erro desconhecido'
      });
    }
  });

  return { success, failed };
}

/**
 * Valida se resposta HTTP é sucesso
 */
export async function handleFetchResponse<T>(
  response: Response,
  parseAs: 'json' | 'text' = 'json'
): Promise<T> {
  if (!response.ok) {
    let errorBody: any;
    try {
      errorBody = await response[parseAs]();
    } catch {
      errorBody = { message: response.statusText };
    }

    const errorMessage = errorBody?.error?.message || 
                         errorBody?.message || 
                         `Erro ${response.status}: ${response.statusText}`;

    const error = new Error(errorMessage);
    (error as any).status = response.status;
    throw error;
  }

  return parseAs === 'json' ? response.json() : (response.text() as any);
}
