import { useState, useCallback } from "react";
import { useNotification } from "./use-notification";
import type { ActionResult } from "@/types";

export interface ActionHandlerOptions {
    successMessage?: string;
    errorMessage?: string;
    onSuccess?: (data?: any) => void;
    onError?: (error: string) => void;
    showNotifications?: boolean;
    delay?: number; // Delay em ms antes de processar o resultado
}

/**
 * Hook reutilizável para padronizar o tratamento de ações assíncronas
 * Gerencia loading, erros e mensagens de forma consistente
 */
export function useActionHandler() {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const { tratarResultado, tratarErro } = useNotification();

    /**
     * Helper para aplicar delay opcional
     */
    const applyDelay = async (ms?: number) => {
        if (ms && ms > 0) {
            await new Promise(resolve => setTimeout(resolve, ms));
        }
    };

    /**
     * Executa uma ação assíncrona com tratamento padronizado
     * Garante que erros sempre têm mensagens reais, nunca "erro desconhecido"
     */
    const execute = useCallback(
        async <T = any>(
            action: () => Promise<ActionResult<T>>,
            options: ActionHandlerOptions = {}
        ): Promise<T | null> => {
            const {
                successMessage,
                errorMessage,
                onSuccess,
                onError,
                showNotifications = true,
                delay,
            } = options;

            setLoading(true);
            setError(null);

            try {
                const resultado = await action();

                // Aplicar delay se especificado
                await applyDelay(delay);

                if (resultado.success) {
                    if (showNotifications) {
                        tratarResultado(resultado, successMessage);
                    }

                    onSuccess?.(resultado.data);
                    return resultado.data || null;
                } else {
                    // Erro - sempre tem mensagem real
                    const errorMsg = errorMessage || resultado.error || "Operação não foi concluída";
                    setError(errorMsg);

                    if (showNotifications) {
                        tratarErro(errorMsg);
                    }

                    onError?.(errorMsg);
                    return null;
                }
            } catch (err: any) {
                // Tratamento de exceção - garantir mensagem real
                const errorMsg = errorMessage || err?.message || "Erro na operação";
                setError(errorMsg);

                if (showNotifications) {
                    tratarErro(err instanceof Error ? err : errorMsg);
                }

                onError?.(errorMsg);
                return null;
            } finally {
                setLoading(false);
            }
        },
        [tratarResultado, tratarErro]
    );

    /**
     * Executa ação sem exibir notificações (apenas gerencia estado)
     */
    const executeSilent = useCallback(
        async <T = any>(
            action: () => Promise<ActionResult<T>>,
            options: Omit<ActionHandlerOptions, "showNotifications"> = {}
        ): Promise<T | null> => {
            return execute(action, { ...options, showNotifications: false });
        },
        [execute]
    );

    /**
     * Limpa o estado de erro
     */
    const clearError = useCallback(() => {
        setError(null);
    }, []);

    return {
        execute,
        executeSilent,
        loading,
        error,
        clearError,
    };
}


