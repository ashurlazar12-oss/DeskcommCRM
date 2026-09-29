import { describe, expect, it } from "vitest";

import { filtrarImoveis } from "./filters";
import type { ImovelRow } from "./server";

const properties: ImovelRow[] = [
  {
    id: "11111111-1111-4111-8111-111111111111",
    organization_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    property_code: "VILLA-101",
    status: "available",
    price_cents: 25000000,
    currency: "USD",
    created_at: "2026-09-29T00:00:00.000Z",
    updated_at: "2026-09-29T00:00:00.000Z",
  },
  {
    id: "22222222-2222-4222-8222-222222222222",
    organization_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    property_code: "APT-202",
    status: "reserved",
    price_cents: 15000000,
    currency: "USD",
    created_at: "2026-09-28T00:00:00.000Z",
    updated_at: "2026-09-28T00:00:00.000Z",
  },
];

describe("filtrarImoveis", () => {
  it("filtra por código sem diferenciar maiúsculas e minúsculas", () => {
    expect(filtrarImoveis(properties, { busca: "villa", status: "all" })).toHaveLength(1);
    expect(filtrarImoveis(properties, { busca: "VILLA", status: "all" })[0]?.property_code).toBe(
      "VILLA-101",
    );
  });

  it("combina busca e situação", () => {
    expect(filtrarImoveis(properties, { busca: "", status: "reserved" }).map((p) => p.property_code)).toEqual([
      "APT-202",
    ]);
    expect(filtrarImoveis(properties, { busca: "apt", status: "available" })).toHaveLength(0);
  });
});
