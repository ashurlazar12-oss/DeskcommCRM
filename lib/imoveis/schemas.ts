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

const textoLongo = z.string().trim().max(5000);

const numeroOpcional = z
  .string()
  .trim()
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

export const imovelDetalhesSchema = z.object({
  id: z.string().uuid(),
  title: textoLongo.max(160),
  property_type: z.enum(IMOVEIS_PROPERTY_TYPES),
  listing_type: z.enum(IMOVEIS_LISTING_TYPES),
  description: textoLongo,
  address: z.string().trim().max(240),
  city: z.string().trim().max(120),
  latitude: numeroOpcional.refine(
    (value) => value === "" || (Number.isFinite(Number(value)) && Number(value) >= -90 && Number(value) <= 90),
    "Latitude inválida.",
  ),
  longitude: numeroOpcional.refine(
    (value) => value === "" || (Number.isFinite(Number(value)) && Number(value) >= -180 && Number(value) <= 180),
    "Longitude inválida.",
  ),
  bedrooms: z.string().trim().regex(/^\d+$/, "Quartos inválidos."),
  bathrooms: z.string().trim().regex(/^\d+(?:[.,]\d)?$/, "Banheiros inválidos."),
  area_m2: z.string().trim().regex(/^\d+(?:[.,]\d{1,2})?$/, "Área inválida."),
});

export const imovelImagemSchema = z.object({
  property_id: z.string().uuid(),
  image_url: z.string().trim().url("Informe uma URL de imagem válida.").max(2000),
  alt_text: z.string().trim().max(160),
});

export const imovelIdSchema = z.string().uuid();

export function precoParaCentavos(value: string): number {
  const normalized = value.trim().replace(",", ".");
  const [inteira, decimal = ""] = normalized.split(".");
  return Number(inteira) * 100 + Number(decimal.padEnd(2, "0").slice(0, 2));
}

export function numeroDecimal(value: string): number {
  return Number(value.trim().replace(",", "."));
}
