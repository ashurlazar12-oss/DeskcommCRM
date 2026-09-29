"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import {
  adicionarImagemImovel,
  atualizarImovel,
  excluirImagemImovel,
  type ImovelActionResult,
} from "@/app/actions/imoveis/properties";
import { useT } from "@/hooks/i18n/useT";
import { useTagDeIdioma } from "@/hooks/i18n/useLocaleDeData";
import type {
  ImovelImagemRow,
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

export function ImovelDetalhe({
  initialProperty,
  initialImages,
  podeGerenciar,
  podeExcluir,
}: {
  initialProperty: ImovelRow;
  initialImages: ImovelImagemRow[];
  podeGerenciar: boolean;
  podeExcluir: boolean;
}) {
  const t = useT();
  const locale = useTagDeIdioma();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [imageAlt, setImageAlt] = useState("");

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

  const price = new Intl.NumberFormat(locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(initialProperty.price_cents / 100);

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <header className="flex flex-wrap items-start justify-between gap-4 border-b border-border pb-4">
        <div>
          <Link
            href="/app/imoveis"
            className="text-xs text-text-muted underline-offset-2 hover:underline"
          >
            {t("Voltar para propriedades")}
          </Link>
          <div className="mt-2 flex flex-wrap items-baseline gap-3">
            <h1 className="font-mono text-xl font-semibold">{initialProperty.property_code}</h1>
            <span className="rounded-full border border-border px-2 py-1 text-xs text-text-muted">
              {t(STATUS_LABELS[initialProperty.status])}
            </span>
          </div>
          <p className="mt-1 text-sm text-text-muted">
            {initialProperty.title || t("Sem título")}
          </p>
        </div>
        <div className="text-right">
          <div className="text-lg font-semibold tabular-nums">
            {price} {initialProperty.currency}
          </div>
          <div className="text-xs text-text-muted">
            {new Date(initialProperty.updated_at).toLocaleDateString(locale)}
          </div>
        </div>
      </header>

      {feedback ? (
        <p className="rounded-md border border-border bg-surface-elevated p-3 text-sm" role="status">
          {feedback}
        </p>
      ) : null}

      <section className="rounded-md border border-border bg-surface p-4">
        <div className="mb-4">
          <h2 className="text-sm font-semibold">{t("Detalhes da propriedade")}</h2>
          <p className="text-sm text-text-muted">
            {t("Mantenha cadastro, localização e características em uma única ficha.")}
          </p>
        </div>

        {podeGerenciar ? (
          <form
            className="grid gap-4 md:grid-cols-2"
            onSubmit={(event) => {
              event.preventDefault();
              executar(atualizarImovel, new FormData(event.currentTarget));
            }}
          >
            <input type="hidden" name="id" value={initialProperty.id} />

            <label className="flex flex-col gap-1">
              <span className="text-xs text-text-muted">{t("Código da propriedade")}</span>
              <input
                name="property_code"
                defaultValue={initialProperty.property_code}
                maxLength={80}
                className="h-9 rounded-xs border border-border bg-surface-elevated px-3 font-mono text-sm text-text"
              />
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-xs text-text-muted">{t("Título")}</span>
              <input
                name="title"
                defaultValue={initialProperty.title}
                maxLength={120}
                className="h-9 rounded-xs border border-border bg-surface-elevated px-3 text-sm text-text"
              />
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-xs text-text-muted">{t("Situação")}</span>
              <select
                name="status"
                defaultValue={initialProperty.status}
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
              <span className="text-xs text-text-muted">{t("Tipo")}</span>
              <select
                name="property_type"
                defaultValue={initialProperty.property_type}
                className="h-9 rounded-xs border border-border bg-surface-elevated px-3 text-sm text-text"
              >
                {(Object.keys(PROPERTY_TYPE_LABELS) as ImovelPropertyType[]).map((type) => (
                  <option key={type} value={type}>
                    {t(PROPERTY_TYPE_LABELS[type])}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-xs text-text-muted">{t("Finalidade")}</span>
              <select
                name="listing_type"
                defaultValue={initialProperty.listing_type}
                className="h-9 rounded-xs border border-border bg-surface-elevated px-3 text-sm text-text"
              >
                {(Object.keys(LISTING_TYPE_LABELS) as ImovelListingType[]).map((type) => (
                  <option key={type} value={type}>
                    {t(LISTING_TYPE_LABELS[type])}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-xs text-text-muted">{t("Preço")}</span>
              <input
                name="price"
                defaultValue={(initialProperty.price_cents / 100).toFixed(2).replace(".", ",")}
                inputMode="decimal"
                required
                className="h-9 rounded-xs border border-border bg-surface-elevated px-3 text-sm text-text"
              />
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-xs text-text-muted">{t("Moeda")}</span>
              <input
                name="currency"
                defaultValue={initialProperty.currency}
                maxLength={3}
                className="h-9 rounded-xs border border-border bg-surface-elevated px-3 text-sm uppercase text-text"
              />
            </label>

            <label className="md:col-span-2 flex flex-col gap-1">
              <span className="text-xs text-text-muted">{t("Descrição")}</span>
              <textarea
                name="description"
                defaultValue={initialProperty.description}
                maxLength={5000}
                rows={5}
                className="rounded-xs border border-border bg-surface-elevated px-3 py-2 text-sm text-text"
              />
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-xs text-text-muted">{t("Endereço")}</span>
              <input
                name="address"
                defaultValue={initialProperty.address}
                maxLength={240}
                className="h-9 rounded-xs border border-border bg-surface-elevated px-3 text-sm text-text"
              />
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-xs text-text-muted">{t("Cidade")}</span>
              <input
                name="city"
                defaultValue={initialProperty.city}
                maxLength={100}
                className="h-9 rounded-xs border border-border bg-surface-elevated px-3 text-sm text-text"
              />
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-xs text-text-muted">{t("Latitude")}</span>
              <input
                name="latitude"
                defaultValue={initialProperty.latitude ?? ""}
                inputMode="decimal"
                className="h-9 rounded-xs border border-border bg-surface-elevated px-3 text-sm text-text"
              />
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-xs text-text-muted">{t("Longitude")}</span>
              <input
                name="longitude"
                defaultValue={initialProperty.longitude ?? ""}
                inputMode="decimal"
                className="h-9 rounded-xs border border-border bg-surface-elevated px-3 text-sm text-text"
              />
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-xs text-text-muted">{t("Quartos")}</span>
              <input
                name="bedrooms"
                defaultValue={initialProperty.bedrooms}
                inputMode="numeric"
                min={0}
                className="h-9 rounded-xs border border-border bg-surface-elevated px-3 text-sm text-text"
              />
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-xs text-text-muted">{t("Banheiros")}</span>
              <input
                name="bathrooms"
                defaultValue={initialProperty.bathrooms}
                inputMode="decimal"
                min={0}
                className="h-9 rounded-xs border border-border bg-surface-elevated px-3 text-sm text-text"
              />
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-xs text-text-muted">{t("Área (m²)")}</span>
              <input
                name="area_m2"
                defaultValue={initialProperty.area_m2}
                inputMode="decimal"
                min={0}
                className="h-9 rounded-xs border border-border bg-surface-elevated px-3 text-sm text-text"
              />
            </label>

            <div className="flex flex-wrap items-center gap-2 md:col-span-2">
              <Button type="submit" disabled={pending}>
                {pending ? t("Salvando…") : t("Salvar")}
              </Button>
              <span className="text-xs text-text-muted">
                {t("As alterações ficam registradas na auditoria.")}
              </span>
            </div>
          </form>
        ) : (
          <div className="grid gap-x-8 gap-y-4 md:grid-cols-3">
            <div><span className="text-xs text-text-muted">{t("Tipo")}</span><p className="text-sm">{t(PROPERTY_TYPE_LABELS[initialProperty.property_type])}</p></div>
            <div><span className="text-xs text-text-muted">{t("Finalidade")}</span><p className="text-sm">{t(LISTING_TYPE_LABELS[initialProperty.listing_type])}</p></div>
            <div><span className="text-xs text-text-muted">{t("Cidade")}</span><p className="text-sm">{initialProperty.city || "—"}</p></div>
            <div><span className="text-xs text-text-muted">{t("Endereço")}</span><p className="text-sm">{initialProperty.address || "—"}</p></div>
            <div><span className="text-xs text-text-muted">{t("Quartos")}</span><p className="text-sm">{initialProperty.bedrooms}</p></div>
            <div><span className="text-xs text-text-muted">{t("Banheiros")}</span><p className="text-sm">{initialProperty.bathrooms}</p></div>
            <div><span className="text-xs text-text-muted">{t("Área (m²)")}</span><p className="text-sm">{initialProperty.area_m2}</p></div>
            <div className="md:col-span-3"><span className="text-xs text-text-muted">{t("Descrição")}</span><p className="whitespace-pre-wrap text-sm">{initialProperty.description || "—"}</p></div>
          </div>
        )}
      </section>

      <section className="rounded-md border border-border bg-surface p-4">
        <div className="mb-4">
          <h2 className="text-sm font-semibold">{t("Galeria")}</h2>
          <p className="text-sm text-text-muted">
            {t("Cadastre URLs de imagens da propriedade para manter a galeria ligada à ficha.")}
          </p>
        </div>

        {podeGerenciar ? (
          <form
            className="mb-5 grid gap-3 md:grid-cols-[1fr_1fr_auto]"
            onSubmit={(event) => {
              event.preventDefault();
              executar(adicionarImagemImovel, new FormData(event.currentTarget), () => {
                setImageUrl("");
                setImageAlt("");
              });
            }}
          >
            <input type="hidden" name="property_id" value={initialProperty.id} />
            <label className="flex flex-col gap-1">
              <span className="text-xs text-text-muted">{t("URL da imagem")}</span>
              <input
                name="image_url"
                value={imageUrl}
                onChange={(event) => setImageUrl(event.target.value)}
                type="url"
                required
                placeholder="https://..."
                className="h-9 rounded-xs border border-border bg-surface-elevated px-3 text-sm text-text"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs text-text-muted">{t("Texto alternativo")}</span>
              <input
                name="alt_text"
                value={imageAlt}
                onChange={(event) => setImageAlt(event.target.value)}
                maxLength={160}
                className="h-9 rounded-xs border border-border bg-surface-elevated px-3 text-sm text-text"
              />
            </label>
            <Button type="submit" disabled={pending}>
              {pending ? t("Salvando…") : t("Adicionar imagem")}
            </Button>
          </form>
        ) : null}

        {initialImages.length === 0 ? (
          <div className="rounded-md border border-border p-6 text-sm text-text-muted">
            {t("Nenhuma imagem cadastrada.")}
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {initialImages.map((image) => (
              <article key={image.id} className="overflow-hidden rounded-md border border-border">
                <div className="aspect-[4/3] bg-surface-elevated">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={image.image_url}
                    alt={image.alt_text || initialProperty.property_code}
                    className="h-full w-full object-cover"
                    loading="lazy"
                  />
                </div>
                <div className="flex items-center justify-between gap-3 p-3">
                  <a
                    href={image.image_url}
                    target="_blank"
                    rel="noreferrer"
                    className="min-w-0 truncate text-xs text-text-muted underline-offset-2 hover:underline"
                  >
                    {image.alt_text || image.image_url}
                  </a>
                  {podeGerenciar ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={pending}
                      onClick={() => {
                        if (!window.confirm(t("Excluir esta imagem?"))) return;
                        const formData = new FormData();
                        formData.set("property_id", initialProperty.id);
                        formData.set("image_id", image.id);
                        executar(excluirImagemImovel, formData);
                      }}
                    >
                      {t("Excluir")}
                    </Button>
                  ) : null}
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4 text-xs text-text-muted">
        <span>
          {t("Criada em")} {new Date(initialProperty.created_at).toLocaleDateString(locale)}
        </span>
        {podeExcluir ? (
          <span>{t("Exclusão da propriedade continua disponível na lista principal.")}</span>
        ) : null}
      </div>
    </div>
  );
}
