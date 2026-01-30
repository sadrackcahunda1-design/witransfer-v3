"use server"

import { supabaseAdmin } from "@/lib/supabase"
import { createSafeAction } from "@/middlewares/actions/action-factory"
import type { ActionResult } from "@/types"

// Limites de upload (defensive programming)
const MAX_FILE_SIZE_MB = {
    documents: 10,
    avatars: 2,
    vehicles: 5,
    logos: 1,
    "public-assets": 5,
} as const;

const ALLOWED_MIME_TYPES: Record<string, string[]> = {
    documents: ["application/pdf", "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
    avatars: ["image/jpeg", "image/png", "image/webp"],
    vehicles: ["image/jpeg", "image/png", "image/webp"],
    logos: ["image/jpeg", "image/png", "image/webp", "image/svg+xml"],
    "public-assets": ["image/jpeg", "image/png", "image/webp", "image/gif"],
};

/**
 * Valida um arquivo no servidor (defensive - cliente também valida)
 */
function validateFileServer(
    file: File,
    bucket: string
): { valid: boolean; error?: string } {
    const maxMB = MAX_FILE_SIZE_MB[bucket as keyof typeof MAX_FILE_SIZE_MB] || 5;
    const maxBytes = maxMB * 1024 * 1024;

    // Validar tamanho
    if (file.size > maxBytes) {
        return {
            valid: false,
            error: `Arquivo ${(file.size / 1024 / 1024).toFixed(2)}MB excede limite de ${maxMB}MB`
        };
    }

    // Validar tipo MIME
    const allowedTypes = ALLOWED_MIME_TYPES[bucket] || [];
    if (allowedTypes.length > 0 && !allowedTypes.includes(file.type)) {
        return {
            valid: false,
            error: `Tipo de arquivo ${file.type} não permitido. Aceitos: ${allowedTypes.join(", ")}`
        };
    }

    return { valid: true };
}

/**
 * Server Action para upload de arquivo com validação completa
 * Suporta buckets: documents, avatars, vehicles, logos, public-assets
 */
export async function uploadFileAction(formData: FormData): Promise<ActionResult<{ url: string; path: string }>> {
    return createSafeAction(
        "UploadFileAction",
        async (): Promise<ActionResult<{ url: string; path: string }>> => {
            try {
                const file = formData.get("file") as File;
                const bucket = (formData.get("bucket") as string) || "public-assets";
                const filePath = formData.get("path") as string;

                // 1. Validar inputs
                if (!file) {
                    return {
                        success: false,
                        error: "Arquivo não encontrado na requisição",
                        errorCode: "MISSING_FILE"
                    };
                }

                if (!filePath) {
                    return {
                        success: false,
                        error: "Caminho do arquivo não especificado",
                        errorCode: "MISSING_PATH"
                    };
                }

                // 2. Validar arquivo no servidor (defensive)
                const validation = validateFileServer(file, bucket);
                if (!validation.valid) {
                    return {
                        success: false,
                        error: validation.error || "Arquivo inválido",
                        errorCode: "INVALID_FILE"
                    };
                }

                console.log(`[UploadAction] Iniciando upload: ${file.name} (${(file.size / 1024).toFixed(2)}KB) para ${bucket}/${filePath}`);

                // 3. Upload para Supabase
                const { data, error } = await supabaseAdmin.storage
                    .from(bucket)
                    .upload(filePath, file, {
                        upsert: true,
                        contentType: file.type
                    });

                if (error || !data) {
                    console.error("[UploadAction] Erro do Supabase:", error);
                    return {
                        success: false,
                        error: error?.message || "Falha ao salvar arquivo no storage",
                        errorCode: "STORAGE_ERROR"
                    };
                }

                // 4. Gerar URL apropriada conforme o bucket
                let finalUrl: string;

                if (bucket === "documents") {
                    // Buckets privados: gerar Signed URL (24h de validade)
                    const { data: signedData, error: signedError } = await supabaseAdmin.storage
                        .from(bucket)
                        .createSignedUrl(data.path, 60 * 60 * 24); // 24 horas

                    if (signedError) {
                        console.error("[UploadAction] Erro ao criar Signed URL:", signedError);
                        return {
                            success: false,
                            error: "Falha ao gerar URL de acesso do documento",
                            errorCode: "SIGNED_URL_ERROR"
                        };
                    }
                    finalUrl = signedData.signedUrl;
                } else {
                    // Buckets públicos: URL pública
                    const { data: { publicUrl } } = supabaseAdmin.storage
                        .from(bucket)
                        .getPublicUrl(data.path);
                    finalUrl = publicUrl;
                }

                console.log(`[UploadAction] Upload concluído: ${data.path}`);

                return {
                    success: true,
                    message: "Arquivo enviado com sucesso",
                    data: { url: finalUrl, path: data.path }
                };
            } catch (err: any) {
                console.error("[UploadAction] Erro crítico:", err);

                return {
                    success: false,
                    error: err?.message || "Erro ao processar upload",
                    errorCode: "UPLOAD_ERROR"
                };
            }
        },
        {} // input para createSafeAction
    );
}
