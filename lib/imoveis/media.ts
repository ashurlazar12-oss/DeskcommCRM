import { z } from "zod";

export const IMOVEIS_MEDIA_BUCKET = "imoveis-media";
export const IMOVEIS_MEDIA_TYPES = ["image", "video"] as const;
export type ImoveisMediaType = (typeof IMOVEIS_MEDIA_TYPES)[number];

export const IMOVEIS_MEDIA_MIME = {
  "image/jpeg": { kind: "image", extension: "jpg", maxBytes: 15 * 1024 * 1024 },
  "image/png": { kind: "image", extension: "png", maxBytes: 15 * 1024 * 1024 },
  "image/webp": { kind: "image", extension: "webp", maxBytes: 15 * 1024 * 1024 },
  "video/mp4": { kind: "video", extension: "mp4", maxBytes: 100 * 1024 * 1024 },
  "video/webm": { kind: "video", extension: "webm", maxBytes: 100 * 1024 * 1024 },
  "video/quicktime": { kind: "video", extension: "mov", maxBytes: 100 * 1024 * 1024 },
} as const;

export type ImoveisMediaMime = keyof typeof IMOVEIS_MEDIA_MIME;

export const mediaUploadRequestSchema = z.object({
  property_id: z.string().uuid(),
  original_name: z.string().trim().min(1).max(255),
  content_type: z.string().trim().min(1).max(120),
  size_bytes: z.number().int().positive(),
  alt_text: z.string().trim().max(160).default(""),
});

export function validarMidiaImovel(input: {
  contentType: string;
  sizeBytes: number;
}): { ok: true; kind: ImoveisMediaType; extension: string } | { ok: false; error: string } {
  const spec = IMOVEIS_MEDIA_MIME[input.contentType as ImoveisMediaMime];
  if (!spec) {
    return { ok: false, error: "Formato não permitido. Use JPG, PNG, WebP, MP4, WebM ou MOV." };
  }
  if (!Number.isSafeInteger(input.sizeBytes) || input.sizeBytes <= 0 || input.sizeBytes > spec.maxBytes) {
    const maxMb = Math.floor(spec.maxBytes / 1024 / 1024);
    return { ok: false, error: `Arquivo excede o limite de ${maxMb} MB para ${spec.kind === "image" ? "imagem" : "vídeo"}.` };
  }
  return { ok: true, kind: spec.kind, extension: spec.extension };
}

export function caminhoDeMidiaImovel(input: {
  organizationId: string;
  propertyId: string;
  mediaId: string;
  extension: string;
}): string {
  return `${input.organizationId}/${input.propertyId}/${input.mediaId}.${input.extension}`;
}
