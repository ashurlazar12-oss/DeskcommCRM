"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";

import { audit } from "@/lib/audit";
import { supportWriteError } from "@/lib/impersonate/support";
import { loadAuthUser, resolveActiveOrg } from "@/lib/auth/server";
import { ROLE_RANK } from "@/lib/auth/types";

import { imovelFormSchema, imovelIdSchema, precoParaCentavos } from "@/lib/imoveis/schemas";
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
    case "duplicate":
      return "Já existe uma propriedade com este código nesta organização.";
    case "internal_error":
      return "Não conseguimos completar essa ação. Tente novamente em instantes.";
    default:
      return error;
  }
}

export async function criarImovel(formData: FormData): Promise<ImovelActionResult> {
  const ctx = await contextoDaEscrita("agent");
  if (!ctx.ok) return { ok: false, error: mensagemDeErro(ctx.error) };

  const parsed = imovelFormSchema.safeParse({
    property_code: texto(formData, "property_code"),
    status: texto(formData, "status"),
    price: texto(formData, "price"),
    currency: texto(formData, "currency").toUpperCase(),
  });

  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  const supabase = await createImoveisClient();
  const payload = {
    organization_id: ctx.org.orgId,
    status: parsed.data.status,
    price_cents: precoParaCentavos(parsed.data.price),
    currency: parsed.data.currency.toUpperCase(),
    ...(parsed.data.property_code ? { property_code: parsed.data.property_code } : {}),
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

  const hdrs = await headers();
  await audit({
    action: "imoveis.property_created",
    actorUserId: ctx.user.id,
    organizationId: ctx.org.orgId,
    resourceType: "imoveis_property",
    resourceId: data.id,
    requestId: hdrs.get("x-request-id"),
    ip: hdrs.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
    userAgent: hdrs.get("user-agent"),
    metadata: {
      property_code: data.property_code,
      status: parsed.data.status,
      currency: parsed.data.currency,
    },
  });

  revalidatePath("/app/imoveis");
  return { ok: true, message: "Propriedade criada." };
}

export async function atualizarImovel(formData: FormData): Promise<ImovelActionResult> {
  const ctx = await contextoDaEscrita("agent");
  if (!ctx.ok) return { ok: false, error: mensagemDeErro(ctx.error) };

  const id = imovelIdSchema.safeParse(texto(formData, "id"));
  const parsed = imovelFormSchema.safeParse({
    property_code: texto(formData, "property_code"),
    status: texto(formData, "status"),
    price: texto(formData, "price"),
    currency: texto(formData, "currency").toUpperCase(),
  });

  if (!id.success || !parsed.success) {
    return {
      ok: false,
      error: parsed.success
        ? "Propriedade inválida."
        : parsed.error.issues[0]?.message ?? "Dados inválidos.",
    };
  }

  const supabase = await createImoveisClient();
  const { data, error } = await supabase
    .from("imoveis_properties")
    .update({
      ...(parsed.data.property_code ? { property_code: parsed.data.property_code } : {}),
      status: parsed.data.status,
      price_cents: precoParaCentavos(parsed.data.price),
      currency: parsed.data.currency.toUpperCase(),
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

  const hdrs = await headers();
  await audit({
    action: "imoveis.property_updated",
    actorUserId: ctx.user.id,
    organizationId: ctx.org.orgId,
    resourceType: "imoveis_property",
    resourceId: data.id,
    requestId: hdrs.get("x-request-id"),
    metadata: { property_code: data.property_code },
  });

  revalidatePath("/app/imoveis");
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

  const hdrs = await headers();
  await audit({
    action: "imoveis.property_deleted",
    actorUserId: ctx.user.id,
    organizationId: ctx.org.orgId,
    resourceType: "imoveis_property",
    resourceId: data.id,
    requestId: hdrs.get("x-request-id"),
    metadata: { property_code: data.property_code },
  });

  revalidatePath("/app/imoveis");
  return { ok: true, message: "Propriedade excluída." };
}
