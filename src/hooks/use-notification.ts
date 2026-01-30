import { toast } from 'sonner';
import type { ActionResult } from '@/types';

export type NotificationType = 'success' | 'error' | 'warning' | 'info';

export interface NotificationOptions {
    duration?: number;
    description?: string;
    action?: {
        label: string;
        onClick: () => void;
    };
}

/**
 * Hook reutilizável para exibir notificações (toasts)
 * Padroniza o uso de mensagens em toda a aplicação
 */
export function useNotification() {
    /**
     * Exibe mensagem de sucesso
     */
    const sucesso = (mensagem: string, options?: NotificationOptions) => {
        toast.success(mensagem, {
            description: options?.description,
            duration: options?.duration || 3000,
            action: options?.action,
        });
    };

    /**
     * Exibe mensagem de erro
     * Nunca mostra "Ocorreu um erro" genérico - sempre mostra a mensagem real
     */
    const erro = (mensagem: string, options?: NotificationOptions) => {
        // Garantir que sempre mostramos uma mensagem clara
        const mensagemFinal = mensagem && mensagem.trim() 
            ? mensagem 
            : 'Ocorreu um erro na operação';

        toast.error(mensagemFinal, {
            description: options?.description,
            duration: options?.duration || 4000,
            action: options?.action,
        });
    };

    /**
     * Exibe mensagem de aviso/alerta
     */
    const aviso = (mensagem: string, options?: NotificationOptions) => {
        toast.warning(mensagem, {
            description: options?.description,
            duration: options?.duration || 3000,
            action: options?.action,
        });
    };

    /**
     * Exibe mensagem informativa
     */
    const info = (mensagem: string, options?: NotificationOptions) => {
        toast.info(mensagem, {
            description: options?.description,
            duration: options?.duration || 3000,
            action: options?.action,
        });
    };

    /**
     * Exibe mensagem genérica
     */
    const mostrar = (mensagem: string, tipo: NotificationType = 'info', options?: NotificationOptions) => {
        switch (tipo) {
            case 'success':
                sucesso(mensagem, options);
                break;
            case 'error':
                erro(mensagem, options);
                break;
            case 'warning':
                aviso(mensagem, options);
                break;
            case 'info':
            default:
                info(mensagem, options);
                break;
        }
    };

    /**
     * Trata ActionResult com mensagens padronizadas e seguras
     * NUNCA mostra "erro desconhecido" - sempre tem uma mensagem real
     */
    const tratarResultado = <T = any>(
        resultado: ActionResult<T>,
        mensagemSucessoPadrao?: string,
        mensagemErroPadrao?: string
    ): boolean => {
        if (resultado.success) {
            // Mostrar mensagem de sucesso
            const msg = mensagemSucessoPadrao || resultado.message || 'Operação concluída com sucesso!';
            sucesso(msg);
            return true;
        } else {
            // Mostrar mensagem de erro - SEMPRE tem que ter algo real
            const msg = mensagemErroPadrao || resultado.error || 'Ocorreu um erro na operação';
            erro(msg);
            return false;
        }
    };

    /**
     * Tratamento de erro puro (sem passar por ActionResult)
     * Útil para erros de rede ou exceções
     */
    const tratarErro = (
        erro_: Error | string | undefined,
        mensagemPadrao: string = 'Ocorreu um erro na operação'
    ) => {
        let mensagem = mensagemPadrao;

        if (typeof erro_ === 'string' && erro_.trim()) {
            mensagem = erro_;
        } else if (erro_ instanceof Error && erro_.message?.trim()) {
            mensagem = erro_.message;
        }

        erro(mensagem);
    };

    return {
        sucesso,
        erro,
        aviso,
        info,
        mostrar,
        tratarResultado,
        tratarErro,
    };
}
