export const IMOVEIS_MEDIA_BUCKET = "imoveis-media";
export const IMOVEIS_MEDIA_TYPES = ["image", "video"] as const;

export type ImoveisMediaType = (typeof IMOVEIS_MEDIA_TYPES)[number];

export const IMOVEIS_MEDIA_MAX_BYTES = 100 * 1024 * 1024;

const MIME_TO_EXTENSION: Record<string, { mediaType: ImoveisMediaType; extension: string }> = {
  "image/jpeg": { mediaType: "image", extension: "jpg" },
  "image/png": { mediaType: "image", extension: "png" },
  "image/webp": { mediaType: "image", extension: "webp" },
  "image/gif": { mediaType: "image", extension: "gif" },
  "video/mp4": { mediaType: "video", extension: "mp4" },
  "video/webm": { mediaType: "video", extension: "webm" },
  "video/quicktime": { mediaType: "video", extension: "mov" },
};

export const IMOVEIS_MEDIA_ALLOWED_MIME_TYPES = Object.freeze(Object.keys(MIME_TO_EXTENSION));

export type ValidatedImoveisMedia = {
  mediaType: ImoveisMediaType;
  extension: string;
  mimeType: string;
  size: number;
};

export function validarMidiaImovel(input: { mimeType: string; size: number }): ValidatedImoveisMedia {
  const descriptor = MIME_TO_EXTENSION[input.mimeType.toLowerCase()];
  if (!descriptor) throw new Error("unsupported_media_type");
  if (!Number.isSafeInteger(input.size) || input.size <= 0 || input.size > IMOVEIS_MEDIA_MAX_BYTES) {
    throw new Error("invalid_media_size");
  }
  return {
    mediaType: descriptor.mediaType,
    extension: descriptor.extension,
    mimeType: input.mimeType.toLowerCase(),
    size: input.size,
  };
}

export function criarCaminhoMidiaImovel(input: {
  organizationId: string;
  propertyId: string;
  mediaId: string;
  extension: string;
}): string {
  return `${input.organizationId}/${input.propertyId}/${input.mediaId}.${input.extension}`;
}

export function caminhoMidiaPertenceAoImovel(
  path: string,
  organizationId: string,
  propertyId: string,
): boolean {
  const [org, property, file, ...extra] = path.split("/");
  return extra.length === 0 && org === organizationId && property === propertyId && !!file;
}
