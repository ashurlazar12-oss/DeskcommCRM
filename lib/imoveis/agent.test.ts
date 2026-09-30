import { describe, expect, it } from "vitest";

import {
  applyImoveisPreferences,
  findImoveisMatches,
  mergeImoveisPreferences,
} from "@/lib/imoveis/agent";

function fakeDb(rows: unknown[][]) {
  let call = 0;
  return {
    query: async () => ({ rows: rows[call++] ?? [] }),
  } as never;
}

describe("imoveis agent", () => {
  it("merges preferences, preserves unrelated fields, and removes aliases", () => {
    const result = mergeImoveisPreferences(
      {
        unrelated: "keep",
        imoveis_max_price_cents: 900_000,
        max_price_cents: 800_000,
      },
      {
        max_price_cents: 1_000_000,
        city: "Erbil",
        cities: ["Erbil", "Erbil", "Sulaymaniyah"],
      },
    );

    expect(result.changed_fields).toEqual([
      "max_price_cents",
      "city",
      "cities",
    ]);
    expect(result.fields).toEqual({
      unrelated: "keep",
      imoveis_max_price_cents: 1_000_000,
      imoveis_city: "Erbil",
      imoveis_cities: ["Erbil", "Sulaymaniyah"],
    });
  });

  it("clears a preference without touching unrelated fields", () => {
    const result = mergeImoveisPreferences(
      {
        unrelated: "keep",
        imoveis_max_price_cents: 900_000,
      },
      { max_price_cents: null },
    );

    expect(result.fields).toEqual({ unrelated: "keep" });
  });

  it("rejects prototype-pollution keys before writing", async () => {
    const db = fakeDb([[{ custom_fields: {} }]]);
    const result = await applyImoveisPreferences(
      db,
      {
        tenantId: "org-1",
        leadId: "lead-1",
        jobId: "job-1",
        agentId: "agent-1",
      },
      JSON.parse('{"__proto__":{"polluted":true}}'),
    );

    expect(result).toMatchObject({
      ok: false,
      error: { code: "invalid_payload" },
    });
  });

  it("returns no preferences before querying properties", async () => {
    const db = fakeDb([
      [{ ok: 1 }],
      [{ title: "Lead", custom_fields: { unrelated: true } }],
    ]);

    const result = await findImoveisMatches(db, {
      tenantId: "org-1",
      leadId: "lead-1",
    });

    expect(result).toMatchObject({
      ok: true,
      status: "no_preferences",
      matches: [],
    });
  });


  it("returns ranked available matches and excludes unavailable properties", async () => {
    const db = fakeDb([
      [{ ok: 1 }],
      [
        {
          title: "Lead",
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
      [
        {
          property_code: "A1",
          title: "Casa compatível",
          status: "available",
          price_cents: 900_000,
          currency: "IQD",
          property_type: "house",
          listing_type: "sale",
          city: "Erbil",
          bedrooms: 3,
          bathrooms: 2,
          area_m2: 180,
          description: "Casa disponível.",
        },
        {
          property_code: "A2",
          title: "Casa vendida",
          status: "sold",
          price_cents: 850_000,
          currency: "IQD",
          property_type: "house",
          listing_type: "sale",
          city: "Erbil",
          bedrooms: 3,
          bathrooms: 2,
          area_m2: 180,
          description: "Não deve ser recomendada.",
        },
      ],
    ]);

    const result = await findImoveisMatches(
      db,
      { tenantId: "org-1", leadId: "lead-1" },
    );

    expect(result).toMatchObject({
      ok: true,
      status: "matches",
      evaluated_properties: 2,
      excluded_properties: 1,
    });
    if (!result.ok) return;
    expect(result.matches).toHaveLength(1);
    expect(result.matches[0]).toMatchObject({
      property_code: "A1",
      score: 90,
      title: "Casa compatível",
    });
  });

  it("can update structured preferences with a tenant-scoped lead", async () => {
    const db = fakeDb([
      [{ ok: 1 }],
      [{ custom_fields: { unrelated: "keep" } }],
      [],
    ]);

    const result = await applyImoveisPreferences(
      db,
      {
        tenantId: "org-1",
        leadId: "lead-1",
        jobId: "job-1",
        agentId: "agent-1",
      },
      { listing_type: "sale", max_price_cents: 1_000_000 },
    );

    expect(result).toMatchObject({
      ok: true,
      status: "updated",
      changed_fields: ["listing_type", "max_price_cents"],
    });
  });
});
