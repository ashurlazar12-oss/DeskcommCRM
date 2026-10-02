"use server";

import { randomUUID } from "node:crypto";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { audit } from "@/lib/audit";
import { loadAuthUser, resolveActiveOrg } from "@/lib/auth/server";
import { ROLE_RANK } from "@/lib/auth/types";
import { supportWriteError } from "@/lib/impersonate/support";
import {
  caminhoDeMidiaImovel,
  IMOVEIS_MEDIA_BUCKET,
  mediaUploadRequestSchema,
  validarMidiaImovel,
} from "@/lib/imoveis/media";
import { createImoveisClient, tabelaNaoInstalada } from "@/lib/imoveis/server";

export type PrepareMediaUploadResult =
  | {
      ok: true;
      mediaId: string;
      path: string;
      token: string;
      contentType: string;
      mediaType: "image" | "video";
    }
  | { ok: false; error: string };

export type MediaActionResult =
  | { ok: true; message: string }
  | { ok: false; error: string };

const finalizeSchema = mediaUploadRequestSchema.extend({
  media_id: z.string().uuid(),
});

const deleteSchema = z.object({
  property_id: z.string().uuid(),
  media_id: z.string().uuid(),
});

async function contextoDaMidia() {
  const user = await loadAuthUser();
  if (!user) return { ok: false as const, error: "Sua sessão expirou. Entre novamente." };
  if (supportWriteError(user.support)) {
    return { ok: false as const, error: "Esta sessão não pode alterar dados." };
  }
  const org = await resolveActiveOrg(user);
  if (!org) return { ok: false as const, error: "Nenhuma organização ativa." };
  const allowed = user.is_platform_admin || ROLE_RANK[org.role] >= ROLE_RANK.agent;
  if (!allowed) return { ok: false as const, error: "Você não tem permissão para esta ação." };
  return { ok: true as const, user, org };
}

async function propriedadeExiste(propertyId: string, organizationId: string) {
  const supabase = await createImoveisClient();
  const { data, error } = await supabase
    .from("imoveis_properties")
    .select("id")
    .eq("id", propertyId)
    .eq("organization_id", organizationId)
    .maybeSingle();
  return { exists: Boolean(data), error };
}

async function auditarMidia(
  action: "imoveis.property_image_added" | "imoveis.property_image_deleted",
  ctx: { user: { id: string }; org: { orgId: string } },
  mediaId: string,
  metadata: Record<string, unknown>,
) {
  const hdrs = await headers();
  await audit({
    action,
    actorUserId: ctx.user.id,
    organizationId: ctx.org.orgId,
    resourceType: "imoveis_property_image",
    resourceId: mediaId,
    requestId: hdrs.get("x-request-id"),
    ip: hdrs.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
    userAgent: hdrs.get("user-agent"),
    metadata,
  });
}

export async function prepararUploadMidiaImovel(
  raw: unknown,
): Promise<PrepareMediaUploadResult> {
  const ctx = await contextoDaMidia();
  if (!ctx.ok) return { ok: false, error: ctx.error };

  const parsed = mediaUploadRequestSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Arquivo inválido." };
  }
  const validated = validarMidiaImovel({
    contentType: parsed.data.content_type,
    sizeBytes: parsed.data.size_bytes,
  });
  if (!validated.ok) return { ok: false, error: validated.error };

  const property = await propriedadeExiste(parsed.data.property_id, ctx.org.orgId);
  if (property.error && tabelaNaoInstalada(property.error)) {
    return { ok: false, error: "O módulo de imóveis não está instalado nesta instalação." };
  }
  if (property.error) return { ok: false, error: "Não foi possível validar a propriedade." };
  if (!property.exists) return { ok: false, error: "Propriedade não encontrada." };

  const mediaId = randomUUID();
  const path = caminhoDeMidiaImovel({
    organizationId: ctx.org.orgId,
    propertyId: parsed.data.property_id,
    mediaId,
    extension: validated.extension,
  });
  const supabase = await createImoveisClient();
  const { data, error } = await supabase.storage
    .from(IMOVEIS_MEDIA_BUCKET)
    .createSignedUploadUrl(path, { upsert: false });

  if (error || !data?.token) {
    return { ok: false, error: "Não foi possível preparar o envio do arquivo." };
  }

  return {
    ok: true,
    mediaId,
    path,
    token: data.token,
    contentType: parsed.data.content_type,
    mediaType: validated.kind,
  };
}

export async function finalizarUploadMidiaImovel(raw: unknown): Promise<MediaActionResult> {
  const ctx = await contextoDaMidia();
  if (!ctx.ok) return { ok: false, error: ctx.error };

  const parsed = finalizeSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Arquivo inválido." };
  }
  const validated = validarMidiaImovel({
    contentType: parsed.data.content_type,
    sizeBytes: parsed.data.size_bytes,
  });
  if (!validated.ok) return { ok: false, error: validated.error };

  const expectedPath = caminhoDeMidiaImovel({
    organizationId: ctx.org.orgId,
    propertyId: parsed.data.property_id,
    mediaId: parsed.data.media_id,
    extension: validated.extension,
  });

  const property = await propriedadeExiste(parsed.data.property_id, ctx.org.orgId);
  if (property.error || !property.exists) {
    return { ok: false, error: "Propriedade não encontrada." };
  }

  const supabase = await createImoveisClient();
  const folder = `${ctx.org.orgId}/${parsed.data.property_id}`;
  const fileName = expectedPath.slice(folder.length + 1);
  const listed = await supabase.storage.from(IMOVEIS_MEDIA_BUCKET).list(folder, {
    limit: 10,
    search: fileName,
  });
  if (listed.error || !listed.data?.some((entry) => entry.name === fileName)) {
    return { ok: false, error: "O arquivo não foi encontrado após o envio. Tente novamente." };
  }

  const { data: lastMedia, error: orderError } = await supabase
    .from("imoveis_property_images")
    .select("sort_order")
    .eq("property_id", parsed.data.property_id)
    .eq("organization_id", ctx.org.orgId)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (orderError) return { ok: false, error: "Não foi possível ordenar a galeria." };

  const { data: media, error } = await supabase
    .from("imoveis_property_images")
    .insert({
      id: parsed.data.media_id,
      organization_id: ctx.org.orgId,
      property_id: parsed.data.property_id,
      image_url: null,
      alt_text: parsed.data.alt_text,
      sort_order: (lastMedia?.sort_order ?? -1) + 1,
      storage_path: expectedPath,
      media_type: validated.kind,
      content_type: parsed.data.content_type,
      original_name: parsed.data.original_name,
      size_bytes: parsed.data.size_bytes,
    })
    .select("id")
    .single();

  if (error) {
    await supabase.storage.from(IMOVEIS_MEDIA_BUCKET).remove([expectedPath]);
    return { ok: false, error: "Não foi possível registrar o arquivo na propriedade." };
  }

  await auditarMidia("imoveis.property_image_added", ctx, media.id, {
    property_id: parsed.data.property_id,
    media_type: validated.kind,
    content_type: parsed.data.content_type,
    size_bytes: parsed.data.size_bytes,
    source: "upload",
  });
  revalidatePath(`/app/imoveis/${parsed.data.property_id}`);
  return { ok: true, message: validated.kind === "image" ? "Imagem enviada." : "Vídeo enviado." };
}

export async function excluirMidiaImovel(raw: unknown): Promise<MediaActionResult> {
  const ctx = await contextoDaMidia();
  if (!ctx.ok) return { ok: false, error: ctx.error };
  const parsed = deleteSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Arquivo inválido." };

  const supabase = await createImoveisClient();
  const { data: media, error: readError } = await supabase
    .from("imoveis_property_images")
    .select("id, storage_path, media_type")
    .eq("id", parsed.data.media_id)
    .eq("property_id", parsed.data.property_id)
    .eq("organization_id", ctx.org.orgId)
    .maybeSingle();
  if (readError) return { ok: false, error: "Não foi possível carregar o arquivo." };
  if (!media?.storage_path) return { ok: false, error: "Arquivo enviado não encontrado." };

  const { data: deleted, error } = await supabase
    .from("imoveis_property_images")
    .delete()
    .eq("id", parsed.data.media_id)
    .eq("property_id", parsed.data.property_id)
    .eq("organization_id", ctx.org.orgId)
    .select("id")
    .maybeSingle();
  if (error || !deleted) return { ok: false, error: "Não foi possível excluir o arquivo." };

  const storageRemoval = await supabase.storage.from(IMOVEIS_MEDIA_BUCKET).remove([media.storage_path]);
  await auditarMidia("imoveis.property_image_deleted", ctx, deleted.id, {
    property_id: parsed.data.property_id,
    media_type: media.media_type,
    storage_cleanup_ok: !storageRemoval.error,
    source: "upload",
  });
  revalidatePath(`/app/imoveis/${parsed.data.property_id}`);
  return { ok: true, message: "Arquivo excluído." };
}
