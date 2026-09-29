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

export type ImovelStatus = (typeof IMOVEIS_STATUS)[number];

export type ImovelRow = {
  id: string;
  organization_id: string;
  property_code: string;
  status: ImovelStatus;
  price_cents: number;
  currency: string;
  created_at: string;
  updated_at: string;
};

type ImoveisDatabase = {
  public: {
    Tables: {
      imoveis_properties: {
        Row: ImovelRow;
        Insert: {
          id?: string;
          organization_id: string;
          property_code?: string;
          status?: ImovelStatus;
          price_cents: number;
          currency?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          property_code?: string;
          status?: ImovelStatus;
          price_cents?: number;
          currency?: string;
          created_at?: string;
          updated_at?: string;
        };
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
