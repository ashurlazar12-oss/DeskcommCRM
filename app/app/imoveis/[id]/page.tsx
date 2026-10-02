import { notFound, redirect } from "next/navigation";

import { createImoveisClient, tabelaNaoInstalada, type ImovelImagemRow, type ImovelRow } from "@/lib/imoveis/server";
import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { createClient } from "@/lib/supabase/server";
import { rotuloDoContato } from "@/lib/contacts/rotulo-do-contato";
import { ROLE_RANK } from "@/lib/auth/types";
import { traduzir } from "@/lib/i18n/dicionario";
import { readMarketingInitialData } from "@/lib/imoveis/marketing";
import { IMOVEIS_MEDIA_BUCKET } from "@/lib/imoveis/media";
import {
  hasImoveisMatchingCriteria,
  matchLeadToProperty,
  rankLeadsForProperty,
  type ImoveisMatchingLead,
} from "@/lib/imoveis/matching";
import {
  type ImoveisLeadOption,
  type ImoveisLeadPropertyRow,
  type ImoveisLeadsDatabase,
} from "@/lib/imoveis/leads";

import { ImovelDetalhe } from "./_client";
import { LeadPropertyClient } from "./lead-property-client";
import { ImoveisMatchingClient } from "./matching-client";
import { MarketingPanel } from "./marketing-client";
import { PropertyMediaUpload, type PropertyUploadedMedia } from "./media-upload-client";

export const dynamic = "force-dynamic";

const MODULO_NAO_INSTALADO =
  "O módulo de imóveis não está instalado nesta instalação. Peça ao administrador para instalá-lo em Configurações da instalação › Módulos.";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireAuth();
  const org = await resolveActiveOrg(user);
  if (!org) redirect("/app");

  const { id } = await params;
  const supabase = await createImoveisClient();

  const { data: property, error } = await supabase
    .from("imoveis_properties")
    .select(
      "id, organization_id, property_code, status, price_cents, currency, title, property_type, listing_type, description, address, city, latitude, longitude, bedrooms, bathrooms, area_m2, created_at, updated_at",
    )
    .eq("id", id)
    .eq("organization_id", org.orgId)
    .maybeSingle();

  if (error && tabelaNaoInstalada(error)) {
    return (
      <div className="rounded-md border border-border p-6">
        <h1 className="text-xl font-semibold">{traduzir("Imóveis", user.idioma)}</h1>
        <p className="mt-2 text-sm text-text-muted">{traduzir(MODULO_NAO_INSTALADO, user.idioma)}</p>
      </div>
    );
  }

  if (error || !property) notFound();

  const typedProperty = property as ImovelRow;

  const { data: images, error: imagesError } = await supabase
    .from("imoveis_property_images")
    .select("id, organization_id, property_id, image_url, alt_text, sort_order, storage_path, media_type, content_type, original_name, size_bytes, created_at")
    .eq("property_id", typedProperty.id)
    .eq("organization_id", org.orgId)
    .order("sort_order", { ascending: true });

  if (imagesError && !tabelaNaoInstalada(imagesError)) {
    throw new Error(imagesError.message);
  }

  const imageRows = imagesError && tabelaNaoInstalada(imagesError)
    ? []
    : ((images ?? []) as ImovelImagemRow[]);
  const initialImages = imageRows.filter(
    (image): image is ImovelImagemRow & { image_url: string } => Boolean(image.image_url) && !image.storage_path,
  );

  const uploadedRows = imageRows.filter(
    (image): image is ImovelImagemRow & { storage_path: string } => Boolean(image.storage_path),
  );
  const initialUploadedMedia: PropertyUploadedMedia[] = (
    await Promise.all(
      uploadedRows.map(async (media) => {
        const signed = await supabase.storage
          .from(IMOVEIS_MEDIA_BUCKET)
          .createSignedUrl(media.storage_path, 60 * 60);
        if (signed.error || !signed.data?.signedUrl) return null;
        return {
          id: media.id,
          media_type: media.media_type,
          alt_text: media.alt_text,
          original_name: media.original_name,
          content_type: media.content_type,
          size_bytes: media.size_bytes,
          preview_url: signed.data.signedUrl,
        } satisfies PropertyUploadedMedia;
      }),
    )
  ).filter((media): media is PropertyUploadedMedia => media !== null);

  const crm = await createClient();
  const linksDb = (await createClient()) as unknown as import("@supabase/supabase-js").SupabaseClient<ImoveisLeadsDatabase>;

  const { data: links, error: linksError } = await linksDb
    .from("imoveis_lead_properties")
    .select("id, organization_id, lead_id, property_id, relationship, notes, created_at, updated_at")
    .eq("property_id", typedProperty.id)
    .eq("organization_id", org.orgId)
    .order("updated_at", { ascending: false });

  if (linksError && !tabelaNaoInstalada(linksError)) {
    throw new Error(linksError.message);
  }

  const linkRows =
    linksError && tabelaNaoInstalada(linksError)
      ? []
      : ((links ?? []) as ImoveisLeadPropertyRow[]);

  const leadIds = linkRows.map((link) => link.lead_id);
  const { data: leadRows, error: leadsError } = await crm
    .from("crm_leads")
    .select("id, title, status, contact_id, custom_fields")
    .eq("organization_id", org.orgId)
    .in("status", ["open", "won"])
    .order("created_at", { ascending: false })
    .limit(100);

  if (leadsError) {
    throw new Error(leadsError.message);
  }

  const allLeadRows = (leadRows ?? []) as Array<{
    id: string;
    title: string;
    status: "open" | "won" | "lost";
    contact_id: string | null;
    custom_fields: Record<string, unknown>;
  }>;

  const contactIds = Array.from(
    new Set([
      ...allLeadRows.map((lead) => lead.contact_id).filter((value): value is string => !!value),
      ...leadIds,
    ]),
  );

  const { data: contacts } = contactIds.length
    ? await crm
        .from("contacts")
        .select("id, name, display_name")
        .eq("organization_id", org.orgId)
        .in("id", contactIds)
    : { data: [] as Array<{ id: string; name: string | null; display_name: string | null }> };

  const contactById = new Map(
    ((contacts ?? []) as Array<{
      id: string;
      name: string | null;
      display_name: string | null;
    }>).map((contact) => [
      contact.id,
      rotuloDoContato({
        display_name: contact.display_name,
        name: contact.name,
        phone_number: null,
      }),
    ]),
  );

  const leadOptions: ImoveisLeadOption[] = allLeadRows.map((lead) => ({
    id: lead.id,
    title: lead.title,
    status: lead.status,
    contact_id: lead.contact_id,
    contact_name: lead.contact_id ? contactById.get(lead.contact_id) ?? null : null,
  }));

  const matchingLeads: ImoveisMatchingLead[] = allLeadRows.map((lead) => ({
    id: lead.id,
    title: lead.title,
    custom_fields: lead.custom_fields ?? {},
  }));

  const matchingProperty = {
    id: typedProperty.id,
    title: typedProperty.title,
    status: typedProperty.status,
    price_cents: typedProperty.price_cents,
    currency: typedProperty.currency,
    property_type: typedProperty.property_type,
    listing_type: typedProperty.listing_type,
    city: typedProperty.city,
    bedrooms: typedProperty.bedrooms,
    bathrooms: typedProperty.bathrooms,
    area_m2: typedProperty.area_m2,
  };

  const matchingResults = matchingLeads.map((lead) =>
    matchLeadToProperty(lead, matchingProperty),
  );
  const matches = rankLeadsForProperty(matchingLeads, matchingProperty);
  const excludedCount = matchingResults.filter((result) => result.excluded).length;
  const leadsWithCriteria = matchingLeads.filter((lead) =>
    hasImoveisMatchingCriteria(lead.custom_fields),
  ).length;

  const leadById = new Map(leadOptions.map((lead) => [lead.id, lead]));
  const initialLeadLinks = linkRows.map((link) => ({
    ...link,
    lead: leadById.get(link.lead_id) ?? null,
  }));

  const t = (texto: string) => traduzir(texto, user.idioma);
  const podeGerenciar =
    user.is_platform_admin || ROLE_RANK[org.role] >= ROLE_RANK.agent;
  const podeExcluir =
    user.is_platform_admin || ROLE_RANK[org.role] >= ROLE_RANK.manager;
  const podePublicar =
    user.is_platform_admin || ROLE_RANK[org.role] >= ROLE_RANK.manager;
  const marketing = await readMarketingInitialData(
    typedProperty.id,
    org.orgId,
    podePublicar,
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <ImovelDetalhe
        initialProperty={typedProperty}
        initialImages={initialImages}
        podeGerenciar={podeGerenciar}
        podeExcluir={podeExcluir}
      />
      <PropertyMediaUpload
        propertyId={typedProperty.id}
        initialMedia={initialUploadedMedia}
        canManage={podeGerenciar}
      />
      <LeadPropertyClient
        propertyId={typedProperty.id}
        initialLinks={initialLeadLinks}
        leadOptions={leadOptions}
        podeGerenciar={podeGerenciar}
      />
      <ImoveisMatchingClient
        matches={matches}
        excludedCount={excludedCount}
        leadsWithCriteria={leadsWithCriteria}
      />
      <MarketingPanel
        propertyId={typedProperty.id}
        initial={marketing}
        podeGerenciar={podeGerenciar}
        podePublicar={podePublicar}
      />
      <p className="sr-only">{t("Ficha completa da propriedade.")}</p>
    </div>
  );
}
