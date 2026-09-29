import { describe, expect, it } from "vitest";

import { marketingBackoffMinutes, normalizarHashtags } from "@/lib/imoveis/marketing";
import { marketingCopySchema, montarPromptMarketing } from "@/app/actions/imoveis/marketing";

describe("Imóveis marketing", () => {
  it("normaliza hashtags, remove duplicadas e limita a 12", () => {
    const result = normalizarHashtags(
      "#Casa #casa aluguel #Erbil #Kurdistan #1 #2 #3 #4 #5 #6 #7 #8 #9 #10",
    );
    expect(result.length).toBe(12);
    expect(result[0]).toBe("#Casa");
    expect(result[1]).toBe("#aluguel");
    expect(new Set(result.map((value) => value.toLowerCase())).size).toBe(result.length);
  });

  it("usa backoff exponencial limitado a 60 minutos", () => {
    expect(marketingBackoffMinutes(0)).toBe(1);
    expect(marketingBackoffMinutes(2)).toBe(4);
    expect(marketingBackoffMinutes(8)).toBe(60);
  });

  it("proíbe invenção de fatos no prompt", () => {
    const prompt = montarPromptMarketing({
      language: "pt-BR",
      platform: "instagram",
      imageCount: 3,
      property: { title: "Casa Central", bedrooms: 3 },
    });
    expect(prompt).toContain("Não invente características");
    expect(prompt).toContain("Casa Central");
  });

  it("valida a estrutura produzida pela IA", () => {
    const parsed = marketingCopySchema.safeParse({
      headline: "Casa Central",
      caption: "Uma casa confortável em uma localização prática.",
      hashtags: ["#casa", "#imoveis"],
      cta: "Fale com nossa equipe.",
      alt_text: "Fachada da casa",
    });
    expect(parsed.success).toBe(true);
  });
});
