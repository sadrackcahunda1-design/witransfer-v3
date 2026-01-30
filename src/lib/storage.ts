
import { supabase } from "@/lib/supabase";
import { v4 as uuidv4 } from "uuid";

// Buckets defined in supabase/schema.sql
export const STORAGE_BUCKETS = {
    PUBLIC_ASSETS: "public-assets",
    VEHICLES: "vehicles",
    LOGOS: "logos",
    DOCUMENTS: "documents", // Private
    AVATARS: "avatars",
} as const;

export type BucketName = (typeof STORAGE_BUCKETS)[keyof typeof STORAGE_BUCKETS];

export interface UploadResult {
    path: string;
    url: string;
    fullPath?: string;
}

// Limites de upload por tipo de bucket
const UPLOAD_LIMITS = {
    [STORAGE_BUCKETS.VEHICLES]: { maxSizeKB: 5120, mimeTypes: ["image/jpeg", "image/png", "image/webp"] },
    [STORAGE_BUCKETS.AVATARS]: { maxSizeKB: 2048, mimeTypes: ["image/jpeg", "image/png", "image/webp"] },
    [STORAGE_BUCKETS.LOGOS]: { maxSizeKB: 1024, mimeTypes: ["image/jpeg", "image/png", "image/webp", "image/svg+xml"] },
    [STORAGE_BUCKETS.DOCUMENTS]: { maxSizeKB: 10240, mimeTypes: ["application/pdf", "application/msword", "application/vnd.ms-excel"] },
    [STORAGE_BUCKETS.PUBLIC_ASSETS]: { maxSizeKB: 5120, mimeTypes: ["image/jpeg", "image/png", "image/gif", "image/webp"] },
};

/**
 * Valida um arquivo antes do upload
 */
function validateFile(
    file: File,
    bucket: BucketName
): { valid: boolean; error?: string } {
    const limits = UPLOAD_LIMITS[bucket];
    if (!limits) {
        return { valid: true }; // Sem restrições se bucket não definido
    }

    const fileSizeKB = file.size / 1024;

    // Validar tamanho
    if (fileSizeKB > limits.maxSizeKB) {
        return {
            valid: false,
            error: `Arquivo muito grande. Máximo ${limits.maxSizeKB}KB, você enviou ${Math.round(fileSizeKB)}KB`
        };
    }

    // Validar tipo MIME
    if (!limits.mimeTypes.includes(file.type)) {
        return {
            valid: false,
            error: `Tipo de arquivo não permitido. Aceitos: ${limits.mimeTypes.join(", ")}`
        };
    }

    return { valid: true };
}

/**
 * Uploads a file to a specific Supabase Storage bucket.
 * Generates a unique filename using UUID with proper validation.
 */
export async function uploadFile(
    file: File,
    bucket: BucketName,
    folder: string = "",
    timeoutMs: number = 30000
): Promise<{ success: boolean; data?: UploadResult; error?: string }> {
    try {
        // 1. Validar arquivo ANTES de upload
        const validation = validateFile(file, bucket);
        if (!validation.valid) {
            return {
                success: false,
                error: validation.error || "Arquivo inválido"
            };
        }

        console.log(`[Storage] Iniciando upload: ${file.name} (${Math.round(file.size / 1024)}KB) para ${bucket}/${folder}`);

        const fileExt = file.name.split(".").pop()?.toLowerCase();
        const fileName = `${uuidv4()}.${fileExt || 'bin'}`;
        const filePath = folder ? `${folder}/${fileName}` : fileName;

        // 2. Upload COM TIMEOUT
        const uploadPromise = supabase.storage
            .from(bucket)
            .upload(filePath, file, {
                cacheControl: "3600",
                upsert: false,
            });

        const timeoutPromise = new Promise((_, reject) =>
            setTimeout(() => reject(new Error(`Upload timeout após ${timeoutMs}ms`)), timeoutMs)
        );

        const { data, error } = await Promise.race([
            uploadPromise,
            timeoutPromise
        ]) as any;

        if (error) {
            console.error("[Storage] Upload Error:", error);
            return {
                success: false,
                error: `Falha no upload: ${error.message || 'Erro desconhecido'}`
            };
        }

        // 3. Get Public URL
        const {
            data: { publicUrl },
        } = supabase.storage.from(bucket).getPublicUrl(data.path);

        console.log(`[Storage] Upload concluído com sucesso: ${data.path}`);

        return {
            success: true,
            data: {
                path: data.path,
                url: publicUrl,
                fullPath: data.fullPath,
            },
        };
    } catch (err: any) {
        console.error("[Storage] Erro no upload:", err);
        
        const errorMsg = err?.message?.includes("timeout")
            ? "Tempo limite de upload excedido. Tente novamente com um arquivo menor."
            : err?.message || "Erro desconhecido durante upload";

        return {
            success: false,
            error: errorMsg
        };
    }
}

/**
 * Uploads a vehicle image to the 'vehicles' bucket.
 * Max 5MB, PNG/JPEG/WEBP apenas.
 */
export async function uploadVehicleImage(file: File, timeoutMs: number = 30000) {
    return uploadFile(file, STORAGE_BUCKETS.VEHICLES, "images", timeoutMs);
}

/**
 * Uploads a company or supplier logo to the 'logos' bucket.
 * Max 1MB, PNG/JPEG/WEBP/SVG apenas.
 */
export async function uploadCompanyLogo(file: File, timeoutMs: number = 30000) {
    return uploadFile(file, STORAGE_BUCKETS.LOGOS, "logos", timeoutMs);
}

/**
 * Uploads a user or driver avatar to the 'avatars' bucket.
 * Max 2MB, PNG/JPEG/WEBP apenas.
 */
export async function uploadAvatar(file: File, timeoutMs: number = 30000) {
    return uploadFile(file, STORAGE_BUCKETS.AVATARS, "avatars", timeoutMs);
}

/**
 * Uploads a private document to the 'documents' bucket.
 * Max 10MB, PDF/DOC/XLS apenas.
 * Note: Does not return a usable public URL, only the path.
 */
export async function uploadPrivateDocument(
    file: File,
    documentType: string = "general",
    timeoutMs: number = 45000
) {
    const result = await uploadFile(file, STORAGE_BUCKETS.DOCUMENTS, documentType, timeoutMs);
    if (result.success && result.data) {
        // For private buckets, the publicUrl is not accessible.
        // We return the path so the application can request a Signed URL later.
        return {
            success: true,
            data: {
                ...result.data,
                url: "", // Not public
                path: result.data.path
            }
        };
    }
    return result;
}

/**
 * Generates a temporary signed URL for a private file.
 * Valid for 1 hour by default.
 */
export async function getSignedDocumentUrl(path: string, expiresIn = 3600) {
    const { data, error } = await supabase.storage
        .from(STORAGE_BUCKETS.DOCUMENTS)
        .createSignedUrl(path, expiresIn);

    if (error) {
        console.error("Error creating signed URL:", error);
        return null;
    }
    return data.signedUrl;
}

/**
 * Deletes a file from storage
 */
export async function deleteFile(bucket: BucketName, path: string) {
    const { error } = await supabase.storage
        .from(bucket)
        .remove([path]);

    if (error) {
        console.error("Error deleting file:", error);
        return false;
    }
    return true;
}
