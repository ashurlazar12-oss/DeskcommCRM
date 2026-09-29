import type { SupabaseClient } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";

export const IMOVEIS_STATUS = [
  "draft",
  "available",
  "reserved",
  "sold",
  "rented",
  "archived",
] as const;

export const IMOVEIS_PROPERTY_TYPES = [
  "house",
  "apartment",
  "land",
  "commercial",
  "commercial_room",
  "warehouse",
  "other",
] as const;

export const IMOVEIS_LISTING_TYPES = ["sale", "rent"] as const;

export type ImovelStatus = (typeof IMOVEIS_STATUS)[number];
export type ImovelPropertyType = (typeof IMOVEIS_PROPERTY_TYPES)[number];
export type ImovelListingType = (typeof IMOVEIS_LISTING_TYPES)[number];

export type ImovelRow = {
  id: string;
  organization_id: string;
  property_code: string;
  status: ImovelStatus;
  price_cents: number;
  currency: string;
  title: string;
  property_type: ImovelPropertyType;
  listing_type: ImovelListingType;
  description: string;
  address: string;
  city: string;
  latitude: number | null;
  longitude: number | null;
  bedrooms: number;
  bathrooms: number;
  area_m2: number;
  created_at: string;
  updated_at: string;
};

export type ImovelImagemRow = {
  id: string;
  organization_id: string;
  property_id: string;
  image_url: string;
  alt_text: string;
  sort_order: number;
  created_at: string;
};

type ImoveisDatabase = {
  public: {
    Tables: {
      imoveis_properties: {
        Row: ImovelRow;
        Insert: Partial<ImovelRow> & {
          organization_id: string;
          price_cents: number;
        };
        Update: Partial<ImovelRow>;
        Relationships: [];
      };
      imoveis_property_images: {
        Row: ImovelImagemRow;
        Insert: Partial<ImovelImagemRow> & {
          organization_id: string;
          property_id: string;
          image_url: string;
        };
        Update: Partial<ImovelImagemRow>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};

export async function createImoveisClient(): Promise<SupabaseClient<ImoveisDatabase>> {
  return (await createClient()) as unknown as SupabaseClient<ImoveisDatabase>;
}

export function tabelaNaoInstalada(error: { code?: string } | null): boolean {
  return error?.code === "42P01";
}
