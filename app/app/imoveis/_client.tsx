"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { useT } from "@/hooks/i18n/useT";
import { useTagDeIdioma } from "@/hooks/i18n/useLocaleDeData";

import {
  atualizarImovel,
  criarImovel,
  excluirImovel,
  type ImovelActionResult,
} from "@/app/actions/imoveis/properties";
import { filtrarImoveis, type ImovelFiltro } from "@/lib/imoveis/filters";
import type {
  ImovelListingType,
  ImovelPropertyType,
  ImovelRow,
  ImovelStatus,
} from "@/lib/imoveis/server";

const STATUS_LABELS: Record<ImovelStatus, string> = {
  draft: "Rascunho",
  available: "Disponível",
  reserved: "Reservado",
  sold: "Vendido",
  rented: "Alugado",
  archived: "Arquivado",
};

const PROPERTY_TYPE_LABELS: Record<ImovelPropertyType, string> = {
  house: "Casa",
  apartment: "Apartamento",
  land: "Terreno",
  commercial: "Comercial",
  commercial_room: "Sala comercial",
  warehouse: "Galpão",
  other: "Outro",
};

const LISTING_TYPE_LABELS: Record<ImovelListingType, string> = {
  sale: "Venda",
  rent: "Aluguel",
};

function aplicarResultado(result: ImovelActionResult, setFeedback: (value: string) => void) {
  setFeedback(result.ok ? result.message : result.error);
}

export function Imoveis({
  initialProperties,
  podeGerenciar,
  podeExcluir,
  erroInicial,
}: {
  initialProperties: ImovelRow[];
  podeGerenciar: boolean;
  podeExcluir: boolean;
  erroInicial?: string;
}) {
  const t = useT();
  const locale = useTagDeIdioma();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState(erroInicial ?? "");
  const [currency, setCurrency] = useState("USD");
  const [filtro, setFiltro] = useState<ImovelFiltro>({ busca: "", status: "all" });

  const filteredProperties = useMemo(
    () => filtrarImoveis(initialProperties, filtro),
    [initialProperties, filtro],
  );
  const total = initialProperties.length;
  const disponiveis = useMemo(
    () => initialProperties.filter((property) => property.status === "available").length,
    [initialProperties],
  );
  const reservados = useMemo(
    () => initialProperties.filter((property) => property.status === "reserved").length,
    [initialProperties],
  );

  function executar(
    action: (formData: FormData) => Promise<ImovelActionResult>,
    formData: FormData,
    onSuccess?: () => void,
  ) {
    startTransition(async () => {
      const result = await action(formData);
      aplicarResultado(result, setFeedback);
      if (result.ok) {
        onSuccess?.();
        router.refresh();
      }
    });
  }

  return (
    <div className="flex min-w-0 flex-col gap-6">
      {feedback ? (
        <p className="rounded-md border border-border bg-surface-elevated p-3 text-sm" role="status">
          {feedback}
        </p>
      ) : null}

      <div className="flex flex-wrap items-baseline gap-x-8 gap-y-2 border-b border-border pb-4">
        <div>
          <span className="text-2xl font-semibold tabular-nums">{total}</span>{" "}
          <span className="text-sm text-text-muted">{t("propriedades")}</span>
        </div>
        <div>
          <span className="text-lg font-semibold tabular-nums">{disponiveis}</span>{" "}
          <span className="text-sm text-text-muted">{t("disponíveis")}</span>
        </div>
        <div>
          <span className="text-lg font-semibold tabular-nums">{reservados}</span>{" "}
          <span className="text-sm text-text-muted">{t("reservadas")}</span>
        </div>
      </div>

      {podeGerenciar ? (
        <section className="rounded-md border border-border bg-surface p-4">
          <div className="mb-4">
            <h2 className="text-sm font-semibold">{t("Nova propriedade")}</h2>
            <p className="text-sm text-text-muted">
              {t("Cadastre código, situação, preço e moeda para começar.")}
            </p>
          </div>

          <form
            className="grid gap-4 md:grid-cols-[1.4fr_0.9fr_1fr_0.7fr_auto]"
            onSubmit={(event) => {
              event.preventDefault();
              const form = event.currentTarget;
              const formData = new FormData(form);
              executar(criarImovel, formData, () => {
                form.reset();
                setCurrency("USD");
              });
            }}
          >
            <input type="hidden" name="property_type" value="other" />
            <input type="hidden" name="listing_type" value="sale" />
            <input type="hidden" name="title" value="" />
            <input type="hidden" name="description" value="" />
            <input type="hidden" name="address" value="" />
            <input type="hidden" name="city" value="" />
            <input type="hidden" name="latitude" value="" />
            <input type="hidden" name="longitude" value="" />
            <input type="hidden" name="bedrooms" value="0" />
            <input type="hidden" name="bathrooms" value="" />
            <input type="hidden" name="area_m2" value="" />
            <label className="flex flex-col gap-1">
              <span className="text-xs text-text-muted">{t("Código da propriedade")}</span>
              <input
                name="property_code"
                className="h-9 rounded-xs border border-border bg-surface-elevated px-3 text-sm text-text"
                placeholder={t("Gerado automaticamente")}
                maxLength={80}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs text-text-muted">{t("Situação")}</span>
              <select
                name="status"
                defaultValue="draft"
                className="h-9 rounded-xs border border-border bg-surface-elevated px-3 text-sm text-text"
              >
                {(Object.keys(STATUS_LABELS) as ImovelStatus[]).map((status) => (
                  <option key={status} value={status}>
                    {t(STATUS_LABELS[status])}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs text-text-muted">{t("Preço")}</span>
              <input
                name="price"
                required
                inputMode="decimal"
                placeholder="0,00"
                className="h-9 rounded-xs border border-border bg-surface-elevated px-3 text-sm text-text"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs text-text-muted">{t("Moeda")}</span>
              <input
                name="currency"
                value={currency}
                onChange={(event) => setCurrency(event.target.value.toUpperCase())}
                maxLength={3}
                className="h-9 rounded-xs border border-border bg-surface-elevated px-3 text-sm uppercase text-text"
              />
            </label>
            <Button type="submit" disabled={pending}>
              {pending ? t("Salvando…") : t("Criar propriedade")}
            </Button>
          </form>
        </section>
      ) : null}

      <section className="min-w-0">
        <div className="mb-3 flex items-end justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold">{t("Propriedades")}</h2>
            <p className="text-sm text-text-muted">
              {t("Os registros desta organização, protegidos pela mesma RLS do banco.")}
            </p>
          </div>
          <span className="font-mono text-xs text-text-muted">
            {filteredProperties.length}/{total}
          </span>
        </div>

        <div className="mb-4 grid gap-3 rounded-md border border-border bg-surface p-3 md:grid-cols-[1fr_220px_auto] md:items-end">
          <label className="flex flex-col gap-1">
            <span className="text-xs text-text-muted">{t("Código")}</span>
            <input
              value={filtro.busca}
              onChange={(event) =>
                setFiltro((current) => ({ ...current, busca: event.target.value }))
              }
              className="h-9 rounded-xs border border-border bg-surface-elevated px-3 text-sm text-text"
              placeholder={t("Código")}
              aria-label={t("Código")}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-text-muted">{t("Situação")}</span>
            <select
              value={filtro.status}
              onChange={(event) =>
                setFiltro((current) => ({
                  ...current,
                  status: event.target.value as ImovelFiltro["status"],
                }))
              }
              className="h-9 rounded-xs border border-border bg-surface-elevated px-3 text-sm text-text"
              aria-label={t("Situação")}
            >
              <option value="all">{t("Todos")}</option>
              {(Object.keys(STATUS_LABELS) as ImovelStatus[]).map((status) => (
                <option key={status} value={status}>
                  {t(STATUS_LABELS[status])}
                </option>
              ))}
            </select>
          </label>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setFiltro({ busca: "", status: "all" })}
            disabled={!filtro.busca && filtro.status === "all"}
          >
            {t("Limpar")}
          </Button>
        </div>

        {initialProperties.length === 0 ? (
          <div className="rounded-md border border-border p-8 text-sm text-text-muted">
            {t("Nenhuma propriedade cadastrada ainda.")}
          </div>
        ) : filteredProperties.length === 0 ? (
          <div className="rounded-md border border-border p-8 text-sm text-text-muted">
            {t("Nenhum resultado encontrado.")}
          </div>
        ) : (
          <div className="flex min-w-0 flex-col gap-2">
            <div className="hidden grid-cols-[1.3fr_0.9fr_1fr_0.7fr_auto] gap-3 px-3 text-xs text-text-muted md:grid">
              <span>{t("Código")}</span>
              <span>{t("Situação")}</span>
              <span>{t("Preço")}</span>
              <span>{t("Atualizado")}</span>
              <span />
            </div>

            {filteredProperties.map((property) => (
              <div key={property.id} className="rounded-sm border border-border bg-surface p-3">
                <form
                  className="grid min-w-0 gap-3 md:grid-cols-[1.3fr_0.9fr_1fr_0.7fr_auto] md:items-center"
                  onSubmit={(event) => {
                    event.preventDefault();
                    executar(atualizarImovel, new FormData(event.currentTarget));
                  }}
                >
                  <input type="hidden" name="id" value={property.id} />
                  <input type="hidden" name="title" value={property.title} />
                  <input type="hidden" name="property_type" value={property.property_type} />
                  <input type="hidden" name="listing_type" value={property.listing_type} />
                  <input type="hidden" name="description" value={property.description} />
                  <input type="hidden" name="address" value={property.address} />
                  <input type="hidden" name="city" value={property.city} />
                  <input
                    type="hidden"
                    name="latitude"
                    value={property.latitude == null ? "" : String(property.latitude)}
                  />
                  <input
                    type="hidden"
                    name="longitude"
                    value={property.longitude == null ? "" : String(property.longitude)}
                  />
                  <input type="hidden" name="bedrooms" value={String(property.bedrooms)} />
                  <input type="hidden" name="bathrooms" value={String(property.bathrooms)} />
                  <input type="hidden" name="area_m2" value={String(property.area_m2)} />

                  <div className="min-w-0">
                    <Link
                      href={`/app/imoveis/${property.id}`}
                      className="font-mono text-xs font-medium text-text underline-offset-2 hover:underline"
                    >
                      {property.property_code}
                    </Link>
                    {property.title ? (
                      <p className="mt-1 truncate text-xs text-text-muted">{property.title}</p>
                    ) : null}
                    <input
                      name="property_code"
                      defaultValue={property.property_code}
                      maxLength={80}
                      className="mt-2 h-9 min-w-0 w-full rounded-xs border border-border bg-surface-elevated px-3 font-mono text-xs text-text md:hidden"
                      aria-label={t("Código")}
                    />
                  </div>

                  <select
                    name="status"
                    defaultValue={property.status}
                    className="h-9 rounded-xs border border-border bg-surface-elevated px-3 text-sm text-text"
                    aria-label={t("Situação")}
                  >
                    {(Object.keys(STATUS_LABELS) as ImovelStatus[]).map((status) => (
                      <option key={status} value={status}>
                        {t(STATUS_LABELS[status])}
                      </option>
                    ))}
                  </select>

                  <div className="flex gap-2">
                    <input
                      name="price"
                      defaultValue={(property.price_cents / 100).toFixed(2).replace(".", ",")}
                      inputMode="decimal"
                      required
                      className="h-9 min-w-0 flex-1 rounded-xs border border-border bg-surface-elevated px-3 text-sm text-text"
                      aria-label={t("Preço")}
                    />
                    <input
                      name="currency"
                      defaultValue={property.currency}
                      maxLength={3}
                      className="h-9 w-16 rounded-xs border border-border bg-surface-elevated px-2 text-xs uppercase text-text"
                      aria-label={t("Moeda")}
                    />
                  </div>

                  <time
                    dateTime={property.updated_at}
                    className="text-xs text-text-muted md:truncate"
                    title={new Date(property.updated_at).toLocaleString(locale)}
                  >
                    {new Date(property.updated_at).toLocaleDateString(locale)}
                  </time>

                  <div className="flex flex-wrap items-center gap-2 md:justify-end">
                    <Link
                      href={`/app/imoveis/${property.id}`}
                      className="text-xs text-text-muted underline-offset-2 hover:underline"
                    >
                      {t("Abrir ficha")}
                    </Link>
                    <Button type="submit" disabled={pending} variant="outline" size="sm">
                      {pending ? t("Salvando…") : t("Salvar")}
                    </Button>
                    {podeExcluir ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        disabled={pending}
                        onClick={() => {
                          const confirmacao = window.confirm(
                            t("Excluir a propriedade " + property.property_code + "?"),
                          );
                          if (!confirmacao) return;
                          const formData = new FormData();
                          formData.set("id", property.id);
                          executar(excluirImovel, formData);
                        }}
                      >
                        {t("Excluir")}
                      </Button>
                    ) : null}
                  </div>
                </form>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
