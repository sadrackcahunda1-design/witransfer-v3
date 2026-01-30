/**
 * UNIFIED ACTION RESULT TYPE
 * Padrão único para todas as responses de actions/APIs
 * Simplifica tratamento de erros, notificações e dados
 */

/**
 * Resultado padronizado para todas as ações assíncronas
 * Garante consistência em todo o sistema
 */
export interface ActionResult<T = any> {
  // Status
  success: boolean;

  // Mensagens
  message?: string; // Mensagem de sucesso (traduzida)
  error?: string; // Mensagem de erro (traduzida)
  errorCode?: string; // Código do erro para tratamento específico

  // Dados
  data?: T;

  // Metadata (opcional)
  timestamp?: string;
  requestId?: string;
}

/**
 * Aliases para compatibilidade com código antigo
 */
export type ApiResponse<T = any> = ActionResult<T>;
export type ServerActionResult<T = any> = ActionResult<T>;

/**
 * Factory para criar resultados de sucesso
 */
export function createSuccessResult<T = any>(
  data?: T,
  message: string = "Operação concluída com sucesso"
): ActionResult<T> {
  return {
    success: true,
    message,
    data,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Factory para criar resultados de erro
 */
export function createErrorResult(
  error: string | Error,
  errorCode?: string
): ActionResult {
  const errorMessage = typeof error === "string" ? error : error.message;

  return {
    success: false,
    error: errorMessage,
    errorCode: errorCode || "UNKNOWN_ERROR",
    timestamp: new Date().toISOString(),
  };
}

/**
 * Helper para transformar Error em ActionResult
 */
export function fromError(
  error: Error | string,
  fallbackMessage: string = "Erro interno do servidor"
): ActionResult {
  if (typeof error === "string") {
    return createErrorResult(error);
  }

  // Extrair mensagem legível do erro
  let message = error.message || fallbackMessage;

  // Tratamento de erros comuns
  if (error.message.includes("UNIQUE constraint failed")) {
    message = "Este registro já existe no sistema";
  } else if (error.message.includes("FOREIGN KEY constraint failed")) {
    message = "Não é possível deletar este registro pois existem referências";
  } else if (error.message.includes("not authorized")) {
    message = "Você não tem permissão para realizar esta ação";
  }

  return createErrorResult(message, error.name);
}

/**
 * Helper para validar se um resultado é sucesso
 */
export function isSuccess<T>(result: ActionResult<T>): result is ActionResult<T> & { data: T } {
  return result.success && result.data !== undefined;
}

/**
 * Helper para validar se um resultado é erro
 */
export function isError(result: ActionResult): boolean {
  return !result.success || !!result.error;
}

/**
 * Extrair dados com segurança
 */
export function getResultData<T>(result: ActionResult<T>): T | null {
  return isSuccess(result) ? result.data : null;
}

/**
 * Extrair mensagem de erro com fallback
 */
export function getErrorMessage(
  result: ActionResult,
  fallback: string = "Ocorreu um erro inesperado"
): string {
  return result.error || fallback;
}
