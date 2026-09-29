"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { useT } from "@/hooks/i18n/useT";
import {
  desvincularLeadDeImovel,
  vincularLeadAImovel,
  type ImoveisLeadActionResult,
} from "@/app/actions/imoveis/leads";
import {
  relationshipLabel,
  type ImoveisLeadOption,
  type ImoveisLeadPropertyRow,
  type ImoveisLeadRelationship,
} from "@/lib/imoveis/leads";

const RELATIONSHIPS: ImoveisLeadRelationship[] = [
  "interested",
  "presented",
  "rejected",
];

function feedbackOf(result: ImoveisLeadActionResult): string {
  return result.ok ? result.message : result.error;
}

export function LeadPropertyClient({
  propertyId,
  initialLinks,
  leadOptions,
  podeGerenciar,
}: {
  propertyId: string;
  initialLinks: Array<
    ImoveisLeadPropertyRow & { lead: ImoveisLeadOption | null }
  >;
  leadOptions: ImoveisLeadOption[];
  podeGerenciar: boolean;
}) {
  const t = useT();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState("");
  const [leadId, setLeadId] = useState("");
  const [relationship, setRelationship] =
    useState<ImoveisLeadRelationship>("interested");
  const [notes, setNotes] = useState("");

  function run(
    action: (formData: FormData) => Promise<ImoveisLeadActionResult>,
    formData: FormData,
    reset?: () => void,
  ) {
    startTransition(async () => {
      const result = await action(formData);
      setFeedback(feedbackOf(result));
      if (result.ok) {
        reset?.();
        router.refresh();
      }
    });
  }

  return (
    <section className="rounded-md border border-border bg-surface p-4">
      <div className="mb-4">
        <h2 className="text-sm font-semibold">{t("Leads e clientes")}</h2>
        <p className="text-sm text-text-muted">
          {t(
            "Ligue esta propriedade aos negócios do CRM. O vínculo é a base para matching e acompanhamento comercial futuros.",
          )}
        </p>
      </div>

      {feedback ? (
        <p className="mb-4 rounded-md border border-border bg-surface-elevated p-3 text-sm" role="status">
          {feedback}
        </p>
      ) : null}

      {podeGerenciar ? (
        <form
          className="mb-5 grid gap-3 md:grid-cols-[1.6fr_0.9fr_1fr_auto]"
          onSubmit={(event) => {
            event.preventDefault();
            run(vincularLeadAImovel, new FormData(event.currentTarget), () => {
              setLeadId("");
              setRelationship("interested");
              setNotes("");
            });
          }}
        >
          <input type="hidden" name="property_id" value={propertyId} />
          <label className="flex flex-col gap-1">
            <span className="text-xs text-text-muted">{t("Lead")}</span>
            <select
              name="lead_id"
              value={leadId}
              onChange={(event) => setLeadId(event.target.value)}
              required
              className="h-9 rounded-xs border border-border bg-surface-elevated px-3 text-sm text-text"
            >
              <option value="">{t("Selecione um lead")}</option>
              {leadOptions.map((lead) => (
                <option key={lead.id} value={lead.id}>
                  {lead.title}
                  {lead.contact_name ? ` — ${lead.contact_name}` : ""}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-xs text-text-muted">{t("Relação")}</span>
            <select
              name="relationship"
              value={relationship}
              onChange={(event) =>
                setRelationship(event.target.value as ImoveisLeadRelationship)
              }
              className="h-9 rounded-xs border border-border bg-surface-elevated px-3 text-sm text-text"
            >
              {RELATIONSHIPS.map((value) => (
                <option key={value} value={value}>
                  {t(relationshipLabel(value))}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-xs text-text-muted">{t("Observação")}</span>
            <input
              name="notes"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              maxLength={1000}
              className="h-9 rounded-xs border border-border bg-surface-elevated px-3 text-sm text-text"
            />
          </label>

          <Button type="submit" disabled={pending || leadOptions.length === 0}>
            {pending ? t("Salvando…") : t("Vincular")}
          </Button>
        </form>
      ) : null}

      {leadOptions.length === 0 ? (
        <div className="rounded-md border border-border p-4 text-sm text-text-muted">
          {t("Nenhum lead disponível nesta organização.")}
        </div>
      ) : initialLinks.length === 0 ? (
        <div className="rounded-md border border-border p-4 text-sm text-text-muted">
          {t("Nenhum lead está vinculado a esta propriedade.")}
        </div>
      ) : (
        <div className="divide-y divide-border rounded-md border border-border">
          {initialLinks.map((link) => (
            <article key={link.id} className="flex flex-wrap items-center justify-between gap-3 p-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">
                  {link.lead?.title ?? link.lead_id}
                </p>
                <p className="text-xs text-text-muted">
                  {link.lead?.contact_name
                    ? `${link.lead.contact_name} · ${t(relationshipLabel(link.relationship))}`
                    : t(relationshipLabel(link.relationship))}
                  {link.notes ? ` · ${link.notes}` : ""}
                </p>
              </div>
              {podeGerenciar ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={pending}
                  onClick={() => {
                    if (!window.confirm(t("Remover este vínculo?"))) return;
                    const formData = new FormData();
                    formData.set("link_id", link.id);
                    run(desvincularLeadDeImovel, formData);
                  }}
                >
                  {t("Remover")}
                </Button>
              ) : null}
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
