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


const numeroNaoNegativo = z.string().trim().regex(/^\d+(?:[.,]\d{1,2})?$/, "Informe um número maior ou igual a zero.");

export const imovelDetalhesSchema = z.object({
  title: z.string().trim().max(160),
  property_type: z.string().trim().min(1).max(40),
  listing_type: z.enum(["sale", "rent"]),
  description: z.string().trim().max(5000),
  address: z.string().trim().max(240),
  city: z.string().trim().max(80),
  latitude: z.string().trim().refine((v) => v === "" || (!Number.isNaN(Number(v)) && Number(v) >= -90 && Number(v) <= 90), "Latitude inválida."),
  longitude: z.string().trim().refine((v) => v === "" || (!Number.isNaN(Number(v)) && Number(v) >= -180 && Number(v) <= 180), "Longitude inválida."),
  bedrooms: numeroNaoNegativo,
  bathrooms: numeroNaoNegativo,
  area_m2: numeroNaoNegativo,
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
