import { redirect } from "next/navigation";

import { createImoveisClient, tabelaNaoInstalada, type ImovelRow } from "@/lib/imoveis/server";
import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { ROLE_RANK } from "@/lib/auth/types";
import { traduzir } from "@/lib/i18n/dicionario";

import { Imoveis } from "./_client";

export const dynamic = "force-dynamic";

const MODULO_NAO_INSTALADO =
  "O módulo de imóveis não está instalado nesta instalação. Peça ao administrador para instalá-lo em Configurações da instalação › Módulos.";

export default async function Page() {
  const user = await requireAuth();
  const org = await resolveActiveOrg(user);
  if (!org) redirect("/app");

  const supabase = await createImoveisClient();
  const { data, error } = await supabase
    .from("imoveis_properties")
    .select(
      "id, organization_id, property_code, status, price_cents, currency, title, property_type, listing_type, description, address, city, latitude, longitude, bedrooms, bathrooms, area_m2, created_at, updated_at",
    )
    .eq("organization_id", org.orgId)
    .order("created_at", { ascending: false })
    .limit(200);

  if (error && !tabelaNaoInstalada(error)) {
    throw new Error(error.message);
  }

  const properties = (data ?? []) as ImovelRow[];
  const moduleError = error && tabelaNaoInstalada(error) ? MODULO_NAO_INSTALADO : undefined;
  const t = (texto: string) => traduzir(texto, user.idioma);
  const podeGerenciar =
    !moduleError && (user.is_platform_admin || ROLE_RANK[org.role] >= ROLE_RANK.agent);
  const podeExcluir =
    !moduleError && (user.is_platform_admin || ROLE_RANK[org.role] >= ROLE_RANK.manager);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <header>
        <h1 className="text-xl font-semibold">{t("Imóveis")}</h1>
        <p className="text-sm text-text-muted">
          {t("Cadastre e acompanhe propriedades imobiliárias.")}
        </p>
      </header>
      <Imoveis
        initialProperties={properties}
        podeGerenciar={podeGerenciar}
        podeExcluir={podeExcluir}
        erroInicial={moduleError}
      />
    </div>
  );
}
