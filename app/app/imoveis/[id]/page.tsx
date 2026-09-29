import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { createImoveisClient, tabelaNaoInstalada } from "@/lib/imoveis/server";
import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { ROLE_RANK } from "@/lib/auth/types";
import { traduzir } from "@/lib/i18n/dicionario";
import { ImovelDetalhe } from "./_client";

export const dynamic = "force-dynamic";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireAuth();
  const org = await resolveActiveOrg(user);
  if (!org) redirect("/app");
  const { id } = await params;
  const supabase = await createImoveisClient();
  const { data: property, error } = await supabase.from("imoveis_properties")
    .select("id,organization_id,property_code,status,price_cents,currency,created_at,updated_at,title,property_type,listing_type,description,address,city,latitude,longitude,bedrooms,bathrooms,area_m2")
    .eq("id", id).eq("organization_id", org.orgId).maybeSingle();
  if (error && tabelaNaoInstalada(error)) redirect("/app/imoveis");
  if (error || !property) notFound();
  const { data: images } = await supabase.from("imoveis_property_images")
    .select("id,property_id,image_url,alt_text,sort_order,created_at")
    .eq("property_id", property.id).eq("organization_id", org.orgId)
    .order("sort_order", { ascending: true });
  const t=(s:string)=>traduzir(s,user.idioma);
  const podeGerenciar=user.is_platform_admin || ROLE_RANK[org.role] >= ROLE_RANK.agent;
  return <div className="flex min-h-0 flex-1 flex-col gap-4">
    <div className="flex items-center gap-3">
      <Link href="/app/imoveis" className="text-sm text-text-muted hover:text-text">{t("Voltar para imóveis")}</Link>
      <span className="text-text-muted">/</span><span className="font-mono text-xs">{property.property_code}</span>
    </div>
    <header><h1 className="text-xl font-semibold">{property.title || property.property_code}</h1><p className="text-sm text-text-muted">{t("Ficha completa da propriedade.")}</p></header>
    <ImovelDetalhe property={property} images={images ?? []} podeGerenciar={podeGerenciar} />
  </div>;
}
