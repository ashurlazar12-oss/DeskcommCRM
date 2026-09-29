import { notFound, redirect } from "next/navigation";

import { createImoveisClient, tabelaNaoInstalada, type ImovelImagemRow, type ImovelRow } from "@/lib/imoveis/server";
import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { ROLE_RANK } from "@/lib/auth/types";
import { traduzir } from "@/lib/i18n/dicionario";
import { readMarketingInitialData } from "@/lib/imoveis/marketing";

import { ImovelDetalhe } from "./_client";
import { MarketingPanel } from "./marketing-client";

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

  const { data: images, error: imagesError } = await supabase
    .from("imoveis_property_images")
    .select("id, organization_id, property_id, image_url, alt_text, sort_order, created_at")
    .eq("property_id", property.id)
    .eq("organization_id", org.orgId)
    .order("sort_order", { ascending: true });

  if (imagesError && !tabelaNaoInstalada(imagesError)) {
    throw new Error(imagesError.message);
  }

  const initialImages = imagesError && tabelaNaoInstalada(imagesError)
    ? []
    : ((images ?? []) as ImovelImagemRow[]);

  const typedProperty = property as ImovelRow;
  const marketing = await readMarketingInitialData(typedProperty.id, org.orgId);
  const t = (texto: string) => traduzir(texto, user.idioma);
  const podeGerenciar =
    user.is_platform_admin || ROLE_RANK[org.role] >= ROLE_RANK.agent;
  const podeExcluir =
    user.is_platform_admin || ROLE_RANK[org.role] >= ROLE_RANK.manager;
  const podePublicar =
    user.is_platform_admin || ROLE_RANK[org.role] >= ROLE_RANK.manager;
  const marketing = await readMarketingInitialData(typedProperty.id, org.orgId, podePublicar);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <ImovelDetalhe
        initialProperty={typedProperty}
        initialImages={initialImages}
        podeGerenciar={podeGerenciar}
        podeExcluir={podeExcluir}
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
