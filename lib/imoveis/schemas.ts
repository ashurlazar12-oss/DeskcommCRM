import { z } from "zod";

import {
  IMOVEIS_LISTING_TYPES,
  IMOVEIS_PROPERTY_TYPES,
  IMOVEIS_STATUS,
} from "./server";

const textoOpcional = z
  .string()
  .trim()
  .max(80)
  .optional()
  .or(z.literal(""));

const decimalOpcional = z
  .string()
  .trim()
  .optional()
  .or(z.literal(""))
  .refine(
    (value) =>
      value === undefined ||
      value === "" ||
      /^-?\d{1,6}(?:[.,]\d{1,2})?$/.test(value),
    "Informe um número válido.",
  );

function coordenadaOpcional(maxAbs: number) {
  return decimalOpcional.refine(
    (value) =>
      value === undefined ||
      value === "" ||
      Math.abs(Number(value.replace(",", "."))) <= maxAbs,
    "Informe uma coordenada válida.",
  );
}

export const imovelFormSchema = z.object({
  property_code: textoOpcional,
  title: z.string().trim().max(120).optional().or(z.literal("")),
  status: z.enum(IMOVEIS_STATUS),
  price: z
    .string()
    .trim()
    .regex(/^\d+(?:[.,]\d{1,2})?$/, "Informe um preço maior ou igual a zero."),
  currency: z.string().trim().regex(/^[A-Z]{3}$/i, "Use uma moeda de três letras."),
  property_type: z.enum(IMOVEIS_PROPERTY_TYPES),
  listing_type: z.enum(IMOVEIS_LISTING_TYPES),
  description: z.string().trim().max(5000).optional().or(z.literal("")),
  address: z.string().trim().max(240).optional().or(z.literal("")),
  city: z.string().trim().max(100).optional().or(z.literal("")),
  latitude: coordenadaOpcional(90),
  longitude: coordenadaOpcional(180),
  bedrooms: z.string().trim().regex(/^\d+$/, "Informe um número inteiro de quartos."),
  bathrooms: decimalOpcional,
  area_m2: decimalOpcional,
});

export const imovelIdSchema = z.string().uuid();

export const imovelImagemSchema = z.object({
  property_id: imovelIdSchema,
  image_url: z
    .string()
    .trim()
    .url("Informe uma URL válida.")
    .max(2048, "A URL da imagem é muito longa.")
    .refine((value) => /^https?:\/\//i.test(value), "Use uma URL HTTP ou HTTPS."),
  alt_text: z.string().trim().max(160).optional().or(z.literal("")),
});

export const imovelImagemIdSchema = z.object({
  property_id: imovelIdSchema,
  image_id: imovelIdSchema,
});

export function precoParaCentavos(value: string): number {
  const normalized = value.trim().replace(",", ".");
  const [inteira, decimal = ""] = normalized.split(".");
  return Number(inteira) * 100 + Number(decimal.padEnd(2, "0").slice(0, 2));
}

export function decimalParaNumero(value: string | undefined): number | null {
  const normalized = value?.trim().replace(",", ".") ?? "";
  if (!normalized) return null;
  return Number(normalized);
}
