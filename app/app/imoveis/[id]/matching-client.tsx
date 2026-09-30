"use client";

import { useState } from "react";

import { useT } from "@/hooks/i18n/useT";
import type { ImoveisMatchResult } from "@/lib/imoveis/matching";

export function ImoveisMatchingClient({
  matches,
  excludedCount,
  leadsWithCriteria,
}: {
  matches: ImoveisMatchResult[];
  excludedCount: number;
  leadsWithCriteria: number;
}) {
  const t = useT();
  const [expanded, setExpanded] = useState<string | null>(null);

  return (
    <section className="rounded-md border border-border bg-surface p-4">
      <div className="mb-4">
        <h2 className="text-sm font-semibold">{t("Matching de leads")}</h2>
        <p className="text-sm text-text-muted">
          {t(
            "Mostra somente leads com preferências compatíveis. Critérios incompatíveis são excluídos para evitar recomendações inadequadas.",
          )}
        </p>
      </div>

      {leadsWithCriteria === 0 ? (
        <div className="rounded-md border border-border p-4 text-sm text-text-muted">
          {t(
            "Nenhum lead possui preferências imobiliárias estruturadas. Cadastre os critérios imobiliários nos custom fields do lead para ativar o matching.",
          )}
        </div>
      ) : matches.length === 0 ? (
        <div className="rounded-md border border-border p-4 text-sm text-text-muted">
          {t("Nenhum lead atende aos critérios desta propriedade.")}
          {excludedCount > 0 ? (
            <span className="ml-1">
              {t("Alguns leads foram excluídos por incompatibilidade.")}
            </span>
          ) : null}
        </div>
      ) : (
        <div className="divide-y divide-border rounded-md border border-border">
          {matches.map((match) => (
            <article key={match.lead_id} className="p-3">
              <button
                type="button"
                className="flex w-full items-center justify-between gap-3 text-left"
                onClick={() =>
                  setExpanded((current) =>
                    current === match.lead_id ? null : match.lead_id,
                  )
                }
              >
                <span className="min-w-0 truncate text-sm font-medium">
                  {match.lead_title}
                </span>
                <span className="shrink-0 text-xs font-medium">
                  {match.score}% {t("compatível")}
                </span>
              </button>

              {expanded === match.lead_id ? (
                <div className="mt-3 space-y-1 text-xs text-text-muted">
                  {match.reasons.map((reason) => (
                    <p key={reason}>• {reason}</p>
                  ))}
                </div>
              ) : null}
            </article>
          ))}
        </div>
      )}

      {excludedCount > 0 && matches.length > 0 ? (
        <p className="mt-3 text-xs text-text-muted">
          {excludedCount} {t("lead(s) foram excluídos por critérios incompatíveis.")}
        </p>
      ) : null}
    </section>
  );
}
