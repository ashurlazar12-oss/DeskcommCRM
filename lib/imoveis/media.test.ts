import { describe, expect, it } from "vitest";

import { caminhoDeMidiaImovel, validarMidiaImovel } from "./media";

describe("validarMidiaImovel", () => {
  it("accepts an image within the image limit", () => {
    expect(validarMidiaImovel({ contentType: "image/jpeg", sizeBytes: 1024 })).toEqual({
      ok: true,
      kind: "image",
      extension: "jpg",
    });
  });

  it("accepts a video within the video limit", () => {
    expect(validarMidiaImovel({ contentType: "video/mp4", sizeBytes: 10 * 1024 * 1024 })).toEqual({
      ok: true,
      kind: "video",
      extension: "mp4",
    });
  });

  it("rejects unsupported mime types", () => {
    expect(validarMidiaImovel({ contentType: "image/svg+xml", sizeBytes: 1024 })).toMatchObject({ ok: false });
  });

  it("rejects oversized files", () => {
    expect(validarMidiaImovel({ contentType: "image/png", sizeBytes: 16 * 1024 * 1024 })).toMatchObject({ ok: false });
    expect(validarMidiaImovel({ contentType: "video/mp4", sizeBytes: 101 * 1024 * 1024 })).toMatchObject({ ok: false });
  });
});

describe("caminhoDeMidiaImovel", () => {
  it("scopes the object path by organization and property", () => {
    expect(caminhoDeMidiaImovel({
      organizationId: "11111111-1111-4111-8111-111111111111",
      propertyId: "22222222-2222-4222-8222-222222222222",
      mediaId: "33333333-3333-4333-8333-333333333333",
      extension: "jpg",
    })).toBe("11111111-1111-4111-8111-111111111111/22222222-2222-4222-8222-222222222222/33333333-3333-4333-8333-333333333333.jpg");
  });
});
