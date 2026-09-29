"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";

import { audit } from "@/lib/audit";
import { supportWriteError } from "@/lib/impersonate/support";
import { loadAuthUser, resolveActiveOrg } from "@/lib/auth/server";
import { ROLE_RANK } from "@/lib/auth/types";

import {
  decimalParaNumero,
  imovelFormSchema,
  imovelIdSchema,
  imovelImagemIdSchema,
  imovelImagemSchema,
  precoParaCentavos,
} from "@/lib/imoveis/schemas";
import { createImoveisClient, tabelaNaoInstalada } from "@/lib/imoveis/server";

export type ImovelActionResult =
  | { ok: true; message: string }
  | { ok: false; error: string };

async function contextoDaEscrita(minRole: "agent" | "manager") {
  const user = await loadAuthUser();
  if (!user) return { ok: false as const, error: "unauthenticated" };

  if (supportWriteError(user.support)) {
    return { ok: false as const, error: "forbidden" };
  }

  const org = await resolveActiveOrg(user);
  if (!org) return { ok: false as const, error: "forbidden_tenant" };

  const rolePermitido =
    user.is_platform_admin || ROLE_RANK[org.role] >= ROLE_RANK[minRole];
  if (!rolePermitido) return { ok: false as const, error: "forbidden_role" };

  return { ok: true as const, user, org };
}

function texto(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

function mensagemDeErro(error: string): string {
  switch (error) {
    case "unauthenticated":
      return "Sua sessão expirou. Entre novamente.";
    case "forbidden":
      return "Esta sessão não pode alterar dados.";
    case "forbidden_tenant":
      return "Nenhuma organização ativa.";
    case "forbidden_role":
      return "Você não tem permissão para esta ação.";
    case "module_not_installed":
      return "O módulo de imóveis não está instalado nesta instalação. Peça ao administrador para instalá-lo em Configurações da instalação › Módulos.";
    case "not_found":
      return "Propriedade não encontrada.";
    case "image_not_found":
      return "Imagem não encontrada.";
    case "duplicate":
      return "Já existe uma propriedade com este código nesta organização.";
    case "internal_error":
      return "Não conseguimos completar essa ação. Tente novamente em instantes.";
    default:
      return error;
  }
}

function dadosDoImovel(formData: FormData) {
  const parsed = imovelFormSchema.safeParse({
    property_code: texto(formData, "property_code"),
    title: texto(formData, "title"),
    status: texto(formData, "status"),
    price: texto(formData, "price"),
    currency: texto(formData, "currency").toUpperCase(),
    property_type: texto(formData, "property_type"),
    listing_type: texto(formData, "listing_type"),
    description: texto(formData, "description"),
    address: texto(formData, "address"),
    city: texto(formData, "city"),
    latitude: texto(formData, "latitude"),
    longitude: texto(formData, "longitude"),
    bedrooms: texto(formData, "bedrooms") || "0",
    bathrooms: texto(formData, "bathrooms"),
    area_m2: texto(formData, "area_m2"),
  });

  if (!parsed.success) {
    return {
      ok: false as const,
      error: parsed.error.issues[0]?.message ?? "Dados inválidos.",
    };
  }

  return {
    ok: true as const,
    data: {
      ...parsed.data,
      property_code: parsed.data.property_code ?? "",
      title: parsed.data.title ?? "",
      description: parsed.data.description ?? "",
      address: parsed.data.address ?? "",
      city: parsed.data.city ?? "",
      latitude: decimalParaNumero(parsed.data.latitude),
      longitude: decimalParaNumero(parsed.data.longitude),
      bedrooms: Number(parsed.data.bedrooms),
      bathrooms: decimalParaNumero(parsed.data.bathrooms) ?? 0,
      area_m2: decimalParaNumero(parsed.data.area_m2) ?? 0,
    },
  };
}

async function auditar(
  action:
    | "imoveis.property_created"
    | "imoveis.property_updated"
    | "imoveis.property_deleted"
    | "imoveis.property_image_added"
    | "imoveis.property_image_deleted",
  ctx: { user: { id: string }; org: { orgId: string } },
  resourceId: string,
  metadata: Record<string, unknown>,
) {
  const hdrs = await headers();
  await audit({
    action,
    actorUserId: ctx.user.id,
    organizationId: ctx.org.orgId,
    resourceType: action.includes("image") ? "imoveis_property_image" : "imoveis_property",
    resourceId,
    requestId: hdrs.get("x-request-id"),
    ip: hdrs.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
    userAgent: hdrs.get("user-agent"),
    metadata,
  });
}

export async function criarImovel(formData: FormData): Promise<ImovelActionResult> {
  const ctx = await contextoDaEscrita("agent");
  if (!ctx.ok) return { ok: false, error: mensagemDeErro(ctx.error) };

  const dados = dadosDoImovel(formData);
  if (!dados.ok) return { ok: false, error: dados.error };

  const supabase = await createImoveisClient();
  const payload = {
    organization_id: ctx.org.orgId,
    property_code: dados.data.property_code || undefined,
    status: dados.data.status,
    price_cents: precoParaCentavos(dados.data.price),
    currency: dados.data.currency.toUpperCase(),
    title: dados.data.title,
    property_type: dados.data.property_type,
    listing_type: dados.data.listing_type,
    description: dados.data.description,
    address: dados.data.address,
    city: dados.data.city,
    latitude: dados.data.latitude,
    longitude: dados.data.longitude,
    bedrooms: dados.data.bedrooms,
    bathrooms: dados.data.bathrooms,
    area_m2: dados.data.area_m2,
  };

  const { data, error } = await supabase
    .from("imoveis_properties")
    .insert(payload)
    .select("id, property_code")
    .single();

  if (error) {
    if (tabelaNaoInstalada(error)) {
      return { ok: false, error: mensagemDeErro("module_not_installed") };
    }
    if (error.code === "23505") {
      return { ok: false, error: mensagemDeErro("duplicate") };
    }
    return { ok: false, error: mensagemDeErro("internal_error") };
  }

  await auditar("imoveis.property_created", ctx, data.id, {
    property_code: data.property_code,
    status: dados.data.status,
    property_type: dados.data.property_type,
    listing_type: dados.data.listing_type,
  });

  revalidatePath("/app/imoveis");
  revalidatePath(`/app/imoveis/${data.id}`);
  return { ok: true, message: "Propriedade criada." };
}

export async function atualizarImovel(formData: FormData): Promise<ImovelActionResult> {
  const ctx = await contextoDaEscrita("agent");
  if (!ctx.ok) return { ok: false, error: mensagemDeErro(ctx.error) };

  const id = imovelIdSchema.safeParse(texto(formData, "id"));
  if (!id.success) return { ok: false, error: "Propriedade inválida." };

  const dados = dadosDoImovel(formData);
  if (!dados.ok) return { ok: false, error: dados.error };

  const supabase = await createImoveisClient();
  const { data, error } = await supabase
    .from("imoveis_properties")
    .update({
      property_code: dados.data.property_code || `PROP-${id.data.slice(0, 8).toUpperCase()}`,
      title: dados.data.title,
      status: dados.data.status,
      price_cents: precoParaCentavos(dados.data.price),
      currency: dados.data.currency.toUpperCase(),
      property_type: dados.data.property_type,
      listing_type: dados.data.listing_type,
      description: dados.data.description,
      address: dados.data.address,
      city: dados.data.city,
      latitude: dados.data.latitude,
      longitude: dados.data.longitude,
      bedrooms: dados.data.bedrooms,
      bathrooms: dados.data.bathrooms,
      area_m2: dados.data.area_m2,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id.data)
    .eq("organization_id", ctx.org.orgId)
    .select("id, property_code")
    .maybeSingle();

  if (error) {
    if (tabelaNaoInstalada(error)) {
      return { ok: false, error: mensagemDeErro("module_not_installed") };
    }
    if (error.code === "23505") {
      return { ok: false, error: mensagemDeErro("duplicate") };
    }
    return { ok: false, error: mensagemDeErro("internal_error") };
  }
  if (!data) return { ok: false, error: mensagemDeErro("not_found") };

  await auditar("imoveis.property_updated", ctx, data.id, {
    property_code: data.property_code,
    status: dados.data.status,
  });

  revalidatePath("/app/imoveis");
  revalidatePath(`/app/imoveis/${data.id}`);
  return { ok: true, message: "Propriedade salva." };
}

export async function excluirImovel(formData: FormData): Promise<ImovelActionResult> {
  const ctx = await contextoDaEscrita("manager");
  if (!ctx.ok) return { ok: false, error: mensagemDeErro(ctx.error) };

  const id = imovelIdSchema.safeParse(texto(formData, "id"));
  if (!id.success) return { ok: false, error: "Propriedade inválida." };

  const supabase = await createImoveisClient();
  const { data, error } = await supabase
    .from("imoveis_properties")
    .delete()
    .eq("id", id.data)
    .eq("organization_id", ctx.org.orgId)
    .select("id, property_code")
    .maybeSingle();

  if (error) {
    if (tabelaNaoInstalada(error)) {
      return { ok: false, error: mensagemDeErro("module_not_installed") };
    }
    return { ok: false, error: mensagemDeErro("internal_error") };
  }
  if (!data) return { ok: false, error: mensagemDeErro("not_found") };

  await auditar("imoveis.property_deleted", ctx, data.id, {
    property_code: data.property_code,
  });

  revalidatePath("/app/imoveis");
  revalidatePath(`/app/imoveis/${data.id}`);
  return { ok: true, message: "Propriedade excluída." };
}

export async function adicionarImagemImovel(
  formData: FormData,
): Promise<ImovelActionResult> {
  const ctx = await contextoDaEscrita("agent");
  if (!ctx.ok) return { ok: false, error: mensagemDeErro(ctx.error) };

  const parsed = imovelImagemSchema.safeParse({
    property_id: texto(formData, "property_id"),
    image_url: texto(formData, "image_url"),
    alt_text: texto(formData, "alt_text"),
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  const supabase = await createImoveisClient();
  const { data: property } = await supabase
    .from("imoveis_properties")
    .select("id")
    .eq("id", parsed.data.property_id)
    .eq("organization_id", ctx.org.orgId)
    .maybeSingle();

  if (!property) return { ok: false, error: mensagemDeErro("not_found") };

  const { data: lastImage, error: lastImageError } = await supabase
    .from("imoveis_property_images")
    .select("sort_order")
    .eq("property_id", parsed.data.property_id)
    .eq("organization_id", ctx.org.orgId)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (lastImageError && !tabelaNaoInstalada(lastImageError)) {
    return { ok: false, error: mensagemDeErro("internal_error") };
  }

  const { data: image, error } = await supabase
    .from("imoveis_property_images")
    .insert({
      organization_id: ctx.org.orgId,
      property_id: parsed.data.property_id,
      image_url: parsed.data.image_url,
      alt_text: parsed.data.alt_text ?? "",
      sort_order: (lastImage?.sort_order ?? -1) + 1,
    })
    .select("id")
    .single();

  if (error) {
    if (tabelaNaoInstalada(error)) {
      return { ok: false, error: mensagemDeErro("module_not_installed") };
    }
    return { ok: false, error: mensagemDeErro("internal_error") };
  }

  await auditar("imoveis.property_image_added", ctx, image.id, {
    property_id: parsed.data.property_id,
  });

  revalidatePath(`/app/imoveis/${parsed.data.property_id}`);
  return { ok: true, message: "Imagem adicionada." };
}

export async function excluirImagemImovel(
  formData: FormData,
): Promise<ImovelActionResult> {
  const ctx = await contextoDaEscrita("agent");
  if (!ctx.ok) return { ok: false, error: mensagemDeErro(ctx.error) };

  const parsed = imovelImagemIdSchema.safeParse({
    property_id: texto(formData, "property_id"),
    image_id: texto(formData, "image_id"),
  });
  if (!parsed.success) return { ok: false, error: "Imagem inválida." };

  const supabase = await createImoveisClient();
  const { data: image, error } = await supabase
    .from("imoveis_property_images")
    .delete()
    .eq("id", parsed.data.image_id)
    .eq("property_id", parsed.data.property_id)
    .eq("organization_id", ctx.org.orgId)
    .select("id")
    .maybeSingle();

  if (error) {
    if (tabelaNaoInstalada(error)) {
      return { ok: false, error: mensagemDeErro("module_not_installed") };
    }
    return { ok: false, error: mensagemDeErro("internal_error") };
  }
  if (!image) return { ok: false, error: mensagemDeErro("image_not_found") };

  await auditar("imoveis.property_image_deleted", ctx, image.id, {
    property_id: parsed.data.property_id,
  });

  revalidatePath(`/app/imoveis/${parsed.data.property_id}`);
  return { ok: true, message: "Imagem excluída." };
}
