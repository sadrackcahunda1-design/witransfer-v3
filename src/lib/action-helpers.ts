/**
 * Helpers para trabalhar com ActionResult de forma segura e padronizada
 * Simplifica tratamento de resultados em components e actions
 */

import type { ActionResult } from "@/types";

/**
 * Extrair dados com segurança de um ActionResult
 * Retorna os dados ou undefined se houve erro
 */
export function unwrapResult<T>(result: ActionResult<T>): T | undefined {
  if (result.success && result.data) {
    return result.data;
  }
  return undefined;
}

/**
 * Extrair erro com fallback
 */
export function getError(
  result: ActionResult,
  fallback: string = "Ocorreu um erro na operação"
): string {
  return result.error || fallback;
}

/**
 * Validar múltiplos campos necessários
 * Retorna ActionResult com erro se algum faltar
 */
export function validateRequired<T extends Record<string, any>>(
  data: T,
  requiredFields: (keyof T)[]
): ActionResult<null> | null {
  const missing = requiredFields.filter(field => !data[field]);

  if (missing.length > 0) {
    return {
      success: false,
      error: `Campos obrigatórios faltando: ${missing.join(", ")}`,
      errorCode: "MISSING_REQUIRED_FIELDS"
    };
  }

  return null;
}

/**
 * Validar email básico
 */
export function validateEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email?.trim() || "");
}

/**
 * Validar email e retornar ActionResult se inválido
 */
export function validateEmailResult(email: string): ActionResult<null> | null {
  if (!email?.trim()) {
    return {
      success: false,
      error: "Email é obrigatório",
      errorCode: "MISSING_EMAIL"
    };
  }

  if (!validateEmail(email)) {
    return {
      success: false,
      error: "Email inválido",
      errorCode: "INVALID_EMAIL"
    };
  }

  return null;
}

/**
 * Combinar múltiplas validações
 * Retorna o primeiro erro encontrado ou null
 */
export function combineValidations(
  ...validations: (ActionResult<null> | null)[]
): ActionResult<null> | null {
  for (const validation of validations) {
    if (validation !== null) {
      return validation;
    }
  }
  return null;
}

/**
 * Safe fetch que sempre retorna ActionResult
 * Nunca lança exceção, sempre retorna ActionResult estruturado
 */
export async function safeFetch<T = any>(
  url: string,
  options?: RequestInit
): Promise<ActionResult<T>> {
  try {
    const response = await fetch(url, options);
    
    const data: ActionResult<T> | any = await response.json();

    // Se resposta já é ActionResult, retornar como está
    if (data.success !== undefined) {
      return data;
    }

    // Se não é ActionResult, envolver resultado
    if (response.ok) {
      return {
        success: true,
        message: "Operação concluída com sucesso",
        data: data as T
      };
    }

    return {
      success: false,
      error: data?.error || "Erro na requisição",
      errorCode: response.status.toString()
    };
  } catch (error: any) {
    return {
      success: false,
      error: error?.message || "Erro de rede",
      errorCode: "NETWORK_ERROR"
    };
  }
}

/**
 * Tentar novamente com backoff exponencial
 * Útil para operações flaky
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<ActionResult<T>>,
  maxAttempts: number = 3,
  initialDelayMs: number = 1000
): Promise<ActionResult<T>> {
  let lastError: ActionResult = {
    success: false,
    error: "Retry failed",
    errorCode: "RETRY_FAILED"
  };

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const result = await fn();
      
      if (result.success) {
        return result;
      }

      // Se falhou, anotar erro e tentar novamente
      lastError = result;

      if (attempt < maxAttempts) {
        const delay = initialDelayMs * Math.pow(2, attempt - 1);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    } catch (error: any) {
      lastError = {
        success: false,
        error: error?.message || "Unknown error",
        errorCode: "RETRY_ERROR"
      };

      if (attempt < maxAttempts) {
        const delay = initialDelayMs * Math.pow(2, attempt - 1);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  return lastError;
}

/**
 * Transformar resultado com mapeamento
 * Útil para transformar dados antes de retornar
 */
export async function mapResult<T, U>(
  result: ActionResult<T>,
  mapper: (data: T) => U | Promise<U>
): Promise<ActionResult<U>> {
  if (!result.success || !result.data) {
    return {
      success: false,
      error: result.error || "Erro no mapeamento",
      errorCode: result.errorCode
    };
  }

  try {
    const mapped = await mapper(result.data);
    return {
      success: true,
      message: result.message,
      data: mapped,
      timestamp: new Date().toISOString()
    };
  } catch (error: any) {
    return {
      success: false,
      error: error?.message || "Erro ao mapear resultado",
      errorCode: "MAPPING_ERROR"
    };
  }
}

/**
 * Combinar múltiplos resultados
 * Útil quando precisa de múltiplas operações
 */
export function combineResults<T extends Record<string, any>>(
  results: Record<keyof T, ActionResult>
): ActionResult<T> {
  const keys = Object.keys(results) as (keyof T)[];
  
  const errors = keys.filter(key => !results[key].success);

  if (errors.length > 0) {
    const firstError = results[errors[0]];
    return {
      success: false,
      error: firstError.error || "Múltiplas operações falharam",
      errorCode: firstError.errorCode
    };
  }

  const combined = {} as T;
  for (const key of keys) {
    combined[key] = results[key].data;
  }

  return {
    success: true,
    message: "Todas as operações completadas com sucesso",
    data: combined,
    timestamp: new Date().toISOString()
  };
}

/**
 * Logging estruturado para debugging
 */
export function logResult<T>(
  name: string,
  result: ActionResult<T>,
  level: "debug" | "info" | "warn" | "error" = "info"
): void {
  const timestamp = new Date().toISOString();
  const status = result.success ? "✓" : "✗";

  const message = result.success
    ? `${timestamp} [${level.toUpperCase()}] ${status} ${name}: ${result.message}`
    : `${timestamp} [${level.toUpperCase()}] ${status} ${name}: ${result.error}`;

  const logFn = console[level] || console.log;
  logFn(message);

  if (process.env.NODE_ENV === "development") {
    console.log("Details:", { result });
  }
}

/**
 * Type guard para verificar se resultado é sucesso com dados
 */
export function isSuccess<T>(
  result: ActionResult<T>
): result is ActionResult<T> & { data: T } {
  return result.success && result.data !== undefined;
}

/**
 * Type guard para verificar se resultado é erro
 */
export function isError(result: ActionResult): boolean {
  return !result.success || !!result.error;
}

/**
 * Exemplo de uso em um componente:
 * 
 * ```typescript
 * "use client";
 * 
 * import { safeFetch, unwrapResult, getError } from "@/lib/action-helpers";
 * import { useNotification } from "@/hooks/use-notification";
 * 
 * export function MyComponent() {
 *   const { tratarResultado } = useNotification();
 *   
 *   const handleClick = async () => {
 *     const result = await safeFetch("/api/data");
 *     
 *     if (isSuccess(result)) {
 *       console.log("Dados:", result.data);
 *     } else {
 *       console.error("Erro:", getError(result));
 *     }
 *     
 *     tratarResultado(result);
 *   };
 *   
 *   return <button onClick={handleClick}>Clique</button>;
 * }
 * ```
 */
