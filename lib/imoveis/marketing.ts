import type { SupabaseClient } from "@supabase/supabase-js";
import { byteaToBuffer, decryptKey } from "@/lib/crypto/aes_gcm";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ImovelImagemRow, ImovelRow } from "@/lib/imoveis/server";

export const IMOVEIS_SOCIAL_PLATFORMS = ["instagram", "facebook"] as const;
export type ImoveisSocialPlatform = (typeof IMOVEIS_SOCIAL_PLATFORMS)[number];

export const IMOVEIS_MARKETING_LANGUAGES = ["pt-BR", "es"] as const;
export type ImoveisMarketingLanguage = (typeof IMOVEIS_MARKETING_LANGUAGES)[number];

export const IMOVEIS_MARKETING_ASSET_STATUSES = ["draft", "approved", "published", "failed"] as const;
export type ImoveisMarketingAssetStatus = (typeof IMOVEIS_MARKETING_ASSET_STATUSES)[number];

export type SocialAccountRow = {
  id: string;
  organization_id: string;
  platform: ImoveisSocialPlatform;
  account_name: string;
  external_account_id: string;
  access_token_last4: string;
  status: "connected" | "disabled";
  created_at: string;
  updated_at: string;
};

export type MarketingAssetRow = {
  id: string;
  organization_id: string;
  property_id: string;
  platform: ImoveisSocialPlatform;
  language: ImoveisMarketingLanguage;
  revision: number;
  headline: string;
  caption: string;
  hashtags: string[];
  cta: string;
  alt_text: string;
  status: ImoveisMarketingAssetStatus;
  generated_by_ai: boolean;
  approved_at: string | null;
  published_at: string | null;
  created_at: string;
  updated_at: string;
};

export type PublicationJobRow = {
  id: string;
  organization_id: string;
  property_id: string;
  marketing_asset_id: string;
  social_account_id: string;
  status: "pending" | "publishing" | "published" | "failed" | "cancelled";
  scheduled_at: string;
  provider_media_container_id: string | null;
  external_publication_id: string | null;
  permalink: string | null;
  attempts: number;
  next_attempt_at: string | null;
  last_error: string | null;
  last_enqueued_at: string | null;
  created_at: string;
  updated_at: string;
};

export type MarketingDatabase = {
  public: {
    Tables: {
      imoveis_social_accounts: {
        Row: SocialAccountRow & {
          access_token_ciphertext: unknown;
          access_token_iv: unknown;
          access_token_tag: unknown;
        };
        Insert: Record<string, unknown>;
        Update: Record<string, unknown>;
        Relationships: [];
      };
      imoveis_properties: {
        Row: ImovelRow;
        Insert: Record<string, unknown>;
        Update: Record<string, unknown>;
        Relationships: [];
      };
      imoveis_property_images: {
        Row: ImovelImagemRow;
        Insert: Record<string, unknown>;
        Update: Record<string, unknown>;
        Relationships: [];
      };
      imoveis_marketing_assets: {
        Row: MarketingAssetRow;
        Insert: Partial<MarketingAssetRow> & { organization_id: string; property_id: string };
        Update: Partial<MarketingAssetRow>;
        Relationships: [];
      };
      imoveis_publication_jobs: {
        Row: PublicationJobRow;
        Insert: Partial<PublicationJobRow> & {
          organization_id: string;
          property_id: string;
          marketing_asset_id: string;
          social_account_id: string;
        };
        Update: Partial<PublicationJobRow>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};

export type MarketingInitialData = {
  accounts: SocialAccountRow[];
  assets: MarketingAssetRow[];
  jobs: PublicationJobRow[];
};

export async function createMarketingClient(): Promise<SupabaseClient<MarketingDatabase>> {
  return (await createClient()) as unknown as SupabaseClient<MarketingDatabase>;
}

export async function readMarketingInitialData(
  propertyId: string,
  organizationId: string,
): Promise<MarketingInitialData> {
  const supabase = await createMarketingClient();
  const admin = createAdminClient() as unknown as SupabaseClient<MarketingDatabase>;
  const [accounts, assets, jobs] = await Promise.all([
    admin.from("imoveis_social_accounts")
      .select("id, organization_id, platform, account_name, external_account_id, access_token_last4, status, created_at, updated_at")
      .eq("organization_id", organizationId)
      .order("platform", { ascending: true })
      .order("account_name", { ascending: true }),
    supabase.from("imoveis_marketing_assets")
      .select("id, organization_id, property_id, platform, language, revision, headline, caption, hashtags, cta, alt_text, status, generated_by_ai, approved_at, published_at, created_at, updated_at")
      .eq("property_id", propertyId)
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: false })
      .limit(12),
    supabase.from("imoveis_publication_jobs")
      .select("id, organization_id, property_id, marketing_asset_id, social_account_id, status, scheduled_at, provider_media_container_id, external_publication_id, permalink, attempts, next_attempt_at, last_error, last_enqueued_at, created_at, updated_at")
      .eq("property_id", propertyId)
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: false })
      .limit(20),
  ]);

  const error = accounts.error ?? assets.error ?? jobs.error;
  if (error) throw new Error(error.message);

  return {
    accounts: (accounts.data ?? []) as SocialAccountRow[],
    assets: (assets.data ?? []) as MarketingAssetRow[],
    jobs: (jobs.data ?? []) as PublicationJobRow[],
  };
}

export async function decryptSocialAccountToken(
  accountId: string,
  organizationId: string,
): Promise<{
  platform: ImoveisSocialPlatform;
  externalAccountId: string;
  accountName: string;
  accessToken: string;
}> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("imoveis_social_accounts")
    .select("platform, external_account_id, account_name, status, access_token_ciphertext, access_token_iv, access_token_tag")
    .eq("id", accountId)
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data || data.status !== "connected") throw new Error("social_account_unavailable");

  return {
    platform: data.platform as ImoveisSocialPlatform,
    externalAccountId: String(data.external_account_id),
    accountName: String(data.account_name),
    accessToken: decryptKey({
      ciphertext: byteaToBuffer(data.access_token_ciphertext),
      iv: byteaToBuffer(data.access_token_iv),
      tag: byteaToBuffer(data.access_token_tag),
    }),
  };
}

export async function emitPublicationRequested(
  organizationId: string,
  jobId: string,
  actorUserId: string | null,
): Promise<void> {
  const admin = createAdminClient();
  const db = admin as unknown as {
    rpc(
      name: string,
      params: Record<string, unknown>,
    ): Promise<{ data: unknown; error: { message: string } | null }>;
  };
  const { error } = await db.rpc("emit_event", {
    p_event_type: "imoveis.social_publish_requested",
    p_entity_kind: "imoveis_publication_job",
    p_entity_id: jobId,
    p_payload: { job_id: jobId },
    p_metadata: { actor_user_id: actorUserId },
    p_organization_id: organizationId,
  });
  if (error) throw new Error(error.message);
}

export function normalizarHashtags(value: string): string[] {
  const seen = new Map<string, string>();
  for (const raw of value.split(/[\s,]+/g)) {
    const clean = raw.trim().replace(/^#+/, "").replace(/[^\p{L}\p{N}_]/gu, "");
    if (!clean) continue;
    const hashtag = "#" + clean;
    const key = hashtag.toLocaleLowerCase();
    if (!seen.has(key)) seen.set(key, hashtag);
  }
  return [...seen.values()].slice(0, 12);
}

export function marketingBackoffMinutes(attempts: number): number {
  return Math.min(60, 2 ** Math.max(0, attempts));
}
