import { z } from "zod";

import {
  IMOVEIS_LISTING_TYPES,
  IMOVEIS_PROPERTY_TYPES,
  IMOVEIS_STATUS,
} from "./server";

const textoOpcional = z
  .string()
  .trim()
  .max(120)
  .optional()
  .or(z.literal(""));

const textoLongo = z.string().trim().max(5000);

const decimalOpcional = z
  .string()
  .trim()
  .optional()
  .or(z.literal(""));

export const imovelFormSchema = z.object({
  property_code: z.string().trim().max(80).optional().or(z.literal("")),
  title: textoOpcional,
  status: z.enum(IMOVEIS_STATUS),
  price: z
    .string()
    .trim()
    .regex(/^\d+(?:[.,]\d{1,2})?$/, "Informe um preço maior ou igual a zero."),
  currency: z.string().trim().regex(/^[A-Z]{3}$/i, "Use uma moeda de três letras."),
  property_type: z.enum(IMOVEIS_PROPERTY_TYPES),
  listing_type: z.enum(IMOVEIS_LISTING_TYPES),
  description: textoLongo,
  address: z.string().trim().max(240),
  city: z.string().trim().max(100),
  latitude: decimalOpcional,
  longitude: decimalOpcional,
  bedrooms: z.string().trim().regex(/^\d+$/, "Quartos inválidos."),
  bathrooms: decimalOpcional.refine(
    (value) => value === "" || /^\d+(?:[.,]\d)?$/.test(value),
    "Banheiros inválidos.",
  ),
  area_m2: decimalOpcional.refine(
    (value) => value === "" || /^\d+(?:[.,]\d{1,2})?$/.test(value),
    "Área inválida.",
  ),
});

export const imovelImagemSchema = z.object({
  property_id: z.string().uuid(),
  image_url: z
    .string()
    .trim()
    .url("Informe uma URL de imagem válida.")
    .max(2000)
    .refine((value) => /^https?:$/i.test(new URL(value).protocol), "Use uma URL HTTP ou HTTPS."),
  alt_text: z.string().trim().max(160),
});

export const imovelImagemIdSchema = z.object({
  property_id: z.string().uuid(),
  image_id: z.string().uuid(),
});

export const imovelIdSchema = z.string().uuid();

export function precoParaCentavos(value: string): number {
  const normalized = value.trim().replace(",", ".");
  const [inteira, decimal = ""] = normalized.split(".");
  return Number(inteira) * 100 + Number(decimal.padEnd(2, "0").slice(0, 2));
}

export function decimalParaNumero(value: string | undefined): number | undefined {
  if (!value?.trim()) return undefined;
  return Number(value.trim().replace(",", "."));
}
