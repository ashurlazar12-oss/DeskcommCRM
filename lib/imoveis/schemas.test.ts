import { describe, expect, it } from "vitest";

import {
  decimalParaNumero,
  imovelFormSchema,
  imovelImagemSchema,
  precoParaCentavos,
} from "./schemas";

describe("imoveis schemas", () => {
  it("converte preço decimal para centavos sem ponto flutuante", () => {
    expect(precoParaCentavos("1250,50")).toBe(125050);
    expect(precoParaCentavos("99")).toBe(9900);
  });

  it("valida o registro imobiliário enriquecido", () => {
    const result = imovelFormSchema.safeParse({
      property_code: "VILLA-101",
      title: "Villa principal",
      status: "available",
      price: "250000,00",
      currency: "USD",
      property_type: "house",
      listing_type: "sale",
      description: "Casa com jardim.",
      address: "100 Erbil View",
      city: "Erbil",
      latitude: "36,19",
      longitude: "44,01",
      bedrooms: "4",
      bathrooms: "3,5",
      area_m2: "420",
    });
    expect(result.success).toBe(true);
    expect(decimalParaNumero("3,5")).toBe(3.5);
  });

  it("aceita apenas imagens HTTP/HTTPS", () => {
    expect(
      imovelImagemSchema.safeParse({
        property_id: "11111111-1111-4111-8111-111111111111",
        image_url: "https://example.com/property.jpg",
        alt_text: "Fachada",
      }).success,
    ).toBe(true);

    expect(
      imovelImagemSchema.safeParse({
        property_id: "11111111-1111-4111-8111-111111111111",
        image_url: "javascript:alert(1)",
        alt_text: "",
      }).success,
    ).toBe(false);
  });
});
