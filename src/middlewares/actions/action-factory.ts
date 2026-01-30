"use server";

import { revalidatePath } from "next/cache";
import type { ActionResult, createErrorResult } from "@/types";

/**
 * Middleware type definition
 */
type ActionHandler<TInput, TOutput> = (input: TInput) => Promise<TOutput>;

interface ActionOptions {
  revalidate?: string;
  revalidateTags?: string[];
  isPublic?: boolean;
  delay?: number; // Delay em ms após completar a ação (útil para UI feedback)
}

/**
 * Unified factory to create actions with middleware (logging, error handling, etc.)
 * This provides a consistent way to handle all server actions in the app.
 * 
 * Sempre retorna um ActionResult estruturado com success/error/data
 */
export async function createAction<TInput, TOutput>(
  name: string,
  handler: ActionHandler<TInput, TOutput>,
  input: TInput,
  options: ActionOptions = {}
) {
  const startTime = Date.now();
  const prefix = options.isPublic ? "[PUBLIC ACTION]" : "[PRIVATE ACTION]";

  try {
    console.log(`${prefix} ${name} - START`);
    
    const result = await handler(input);

    // Aplicar delay se especificado (útil para operações muito rápidas)
    if (options.delay && options.delay > 0) {
      await new Promise(resolve => setTimeout(resolve, options.delay));
    }

    // Revalidar cache se necessário
    if (options.revalidate) {
      revalidatePath(options.revalidate);
    }
    if (options.revalidateTags) {
      const { revalidateTag } = await import("next/cache");
      for (const tag of options.revalidateTags) {
        revalidateTag(tag);
      }
    }

    const duration = Date.now() - startTime;
    console.log(`${prefix} ${name} - SUCCESS (${duration}ms)`);

    return result;
  } catch (error: any) {
    const duration = Date.now() - startTime;
    
    const errorMessage = error?.message || "Erro ao processar ação";
    console.error(`${prefix} ${name} - ERROR (${duration}ms):`, errorMessage);

    // Sempre lançar erro original para consistência com Actions do Next.js
    throw error;
  }
}

/**
 * Public Action wrapper
 * Usado para ações acessíveis publicamente
 */
export async function createPublicAction<TInput, TOutput>(
  name: string,
  handler: ActionHandler<TInput, TOutput>,
  input: TInput,
  options: Omit<ActionOptions, 'isPublic'> = {}
) {
  return createAction(name, handler, input, { ...options, isPublic: true });
}

/**
 * Private Action wrapper (authenticated/admin actions)
 * Usado para ações que requerem autenticação
 */
export async function createPrivateAction<TInput, TOutput>(
  name: string,
  handler: ActionHandler<TInput, TOutput>,
  input: TInput,
  options: Omit<ActionOptions, 'isPublic'> = {}
) {
  return createAction(name, handler, input, { ...options, isPublic: false });
}

/**
 * Safe Action Wrapper
 * Converte exceções em ActionResult estruturado com success/error
 * Melhor para APIs que precisam sempre retornar status 200 com error field
 */
export async function safeSeverAction<TInput, TOutput>(
  name: string,
  handler: ActionHandler<TInput, TOutput>,
  input: TInput,
  options: ActionOptions = {}
): Promise<ActionResult<TOutput>> {
  try {
    const data = await createAction(name, handler, input, options);
    
    return {
      success: true,
      data: data as TOutput,
      message: `${name} concluído com sucesso`,
      timestamp: new Date().toISOString(),
    };
  } catch (error: any) {
    const errorMessage = error?.message || "Ocorreu um erro na operação";

    return {
      success: false,
      error: errorMessage,
      errorCode: error?.code || "UNKNOWN_ERROR",
      timestamp: new Date().toISOString(),
    };
  }
}

/**
 * Helper para ações que já retornam ActionResult
 * Simplifica o padrão de ações que não precisam fazer throw
 */
export async function createSafeAction<TInput>(
  name: string,
  handler: (input: TInput) => Promise<ActionResult>,
  input: TInput,
  options: ActionOptions = {}
): Promise<ActionResult> {
  const startTime = Date.now();
  const prefix = options.isPublic ? "[PUBLIC ACTION]" : "[PRIVATE ACTION]";

  try {
    console.log(`${prefix} ${name} - START`);
    
    const result = await handler(input);

    // Aplicar delay se especificado
    if (options.delay && options.delay > 0) {
      await new Promise(resolve => setTimeout(resolve, options.delay));
    }

    // Revalidar cache se necessário
    if (options.revalidate) {
      revalidatePath(options.revalidate);
    }
    if (options.revalidateTags) {
      const { revalidateTag } = await import("next/cache");
      for (const tag of options.revalidateTags) {
        revalidateTag(tag);
      }
    }

    const duration = Date.now() - startTime;
    
    if (result.success) {
      console.log(`${prefix} ${name} - SUCCESS (${duration}ms)`);
    } else {
      console.warn(`${prefix} ${name} - FAILED (${duration}ms): ${result.error}`);
    }

    return result;
  } catch (error: any) {
    const duration = Date.now() - startTime;
    const errorMessage = error?.message || "Erro ao processar ação";
    
    console.error(`${prefix} ${name} - ERROR (${duration}ms):`, errorMessage);

    return {
      success: false,
      error: errorMessage,
      errorCode: error?.code || "UNKNOWN_ERROR",
      timestamp: new Date().toISOString(),
    };
  }
}
