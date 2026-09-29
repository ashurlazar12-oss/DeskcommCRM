import { describe, expect, it } from "vitest";

import {
  hasImoveisMatchingCriteria,
  matchLeadToProperty,
  rankLeadsForProperty,
} from "@/lib/imoveis/matching";

const property = {
  id: "property-1",
  title: "Casa",
  status: "available" as const,
  price_cents: 900_000,
  currency: "BRL",
  property_type: "house",
  listing_type: "sale" as const,
  city: "Erbil",
  bedrooms: 3,
  bathrooms: 2,
  area_m2: 180,
};

describe("imoveis matching", () => {
  it("matches a lead when all hard criteria are satisfied", () => {
    const result = matchLeadToProperty(
      {
        id: "lead-1",
        title: "Família",
        custom_fields: {
          imoveis_listing_type: "sale",
          imoveis_property_type: "house",
          imoveis_max_price_cents: 1_000_000,
          imoveis_min_bedrooms: 3,
          imoveis_min_area_m2: 150,
          imoveis_city: "Erbil",
        },
      },
      property,
    );

    expect(result.excluded).toBe(false);
    expect(result.score).toBe(100);
    expect(result.reasons.length).toBeGreaterThan(0);
  });

  it("excludes a property above the lead budget", () => {
    const result = matchLeadToProperty(
      {
        id: "lead-2",
        title: "Orçamento limitado",
        custom_fields: { imoveis_max_price_cents: 800_000 },
      },
      property,
    );

    expect(result.excluded).toBe(true);
    expect(result.exclusion_reasons).toContain(
      "Preço acima do orçamento máximo informado.",
    );
  });

  it("excludes an unsuitable city instead of recommending it", () => {
    const result = matchLeadToProperty(
      {
        id: "lead-3",
        title: "Outra cidade",
        custom_fields: { imoveis_city: "Sulaymaniyah" },
      },
      property,
    );

    expect(result.excluded).toBe(true);
    expect(result.exclusion_reasons).toContain(
      "Cidade não está entre as preferências informadas.",
    );
  });

  it("excludes unavailable properties", () => {\n    const result = matchLeadToProperty(\n      { id: "lead-5", title: "Lead", custom_fields: { imoveis_listing_type: "sale" } },\n      { ...property, status: "sold" },\n    );\n\n    expect(result.excluded).toBe(true);\n    expect(result.exclusion_reasons).toContain(\n      "Imóvel não está disponível para recomendação.",\n    );\n  });\n\n  it("does not invent a match when no structured preferences exist", () => {
    const result = matchLeadToProperty(
      { id: "lead-4", title: "Sem perfil", custom_fields: {} },
      property,
    );

    expect(result.score).toBe(0);
    expect(result.excluded).toBe(false);
  });

  it("ranks compatible leads by score", () => {
    const results = rankLeadsForProperty(
      [
        {
          id: "lead-a",
          title: "Parcial",
          custom_fields: { imoveis_max_price_cents: 1_000_000 },
        },
        {
          id: "lead-b",
          title: "Completo",
          custom_fields: {
            imoveis_listing_type: "sale",
            imoveis_property_type: "house",
            imoveis_max_price_cents: 1_000_000,
            imoveis_min_bedrooms: 3,
            imoveis_min_area_m2: 150,
            imoveis_city: "Erbil",
          },
        },
      ],
      property,
    );

    expect(results.map((result) => result.lead_id)).toEqual(["lead-b", "lead-a"]);
  });

  it("detects supported preference fields", () => {
    expect(hasImoveisMatchingCriteria({ imoveis_max_price_cents: 1 })).toBe(true);
    expect(hasImoveisMatchingCriteria({ unrelated: "value" })).toBe(false);
  });
});
