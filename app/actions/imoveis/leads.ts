"use server";

import { headers } from "next/headers";
import { z } from "zod";

import { audit } from "@/lib/audit";
import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { ROLE_RANK } from "@/lib/auth/types";
import { supportWriteError } from "@/lib/impersonate/support";
import {
  IMOVEIS_LEAD_RELATIONSHIPS,
  type ImoveisLeadRelationship,
} from "@/lib/imoveis/leads";
import { createClient } from "@/lib/supabase/server";

export type ImoveisLeadActionResult =
  | { ok: true; message: string }
  | { ok: false; error: string };

const linkSchema = z.object({
  property_id: z.string().uuid(),
  lead_id: z.string().uuid(),
  relationship: z.enum(IMOVEIS_LEAD_RELATIONSHIPS),
  notes: z.string().trim().max(1000).default(""),
});

const unlinkSchema = z.object({
  link_id: z.string().uuid(),
});

async function context() {
  const user = await requireAuth();
  const org = await resolveActiveOrg(user);
  if (!org) return null;

  const rank = user.is_platform_admin
    ? ROLE_RANK.admin
    : (ROLE_RANK[org.role] ?? 0);

  if (rank < ROLE_RANK.agent) return null;
  if (supportWriteError(user.support, org.orgId)) return null;

  return { user, org };
}

async function auditRelationship(
  action: "imoveis.lead_property_linked" | "imoveis.lead_property_unlinked",
  organizationId: string,
  actorUserId: string,
  resourceId: string,
  metadata: Record<string, unknown>,
) {
  const requestHeaders = await headers();
  await audit({
    action,
    actorUserId,
    organizationId,
    resourceType: "imoveis_lead_property",
    resourceId,
    requestId: requestHeaders.get("x-request-id"),
    ip: requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
    userAgent: requestHeaders.get("user-agent"),
    metadata,
  });
}

export async function vincularLeadAImovel(
  formData: FormData,
): Promise<ImoveisLeadActionResult> {
  const ctx = await context();
  if (!ctx) return { ok: false, error: "Você não tem permissão para essa ação." };

  const parsed = linkSchema.safeParse({
    property_id: String(formData.get("property_id") ?? ""),
    lead_id: String(formData.get("lead_id") ?? ""),
    relationship: String(formData.get("relationship") ?? "interested"),
    notes: String(formData.get("notes") ?? ""),
  });
  if (!parsed.success) return { ok: false, error: "Dados do vínculo inválidos." };

  const supabase = await createClient();

  const [{ data: property }, { data: lead }] = await Promise.all([
    supabase
      .from("imoveis_properties")
      .select("id")
      .eq("id", parsed.data.property_id)
      .eq("organization_id", ctx.org.orgId)
      .maybeSingle(),
    supabase
      .from("crm_leads")
      .select("id, contact_id")
      .eq("id", parsed.data.lead_id)
      .eq("organization_id", ctx.org.orgId)
      .maybeSingle(),
  ]);

  if (!property || !lead) {
    return { ok: false, error: "Propriedade ou lead não encontrado." };
  }

  const { data, error } = await supabase
    .from("imoveis_lead_properties")
    .insert({
      organization_id: ctx.org.orgId,
      property_id: parsed.data.property_id,
      lead_id: parsed.data.lead_id,
      relationship: parsed.data.relationship,
      notes: parsed.data.notes,
    })
    .select("id, lead_id, property_id, relationship")
    .single();

  if (error) {
    if (error.code === "23505") {
      return { ok: false, error: "Este lead já está vinculado a esta propriedade." };
    }
    return { ok: false, error: "Não foi possível vincular o lead à propriedade." };
  }

  await auditRelationship(
    "imoveis.lead_property_linked",
    ctx.org.orgId,
    ctx.user.id,
    data.id,
    {
      lead_id: data.lead_id,
      property_id: data.property_id,
      relationship: data.relationship,
      contact_id: lead.contact_id,
    },
  );

  return { ok: true, message: "Lead vinculado à propriedade." };
}

export async function desvincularLeadDeImovel(
  formData: FormData,
): Promise<ImoveisLeadActionResult> {
  const ctx = await context();
  if (!ctx) return { ok: false, error: "Você não tem permissão para essa ação." };

  const parsed = unlinkSchema.safeParse({
    link_id: String(formData.get("link_id") ?? ""),
  });
  if (!parsed.success) return { ok: false, error: "Vínculo inválido." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("imoveis_lead_properties")
    .delete()
    .eq("id", parsed.data.link_id)
    .eq("organization_id", ctx.org.orgId)
    .select("id, lead_id, property_id")
    .maybeSingle();

  if (error) return { ok: false, error: "Não foi possível remover o vínculo." };
  if (!data) return { ok: false, error: "Vínculo não encontrado." };

  await auditRelationship(
    "imoveis.lead_property_unlinked",
    ctx.org.orgId,
    ctx.user.id,
    data.id,
    {
      lead_id: data.lead_id,
      property_id: data.property_id,
    },
  );

  return { ok: true, message: "Lead removido da propriedade." };
}
