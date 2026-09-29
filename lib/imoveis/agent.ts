import { z } from "zod";

import { audit } from "@/lib/audit";
import { findForbiddenKey, zodIssuesSummary } from "@/lib/agent-engine/agent/lead-state";
import type { Queryable } from "@/lib/agent-engine/queue/queue";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  IMOVEIS_LISTING_TYPES,
  IMOVEIS_PROPERTY_TYPES,
  type ImovelListingType,
  type ImovelPropertyType,
} from "./server";
import {
  hasImoveisMatchingCriteria,
  matchLeadToProperty,
  type ImoveisMatchingLead,
  type ImoveisMatchingProperty,
} from "./matching";

export const updateImoveisPreferencesInputSchema = z.strictObject({
  listing_type: z.enum(IMOVEIS_LISTING_TYPES).nullable().optional(),
  property_type: z.enum(IMOVEIS_PROPERTY_TYPES).nullable().optional(),
  min_price_cents: z.number().int().min(0).nullable().optional(),
  max_price_cents: z.number().int().min(0).nullable().optional(),
  min_bedrooms: z.number().int().min(0).max(100).nullable().optional(),
  max_bedrooms: z.number().int().min(0).max(100).nullable().optional(),
  min_bathrooms: z.number().min(0).max(50).nullable().optional(),
  min_area_m2: z.number().min(0).max(1_000_000).nullable().optional(),
  city: z.string().trim().min(1).max(100).nullable().optional(),
  cities: z.array(z.string().trim().min(1).max(100)).max(10).nullable().optional(),
});

export type UpdateImoveisPreferencesInput = z.infer<
  typeof updateImoveisPreferencesInputSchema
>;

export type UpdateImoveisPreferencesResult =
  | {
      ok: true;
      status: "updated" | "noop";
      changed_fields: string[];
      message: string;
    }
  | {
      ok: false;
      error: {
        code: "invalid_payload" | "module_not_installed" | "lead_not_found" | "internal_error";
        message: string;
      };
    };

const PREFERENCE_KEYS = {
  listing_type: ["imoveis_listing_type", "listing_type"],
  property_type: ["imoveis_property_type", "property_type"],
  min_price_cents: ["imoveis_min_price_cents", "min_price_cents"],
  max_price_cents: ["imoveis_max_price_cents", "max_price_cents"],
  min_bedrooms: ["imoveis_min_bedrooms", "min_bedrooms"],
  max_bedrooms: ["imoveis_max_bedrooms", "max_bedrooms"],
  min_bathrooms: ["imoveis_min_bathrooms", "min_bathrooms"],
  min_area_m2: ["imoveis_min_area_m2", "min_area_m2"],
  city: ["imoveis_city", "city"],
  cities: ["imoveis_cities", "cities"],
} as const;

function normalizeCities(value: string[] | null): string[] | null {
  if (value === null) return null;
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of value) {
    const city = raw.trim();
    const key = city.toLocaleLowerCase();
    if (!city || seen.has(key)) continue;
    seen.add(key);
    out.push(city);
  }
  return out;
}

export function mergeImoveisPreferences(
  current: Record<string, unknown>,
  input: UpdateImoveisPreferencesInput,
): {
  fields: Record<string, unknown>;
  changed_fields: string[];
} {
  const next = { ...current };
  const changed_fields: string[] = [];

  for (const key of Object.keys(PREFERENCE_KEYS) as Array<
    keyof typeof PREFERENCE_KEYS
  >) {
    if (!(key in input)) continue;

    for (const alias of PREFERENCE_KEYS[key]) {
      delete next[alias];
    }

    const value = input[key];
    const normalized =
      key === "cities" ? normalizeCities(value as string[] | null) : value;

    if (normalized !== null && normalized !== undefined) {
      next[PREFERENCE_KEYS[key][0]] = normalized;
    }
    changed_fields.push(key);
  }

  return { fields: next, changed_fields };
}

async function imoveisModuleAtivo(db: Queryable): Promise<boolean> {
  try {
    const { rows } = await db.query<{ ok: number }>(
      "select 1 as ok from modulos_instalados where modulo = 'imoveis' and estado = 'ativo' limit 1",
    );
    return rows.length > 0;
  } catch {
    return false;
  }
}

function invalidPreferencesPayload(
  raw: unknown,
): UpdateImoveisPreferencesResult {
  const forbidden = findForbiddenKey(raw);
  if (forbidden !== null) {
    return {
      ok: false,
      error: {
        code: "invalid_payload",
        message:
          "payload inválido em update_imoveis_preferences (campo proibido: " +
          forbidden +
          ").",
      },
    };
  }

  const parsed = updateImoveisPreferencesInputSchema.safeParse(raw);
  if (parsed.success) {
    return {
      ok: true,
      status: "noop",
      changed_fields: [],
      message: "",
    };
  }

  return {
    ok: false,
    error: {
      code: "invalid_payload",
      message:
        "payload inválido em update_imoveis_preferences (" +
        zodIssuesSummary(parsed.error) +
        ").",
    },
  };
}

export async function applyImoveisPreferences(
  db: Queryable,
  ids: {
    tenantId: string;
    leadId: string;
    jobId: string;
    agentId: string | null;
  },
  rawInput: unknown,
): Promise<UpdateImoveisPreferencesResult> {
  const parsed = updateImoveisPreferencesInputSchema.safeParse(rawInput);
  if (!parsed.success || findForbiddenKey(rawInput) !== null) {
    return invalidPreferencesPayload(rawInput);
  }

  if (!Object.keys(parsed.data).length) {
    return {
      ok: true,
      status: "noop",
      changed_fields: [],
      message:
        "nenhuma preferência imobiliária foi informada; nada foi alterado.",
    };
  }

  if (!(await imoveisModuleAtivo(db))) {
    return {
      ok: false,
      error: {
        code: "module_not_installed",
        message:
          "o módulo Imóveis não está instalado nesta instalação; siga sem esta ferramenta.",
      },
    };
  }

  try {
    const { rows } = await db.query<{
      custom_fields: Record<string, unknown> | null;
    }>(
      "select custom_fields from crm_leads where organization_id = $1 and id = $2 limit 1",
      [ids.tenantId, ids.leadId],
    );
    const existing = rows[0];
    if (!existing) {
      return {
        ok: false,
        error: {
          code: "lead_not_found",
          message: "o lead não foi encontrado nesta organização.",
        },
      };
    }

    const merged = mergeImoveisPreferences(
      existing.custom_fields &&
        typeof existing.custom_fields === "object" &&
        !Array.isArray(existing.custom_fields)
        ? existing.custom_fields
        : {},
      parsed.data,
    );

    await db.query(
      "update crm_leads set custom_fields = $3::jsonb, updated_at = now() where organization_id = $1 and id = $2",
      [ids.tenantId, ids.leadId, JSON.stringify(merged.fields)],
    );

    void audit({
      action: "lead.updated",
      organizationId: ids.tenantId,
      resourceType: "crm_lead",
      resourceId: ids.leadId,
      requestId: ids.jobId,
      metadata: {
        actor_type: "ai_agent",
        actor_id: ids.jobId,
        ...(ids.agentId ? { agent_id: ids.agentId } : {}),
        source_module: "imoveis",
        fields: merged.changed_fields,
      },
    });

    try {
      const admin = createAdminClient();
      await admin.rpc("emit_event", {
        p_event_type: "lead.updated",
        p_entity_kind: "crm_lead",
        p_entity_id: ids.leadId,
        p_payload: { fields: merged.changed_fields },
        p_metadata: {
          request_id: ids.jobId,
          actor_type: "ai_agent",
          ...(ids.agentId ? { actor_agent_id: ids.agentId } : {}),
        },
        p_organization_id: ids.tenantId,
      });
    } catch {
      // A auditoria já registrou a mutação; a entrega do evento é best-effort.
    }

    return {
      ok: true,
      status: "updated",
      changed_fields: merged.changed_fields,
      message:
        "preferências imobiliárias atualizadas: " +
        merged.changed_fields.join(", ") +
        ".",
    };
  } catch {
    return {
      ok: false,
      error: {
        code: "internal_error",
        message:
          "erro interno ao salvar as preferências imobiliárias — encerre o turno agora.",
      },
    };
  }
}

export type ImoveisPropertyMatch = {
  property_code: string;
  title: string;
  price_cents: number;
  currency: string;
  property_type: ImovelPropertyType | string;
  listing_type: ImovelListingType;
  city: string;
  bedrooms: number;
  bathrooms: number;
  area_m2: number;
  description: string;
  score: number;
  reasons: string[];
};

export type FindImoveisMatchesResult =
  | {
      ok: true;
      status: "matches" | "no_preferences" | "no_matches";
      matches: ImoveisPropertyMatch[];
      evaluated_properties: number;
      excluded_properties: number;
      message: string;
    }
  | {
      ok: false;
      error: {
        code: "module_not_installed" | "lead_not_found" | "internal_error";
        message: string;
      };
    };

export async function findImoveisMatches(
  db: Queryable,
  ids: { tenantId: string; leadId: string },
  limit: number = 10,
): Promise<FindImoveisMatchesResult> {
  if (!(await imoveisModuleAtivo(db))) {
    return {
      ok: false,
      error: {
        code: "module_not_installed",
        message:
          "o módulo Imóveis não está instalado nesta instalação; siga sem esta ferramenta.",
      },
    };
  }

  try {
    const { rows: leadRows } = await db.query<{
      title: string;
      custom_fields: Record<string, unknown> | null;
    }>(
      "select title, custom_fields from crm_leads where organization_id = $1 and id = $2 limit 1",
      [ids.tenantId, ids.leadId],
    );
    const lead = leadRows[0];
    if (!lead) {
      return {
        ok: false,
        error: {
          code: "lead_not_found",
          message: "o lead não foi encontrado nesta organização.",
        },
      };
    }

    const customFields =
      lead.custom_fields &&
      typeof lead.custom_fields === "object" &&
      !Array.isArray(lead.custom_fields)
        ? lead.custom_fields
        : {};
    if (!hasImoveisMatchingCriteria(customFields)) {
      return {
        ok: true,
        status: "no_preferences",
        matches: [],
        evaluated_properties: 0,
        excluded_properties: 0,
        message:
          "este lead ainda não tem preferências imobiliárias estruturadas. Faça perguntas de qualificação e salve-as com update_imoveis_preferences antes de procurar imóveis.",
      };
    }

    const { rows: properties } = await db.query<
      ImoveisMatchingProperty & {
        property_code: string;
        description: string;
      }
    >(
      "select property_code, title, status, price_cents, currency, property_type, listing_type, city, bedrooms, bathrooms, area_m2, description from imoveis_properties where organization_id = $1 order by updated_at desc, id desc limit 200",
      [ids.tenantId],
    );

    const matchingLead: ImoveisMatchingLead = {
      id: ids.leadId,
      title: lead.title,
      custom_fields: customFields,
    };

    const evaluated = properties.map((property) => ({
      property,
      result: matchLeadToProperty(matchingLead, property),
    }));
    const excluded_properties = evaluated.filter(
      ({ result }) => result.excluded,
    ).length;
    const matches = evaluated
      .filter(({ result }) => !result.excluded && result.score > 0)
      .sort(
        (a, b) =>
          b.result.score - a.result.score ||
          a.property.title.localeCompare(b.property.title),
      )
      .slice(0, Math.min(Math.max(limit, 1), 20))
      .map(({ property, result }) => ({
        property_code: property.property_code,
        title: property.title,
        price_cents: property.price_cents,
        currency: property.currency,
        property_type: property.property_type,
        listing_type: property.listing_type,
        city: property.city,
        bedrooms: property.bedrooms,
        bathrooms: property.bathrooms,
        area_m2: property.area_m2,
        description: property.description.slice(0, 1200),
        score: result.score,
        reasons: result.reasons,
      }));

    return {
      ok: true,
      status: matches.length > 0 ? "matches" : "no_matches",
      matches,
      evaluated_properties: properties.length,
      excluded_properties,
      message:
        matches.length > 0
          ? "encontrei " +
            matches.length +
            " imóvel(is) compatível(is). Use os dados retornados para responder ao lead; não invente características que não estão aqui."
          : "nenhum imóvel atende às preferências estruturadas deste lead.",
    };
  } catch {
    return {
      ok: false,
      error: {
        code: "internal_error",
        message:
          "erro interno ao procurar imóveis — não faça recomendações com dados antigos.",
      },
    };
  }
}
