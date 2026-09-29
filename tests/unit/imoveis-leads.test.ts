import { describe, expect, it } from "vitest";

import {
  IMOVEIS_LEAD_RELATIONSHIPS,
  relationshipLabel,
} from "@/lib/imoveis/leads";

describe("Imóveis — leads e clientes", () => {
  it("mantém o vocabulário de relação fechado", () => {
    expect(IMOVEIS_LEAD_RELATIONSHIPS).toEqual([
      "interested",
      "presented",
      "rejected",
    ]);
  });

  it("expõe rótulos estáveis para a UI", () => {
    expect(relationshipLabel("interested")).toBe("Interessado");
    expect(relationshipLabel("presented")).toBe("Apresentado");
    expect(relationshipLabel("rejected")).toBe("Recusado");
  });
});
