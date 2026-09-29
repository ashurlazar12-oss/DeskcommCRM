import { describe, expect, it } from "vitest";

import { precoParaCentavos } from "./schemas";

describe("imoveis schemas", () => {
  it("converte preço decimal para centavos sem ponto flutuante", () => {
    expect(precoParaCentavos("1250,50")).toBe(125050);
    expect(precoParaCentavos("99")).toBe(9900);
  });
});
