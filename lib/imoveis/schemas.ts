import { z } from "zod";

import { IMOVEIS_STATUS } from "./server";

const textoOpcional = z
  .string()
  .trim()
  .max(80)
  .optional()
  .or(z.literal(""));

export const imovelFormSchema = z.object({
  property_code: textoOpcional,
  status: z.enum(IMOVEIS_STATUS),
  price: z
    .string()
    .trim()
    .regex(/^\d+(?:[.,]\d{1,2})?$/, "Informe um preço maior ou igual a zero."),
  currency: z.string().trim().regex(/^[A-Z]{3}$/i, "Use uma moeda de três letras."),
});

export const imovelIdSchema = z.string().uuid();

export function precoParaCentavos(value: string): number {
  const normalized = value.trim().replace(",", ".");
  const [inteira, decimal = ""] = normalized.split(".");
  return Number(inteira) * 100 + Number(decimal.padEnd(2, "0").slice(0, 2));
}
