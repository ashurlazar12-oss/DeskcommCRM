"use server";

import { headers } from "next/headers";
import { generateText } from "ai";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import { audit } from "@/lib/audit";
import { requireAuth } from "@/lib/auth/server";
import { ROLE_RANK } from "@/lib/auth/types";
import { resolveLanguageModel, DEFAULT_BOT_MODEL } from "@/lib/ai/gateway";
import { encryptKey, bufToBytea } from "@/lib/crypto/aes_gcm";
import {
  createMarketingClient,
  emitPublicationRequested,
  type MarketingDatabase,
  IMOVEIS_SOCIAL_PLATFORMS,
  IMOVEIS_MARKETING_LANGUAGES,
  normalizarHashtags,
  type ImoveisMarketingLanguage,
  type ImoveisSocialPlatform,
} from "@/lib/imoveis/marketing";
import { tabelaNaoInstalada } from "@/lib/imoveis/server";
import { createAdminClient } from "@/lib/supabase/admin";

export type MarketingActionResult =
  | { ok: true; message: string }
  | { ok: false; error: string };

const marketingInputSchema = z.object({
  property_id: z.string().uuid(),
  platform: z.enum(IMOVEIS_SOCIAL_PLATFORMS),
  language: z.enum(IMOVEIS_MARKETING_LANGUAGES),
});

const socialAccountSchema = z.object({
  platform: z.enum(IMOVEIS_SOCIAL_PLATFORMS),
  account_name: z.string().trim().min(1).max(120),
  external_account_id: z.string().trim().min(1).max(120),
  access_token: z.string().trim().min(20).max(4000),
});

const assetUpdateSchema = z.object({
  asset_id: z.string().uuid(),
  headline: z.string().trim().max(120),
  caption: z.string().trim().min(1).max(2200),
  hashtags: z.string().trim().max(1000),
  cta: z.string().trim().max(160),
  alt_text: z.string().trim().max(300),
});

const queueSchema = z.object({
  asset_id: z.string().uuid(),
  social_account_id: z.string().uuid(),
  scheduled_at: z.string().trim().optional().or(z.literal("")),
});

async function getContext(requiredRole: "agent" | "manager") {
  const user = await requireAuth();
  const activeOrg = user.organizations.find((org) => org.organization_id === user.organizations[0]?.organization_id) ?? user.organizations[0];
  if (!activeOrg) return null;

  const rank = user.is_platform_admin ? ROLE_RANK.admin : ROLE_RANK[activeOrg.role];
  if (rank < ROLE_RANK[requiredRole]) return null;

  return { user, organizationId: activeOrg.organization_id };
}

function errorMessage(error: string): string {
  const map: Record<string, string> = {
    forbidden: "Você não tem permissão para essa ação.",
    module_not_installed: "O módulo de imóveis não está instalado nesta instalação.",
    ai_unavailable: "IA indisponível nesta instalação. Configure um provedor de IA antes de gerar marketing.",
    property_not_found: "Propriedade não encontrada.",
    account_not_found: "Conta social não encontrada ou desativada.",
    platform_mismatch: "A conta social não corresponde à plataforma do conteúdo.",
    already_queued: "Este conteúdo já está ou já foi publicado nesta conta.",
    invalid_schedule: "Data de publicação inválida.",
  };
  return map[error] ?? error;
}

export const marketingCopySchema = z.object({
  headline: z.string().trim().min(1).max(120),
  caption: z.string().trim().min(20).max(2200),
  hashtags: z.array(z.string().trim().min(2).max(40)).max(12),
  cta: z.string().trim().min(1).max(160),
  alt_text: z.string().trim().min(1).max(300),
});

export function montarPromptMarketing(input: {
  language: ImoveisMarketingLanguage;
  platform: ImoveisSocialPlatform;
  property: Record<string, unknown>;
  imageCount: number;
}): string {
  const languageName = input.language === "es" ? "espanhol" : "português do Brasil";
  return [
    "Crie uma peça imobiliária pronta para publicação.",
    `Idioma: ${languageName}.`,
    `Plataforma: ${input.platform}.`,
    `Imagens cadastradas: ${input.imageCount}.`,
    "Use somente os dados fornecidos da propriedade. Não invente características, amenidades, metragem, localização, disponibilidade, financiamento ou condições.",
    "Escreva uma peça comercial factual e clara; não use pressão artificial ou superlativos vazios.",
    "Entregue SOMENTE JSON válido com as chaves: headline, caption, hashtags, cta, alt_text.",
    `Dados da propriedade: ${JSON.stringify(input.property)}`,
  ].join("\n");
}

async function auditMarketing(
  action:
    | "imoveis.marketing_generated"
    | "imoveis.marketing_updated"
    | "imoveis.social_account_connected"
    | "imoveis.social_account_disabled"
    | "imoveis.publication_queued",
  organizationId: string,
  actorUserId: string,
  resourceType: string,
  resourceId: string,
  metadata: Record<string, unknown>,
): Promise<void> {
  const requestHeaders = await headers();
  await audit({
    action,
    actorUserId,
    organizationId,
    resourceType,
    resourceId,
    requestId: requestHeaders.get("x-request-id"),
    ip: requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
    userAgent: requestHeaders.get("user-agent"),
    metadata,
  });
}

function parseJsonText(text: string): unknown {
  const fenced = text.match(/\x60\x60\x60(?:json)?\s*([\s\S]*?)\x60\x60\x60/i);
  return JSON.parse(fenced?.[1] ?? text);
}

export async function conectarContaSocial(formData: FormData): Promise<MarketingActionResult> {
  const ctx = await getContext("manager");
  if (!ctx) return { ok: false, error: errorMessage("forbidden") };

  const parsed = socialAccountSchema.safeParse({
    platform: String(formData.get("platform") ?? ""),
    account_name: String(formData.get("account_name") ?? ""),
    external_account_id: String(formData.get("external_account_id") ?? ""),
    access_token: String(formData.get("access_token") ?? ""),
  });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Dados inválidos." };

  const encrypted = encryptKey(parsed.data.access_token);
  const supabase = createAdminClient() as unknown as SupabaseClient<MarketingDatabase>;
  const { data, error } = await supabase
    .from("imoveis_social_accounts")
    .insert({
      organization_id: ctx.organizationId,
      platform: parsed.data.platform,
      account_name: parsed.data.account_name,
      external_account_id: parsed.data.external_account_id,
      access_token_ciphertext: bufToBytea(encrypted.ciphertext),
      access_token_iv: bufToBytea(encrypted.iv),
      access_token_tag: bufToBytea(encrypted.tag),
      access_token_last4: encrypted.last4,
      status: "connected",
    })
    .select("id, platform, account_name")
    .single();

  if (error) {
    if (tabelaNaoInstalada(error)) return { ok: false, error: errorMessage("module_not_installed") };
    if (error.code === "23505") return { ok: false, error: "Já existe uma conta social com esse identificador nesta organização." };
    return { ok: false, error: "Não foi possível conectar a conta social." };
  }

  await auditMarketing("imoveis.social_account_connected", ctx.organizationId, ctx.user.id, "imoveis_social_account", data.id, {
    platform: data.platform,
    account_name: data.account_name,
  });

  return { ok: true, message: "Conta social conectada." };
}

export async function desativarContaSocial(formData: FormData): Promise<MarketingActionResult> {
  const ctx = await getContext("manager");
  if (!ctx) return { ok: false, error: errorMessage("forbidden") };

  const accountId = String(formData.get("social_account_id") ?? "");
  if (!z.string().uuid().safeParse(accountId).success) return { ok: false, error: "Conta social inválida." };

  const supabase = createAdminClient() as unknown as SupabaseClient<MarketingDatabase>;
  const { data, error } = await supabase
    .from("imoveis_social_accounts")
    .update({ status: "disabled" })
    .eq("id", accountId)
    .eq("organization_id", ctx.organizationId)
    .select("id, platform")
    .maybeSingle();

  if (error) return { ok: false, error: "Não foi possível desativar a conta social." };
  if (!data) return { ok: false, error: errorMessage("account_not_found") };

  await auditMarketing("imoveis.social_account_disabled", ctx.organizationId, ctx.user.id, "imoveis_social_account", data.id, {
    platform: data.platform,
  });
  return { ok: true, message: "Conta social desativada." };
}

export async function gerarMarketingImovel(formData: FormData): Promise<MarketingActionResult> {
  const ctx = await getContext("agent");
  if (!ctx) return { ok: false, error: errorMessage("forbidden") };

  const parsed = marketingInputSchema.safeParse({
    property_id: String(formData.get("property_id") ?? ""),
    platform: String(formData.get("platform") ?? ""),
    language: String(formData.get("language") ?? "pt-BR"),
  });
  if (!parsed.success) return { ok: false, error: "Dados de marketing inválidos." };

  const supabase = await createMarketingClient();
  const [{ data: property, error: propertyError }, { data: images, error: imagesError }] = await Promise.all([
    supabase.from("imoveis_properties")
      .select("id, property_code, status, price_cents, currency, title, property_type, listing_type, description, address, city, bedrooms, bathrooms, area_m2")
      .eq("id", parsed.data.property_id).eq("organization_id", ctx.organizationId).maybeSingle(),
    supabase.from("imoveis_property_images")
      .select("image_url, alt_text").eq("property_id", parsed.data.property_id).eq("organization_id", ctx.organizationId)
      .order("sort_order", { ascending: true }),
  ]);

  if (propertyError || imagesError) {
    if (tabelaNaoInstalada(propertyError) || tabelaNaoInstalada(imagesError)) return { ok: false, error: errorMessage("module_not_installed") };
    return { ok: false, error: "Não foi possível carregar a propriedade." };
  }
  if (!property) return { ok: false, error: errorMessage("property_not_found") };

  const model = resolveLanguageModel(DEFAULT_BOT_MODEL);
  if (!model) return { ok: false, error: errorMessage("ai_unavailable") };

  const result = await generateText({
    model,
    system: "Você é um redator imobiliário disciplinado. A exatidão factual é obrigatória. Não invente dados.",
    prompt: montarPromptMarketing({
      language: parsed.data.language,
      platform: parsed.data.platform,
      property: property as unknown as Record<string, unknown>,
      imageCount: images?.length ?? 0,
    }),
  });

  let copy: z.infer<typeof marketingCopySchema>;
  try {
    const checked = marketingCopySchema.safeParse(parseJsonText(result.text));
    if (!checked.success) throw new Error("copy_invalida");
    copy = checked.data;
  } catch {
    return { ok: false, error: "A IA devolveu um formato de marketing inválido. Gere novamente." };
  }

  const { data: latest } = await supabase
    .from("imoveis_marketing_assets")
    .select("revision")
    .eq("organization_id", ctx.organizationId)
    .eq("property_id", parsed.data.property_id)
    .eq("platform", parsed.data.platform)
    .eq("language", parsed.data.language)
    .order("revision", { ascending: false })
    .limit(1)
    .maybeSingle();

  const nextRevision = (latest?.revision ?? 0) + 1;
  const { data: asset, error } = await supabase
    .from("imoveis_marketing_assets")
    .insert({
      organization_id: ctx.organizationId,
      property_id: parsed.data.property_id,
      platform: parsed.data.platform,
      language: parsed.data.language,
      revision: nextRevision,
      headline: copy.headline,
      caption: copy.caption,
      hashtags: normalizarHashtags(copy.hashtags.join(" ")),
      cta: copy.cta,
      alt_text: copy.alt_text,
      status: "draft",
      generated_by_ai: true,
    })
    .select("id")
    .single();

  if (error) return { ok: false, error: "Não foi possível salvar o material de marketing." };

  await auditMarketing("imoveis.marketing_generated", ctx.organizationId, ctx.user.id, "imoveis_marketing_asset", asset.id, {
    property_id: parsed.data.property_id,
    platform: parsed.data.platform,
    language: parsed.data.language,
    revision: nextRevision,
  });
  return { ok: true, message: "Marketing gerado." };
}

export async function salvarMarketingImovel(formData: FormData): Promise<MarketingActionResult> {
  const ctx = await getContext("agent");
  if (!ctx) return { ok: false, error: errorMessage("forbidden") };

  const parsed = assetUpdateSchema.safeParse({
    asset_id: String(formData.get("asset_id") ?? ""),
    headline: String(formData.get("headline") ?? ""),
    caption: String(formData.get("caption") ?? ""),
    hashtags: String(formData.get("hashtags") ?? ""),
    cta: String(formData.get("cta") ?? ""),
    alt_text: String(formData.get("alt_text") ?? ""),
  });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Dados inválidos." };

  const supabase = await createMarketingClient();
  const { data: current, error: currentError } = await supabase
    .from("imoveis_marketing_assets")
    .select("id, property_id, platform, language, revision, status")
    .eq("id", parsed.data.asset_id)
    .eq("organization_id", ctx.organizationId)
    .maybeSingle();

  if (currentError) return { ok: false, error: "Não foi possível carregar o material de marketing." };
  if (!current) return { ok: false, error: "Material de marketing não encontrado." };

  let savedId = current.id;
  let savedRevision = current.revision;

  if (current.status === "draft") {
    const { data, error } = await supabase
      .from("imoveis_marketing_assets")
      .update({
        headline: parsed.data.headline,
        caption: parsed.data.caption,
        hashtags: normalizarHashtags(parsed.data.hashtags),
        cta: parsed.data.cta,
        alt_text: parsed.data.alt_text,
        updated_at: new Date().toISOString(),
      })
      .eq("id", current.id)
      .eq("organization_id", ctx.organizationId)
      .select("id, revision")
      .maybeSingle();

    if (error || !data) return { ok: false, error: "Não foi possível salvar o material de marketing." };
    savedId = data.id;
    savedRevision = data.revision;
  } else {
    const { data: latest } = await supabase
      .from("imoveis_marketing_assets")
      .select("revision")
      .eq("organization_id", ctx.organizationId)
      .eq("property_id", current.property_id)
      .eq("platform", current.platform)
      .eq("language", current.language)
      .order("revision", { ascending: false })
      .limit(1)
      .maybeSingle();

    const nextRevision = (latest?.revision ?? current.revision) + 1;
    const { data, error } = await supabase
      .from("imoveis_marketing_assets")
      .insert({
        organization_id: ctx.organizationId,
        property_id: current.property_id,
        platform: current.platform,
        language: current.language,
        revision: nextRevision,
        headline: parsed.data.headline,
        caption: parsed.data.caption,
        hashtags: normalizarHashtags(parsed.data.hashtags),
        cta: parsed.data.cta,
        alt_text: parsed.data.alt_text,
        status: "draft",
        generated_by_ai: false,
      })
      .select("id, revision")
      .single();

    if (error || !data) return { ok: false, error: "Não foi possível criar a nova revisão de marketing." };
    savedId = data.id;
    savedRevision = data.revision;
  }

  await auditMarketing(
    "imoveis.marketing_updated",
    ctx.organizationId,
    ctx.user.id,
    "imoveis_marketing_asset",
    savedId,
    { based_on_asset_id: current.id, revision: savedRevision },
  );
  return { ok: true, message: "Marketing salvo." };
}

export async function aprovarEEnfileirarMarketing(formData: FormData): Promise<MarketingActionResult> {
  const ctx = await getContext("manager");
  if (!ctx) return { ok: false, error: errorMessage("forbidden") };

  const parsed = queueSchema.safeParse({
    asset_id: String(formData.get("asset_id") ?? ""),
    social_account_id: String(formData.get("social_account_id") ?? ""),
    scheduled_at: String(formData.get("scheduled_at") ?? ""),
  });
  if (!parsed.success) return { ok: false, error: "Dados de publicação inválidos." };

  const scheduledAt = parsed.data.scheduled_at ? new Date(parsed.data.scheduled_at) : new Date();
  if (Number.isNaN(scheduledAt.getTime())) return { ok: false, error: errorMessage("invalid_schedule") };
  if (scheduledAt.getTime() < Date.now() - 60_000) return { ok: false, error: errorMessage("invalid_schedule") };

  const supabase = await createMarketingClient();
  const [{ data: asset }, { data: account }] = await Promise.all([
    supabase.from("imoveis_marketing_assets").select("id, organization_id, property_id, platform, status")
      .eq("id", parsed.data.asset_id).eq("organization_id", ctx.organizationId).maybeSingle(),
    supabase.from("imoveis_social_accounts").select("id, platform, status")
      .eq("id", parsed.data.social_account_id).eq("organization_id", ctx.organizationId).maybeSingle(),
  ]);

  if (!asset) return { ok: false, error: "Material de marketing não encontrado." };
  if (!account || account.status !== "connected") return { ok: false, error: errorMessage("account_not_found") };
  if (asset.platform !== account.platform) return { ok: false, error: errorMessage("platform_mismatch") };
  if (asset.status !== "draft" && asset.status !== "approved") return { ok: false, error: "Este material não pode ser publicado novamente." };

  const { count } = await supabase.from("imoveis_publication_jobs")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", ctx.organizationId).eq("marketing_asset_id", asset.id).eq("social_account_id", account.id)
    .in("status", ["pending", "publishing", "published"]);

  if ((count ?? 0) > 0) return { ok: false, error: errorMessage("already_queued") };

  const { data: job, error } = await supabase.from("imoveis_publication_jobs").insert({
    organization_id: ctx.organizationId,
    property_id: asset.property_id,
    marketing_asset_id: asset.id,
    social_account_id: account.id,
    status: "pending",
    scheduled_at: scheduledAt.toISOString(),
  }).select("id").single();

  if (error) return { ok: false, error: "Não foi possível criar a fila de publicação." };

  await supabase.from("imoveis_marketing_assets").update({
    status: "approved",
    approved_at: new Date().toISOString(),
  }).eq("id", asset.id).eq("organization_id", ctx.organizationId);

  await auditMarketing("imoveis.publication_queued", ctx.organizationId, ctx.user.id, "imoveis_publication_job", job.id, {
    asset_id: asset.id,
    social_account_id: account.id,
    scheduled_at: scheduledAt.toISOString(),
  });

  if (scheduledAt.getTime() <= Date.now() + 5000) {
    await emitPublicationRequested(ctx.organizationId, job.id, ctx.user.id);
  }

  return { ok: true, message: "Publicação enfileirada." };
}
