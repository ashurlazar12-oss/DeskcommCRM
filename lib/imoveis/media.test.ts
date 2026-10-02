import { describe, expect, it } from "vitest";

import {
  IMOVEIS_MEDIA_MAX_BYTES,
  caminhoMidiaPertenceAoImovel,
  criarCaminhoMidiaImovel,
  validarMidiaImovel,
} from "./media";

describe("Imóveis property media", () => {
  it("classifies supported image and video MIME types", () => {
    expect(validarMidiaImovel({ mimeType: "image/jpeg", size: 123 })).toMatchObject({
      mediaType: "image",
      extension: "jpg",
      mimeType: "image/jpeg",
    });
    expect(validarMidiaImovel({ mimeType: "video/mp4", size: 456 })).toMatchObject({
      mediaType: "video",
      extension: "mp4",
      mimeType: "video/mp4",
    });
  });

  it("rejects unsupported or oversized media", () => {
    expect(() => validarMidiaImovel({ mimeType: "application/pdf", size: 10 })).toThrow("unsupported_media_type");
    expect(() => validarMidiaImovel({ mimeType: "image/png", size: IMOVEIS_MEDIA_MAX_BYTES + 1 })).toThrow("invalid_media_size");
    expect(() => validarMidiaImovel({ mimeType: "image/png", size: 0 })).toThrow("invalid_media_size");
  });

  it("creates a tenant/property scoped object path and validates its ownership", () => {
    const path = criarCaminhoMidiaImovel({
      organizationId: "11111111-1111-4111-8111-111111111111",
      propertyId: "22222222-2222-4222-8222-222222222222",
      mediaId: "33333333-3333-4333-8333-333333333333",
      extension: "webp",
    });
    expect(path).toBe("11111111-1111-4111-8111-111111111111/22222222-2222-4222-8222-222222222222/33333333-3333-4333-8333-333333333333.webp");
    expect(caminhoMidiaPertenceAoImovel(path, "11111111-1111-4111-8111-111111111111", "22222222-2222-4222-8222-222222222222")).toBe(true);
    expect(caminhoMidiaPertenceAoImovel(path, "99999999-9999-4999-8999-999999999999", "22222222-2222-4222-8222-222222222222")).toBe(false);
  });
});
