"use client";

import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import {
  aprovarEEnfileirarMarketing,
  conectarContaSocial,
  desativarContaSocial,
  gerarMarketingImovel,
  salvarMarketingImovel,
  type MarketingActionResult,
} from "@/app/actions/imoveis/marketing";
import type {
  MarketingAssetRow,
  MarketingInitialData,
  ImoveisMarketingLanguage,
  ImoveisSocialPlatform,
  SocialAccountRow,
} from "@/lib/imoveis/marketing";
import { useT } from "@/hooks/i18n/useT";

function platformLabel(t: (value: string) => string, platform: ImoveisSocialPlatform): string {
  return t(platform === "instagram" ? "Instagram" : "Facebook");
}

function statusLabel(t: (value: string) => string, status: MarketingAssetRow["status"]): string {
  return t(status === "published" ? "Publicado" : status === "approved" ? "Aprovado" : "Rascunho");
}

export function MarketingPanel({
  propertyId,
  initial,
  podeGerenciar,
  podePublicar,
}: {
  propertyId: string;
  initial: MarketingInitialData;
  podeGerenciar: boolean;
  podePublicar: boolean;
}) {
  const t = useT();
  const [pending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState("");
  const [language, setLanguage] = useState<ImoveisMarketingLanguage>("pt-BR");
  const [connectPlatform, setConnectPlatform] = useState<ImoveisSocialPlatform>("instagram");
  const [accountName, setAccountName] = useState("");
  const [externalAccountId, setExternalAccountId] = useState("");
  const [accessToken, setAccessToken] = useState("");

  function run(action: (formData: FormData) => Promise<MarketingActionResult>, formData: FormData) {
    startTransition(async () => {
      const result = await action(formData);
      setFeedback(result.ok ? result.message : result.error);
      if (result.ok) window.location.reload();
    });
  }

  function generate(platform: ImoveisSocialPlatform) {
    const formData = new FormData();
    formData.set("property_id", propertyId);
    formData.set("platform", platform);
    formData.set("language", language);
    run(gerarMarketingImovel, formData);
  }

  return (
    <section className="rounded-md border border-border bg-surface p-4">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-sm font-semibold">{t("Marketing da propriedade")}</h2>
          <p className="text-sm text-text-muted">
            {t("Gere copy com IA, revise e publique em Instagram ou Facebook sem copiar e colar.")}
          </p>
        </div>
        <select
          value={language}
          onChange={(event) => setLanguage(event.target.value as ImoveisMarketingLanguage)}
          className="h-9 rounded-xs border border-border bg-surface-elevated px-3 text-sm text-text"
        >
          <option value="pt-BR">{t("Português")}</option>
          <option value="es">{t("Espanhol")}</option>
        </select>
      </div>

      {feedback ? (
        <p className="mb-4 rounded-md border border-border bg-surface-elevated p-3 text-sm" role="status">
          {feedback}
        </p>
      ) : null}

      {podeGerenciar ? (
        <div className="mb-6 flex flex-wrap gap-2">
          <Button type="button" disabled={pending} onClick={() => generate("instagram")}>
            {pending ? t("Processando…") : t("Gerar Instagram")}
          </Button>
          <Button type="button" variant="secondary" disabled={pending} onClick={() => generate("facebook")}>
            {pending ? t("Processando…") : t("Gerar Facebook")}
          </Button>
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        {(["instagram", "facebook"] as ImoveisSocialPlatform[]).map((platform) => {
          const asset = initial.assets.find(
            (item) => item.platform === platform && item.language === language,
          ) ?? null;
          const accounts = initial.accounts.filter(
            (account) => account.platform === platform && account.status === "connected",
          );
          return (
            <MarketingAssetCard
              key={platform}
              asset={asset}
              accounts={accounts}
              pending={pending}
              podeGerenciar={podeGerenciar}
              podePublicar={podePublicar}
              t={t}
              run={run}
            />
          );
        })}
      </div>

      {podePublicar ? (
        <div className="mt-6 grid gap-6 border-t border-border pt-6 lg:grid-cols-2">
          <div>
            <h3 className="text-sm font-semibold">{t("Contas sociais")}</h3>
            <p className="mt-1 text-xs text-text-muted">
              {t("O token fica cifrado no servidor e nunca é enviado ao navegador novamente.")}
            </p>
            <div className="mt-3 space-y-2">
              {initial.accounts.length === 0 ? (
                <p className="rounded-md border border-border p-3 text-sm text-text-muted">
                  {t("Nenhuma conta social conectada.")}
                </p>
              ) : initial.accounts.map((account) => (
                <div key={account.id} className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border p-3 text-sm">
                  <div>
                    <div className="font-medium">
                      {account.account_name} · {platformLabel(t, account.platform)}
                    </div>
                    <div className="text-xs text-text-muted">
                      {account.external_account_id} · ••••{account.access_token_last4}
                    </div>
                  </div>
                  <form action={(formData) => run(desativarContaSocial, formData)}>
                    <input type="hidden" name="social_account_id" value={account.id} />
                    <Button type="submit" size="sm" variant="ghost" disabled={pending}>
                      {t("Desativar")}
                    </Button>
                  </form>
                </div>
              ))}
            </div>
          </div>

          <form
            className="space-y-3 rounded-md border border-border p-4"
            onSubmit={(event) => {
              event.preventDefault();
              run(conectarContaSocial, new FormData(event.currentTarget));
            }}
          >
            <h3 className="text-sm font-semibold">{t("Conectar conta social")}</h3>
            <select
              name="platform"
              value={connectPlatform}
              onChange={(event) => setConnectPlatform(event.target.value as ImoveisSocialPlatform)}
              className="h-9 w-full rounded-xs border border-border bg-surface-elevated px-3 text-sm text-text"
            >
              <option value="instagram">{t("Instagram")}</option>
              <option value="facebook">{t("Facebook")}</option>
            </select>
            <input name="account_name" value={accountName} onChange={(event) => setAccountName(event.target.value)} placeholder={t("Nome da conta")} required className="h-9 w-full rounded-xs border border-border bg-surface-elevated px-3 text-sm text-text" />
            <input name="external_account_id" value={externalAccountId} onChange={(event) => setExternalAccountId(event.target.value)} placeholder={t("ID da conta / Página")} required className="h-9 w-full rounded-xs border border-border bg-surface-elevated px-3 text-sm text-text" />
            <input name="access_token" value={accessToken} onChange={(event) => setAccessToken(event.target.value)} placeholder={t("Token de acesso")} type="password" autoComplete="off" required className="h-9 w-full rounded-xs border border-border bg-surface-elevated px-3 text-sm text-text" />
            <Button type="submit" disabled={pending}>
              {pending ? t("Processando…") : t("Conectar")}
            </Button>
          </form>
        </div>
      ) : null}

      {initial.jobs.length > 0 ? (
        <div className="mt-6 border-t border-border pt-6">
          <h3 className="text-sm font-semibold">{t("Fila de publicações")}</h3>
          <div className="mt-3 space-y-2">
            {initial.jobs.map((job) => (
              <div key={job.id} className="rounded-md border border-border p-3 text-xs">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <span className="font-medium">
                    {t(job.status === "published" ? "Publicado" : job.status === "failed" ? "Falhou" : job.status === "publishing" ? "Publicando" : "Agendado")}
                  </span>
                  <span>{new Date(job.scheduled_at).toLocaleString()}</span>
                </div>
                {job.last_error ? <div className="mt-1 text-text-muted">{job.last_error}</div> : null}
                {job.permalink ? (
                  <a className="mt-1 inline-block underline" href={job.permalink} target="_blank" rel="noreferrer">{t("Abrir publicação")}</a>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}

function MarketingAssetCard({
  asset,
  accounts,
  pending,
  podeGerenciar,
  podePublicar,
  t,
  run,
}: {
  asset: MarketingAssetRow | null;
  accounts: SocialAccountRow[];
  pending: boolean;
  podeGerenciar: boolean;
  podePublicar: boolean;
  t: (value: string) => string;
  run: (action: (formData: FormData) => Promise<MarketingActionResult>, formData: FormData) => void;
}) {
  const [selectedAccountId, setSelectedAccountId] = useState(accounts[0]?.id ?? "");
  const [scheduledAt, setScheduledAt] = useState("");

  if (!asset) {
    return (
      <div className="rounded-md border border-dashed border-border p-4 text-sm text-text-muted">
        {t("Ainda não há material gerado para esta plataforma.")}
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-md border border-border p-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold">{asset.platform === "instagram" ? t("Instagram") : t("Facebook")} · v{asset.revision}</h3>
        <span className="text-xs text-text-muted">{statusLabel(t, asset.status)}</span>
      </div>

      <form
        className="space-y-3"
        onSubmit={(event) => {
          event.preventDefault();
          run(salvarMarketingImovel, new FormData(event.currentTarget));
        }}
      >
        <input type="hidden" name="asset_id" value={asset.id} />
        <label className="flex flex-col gap-1">
          <span className="text-xs text-text-muted">{t("Título")}</span>
          <input name="headline" defaultValue={asset.headline} maxLength={120} disabled={!podeGerenciar} className="h-9 rounded-xs border border-border bg-surface-elevated px-3 text-sm text-text" />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-text-muted">{t("Legenda")}</span>
          <textarea name="caption" defaultValue={asset.caption} rows={6} maxLength={2200} disabled={!podeGerenciar} className="rounded-xs border border-border bg-surface-elevated px-3 py-2 text-sm text-text" />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-text-muted">{t("Hashtags")}</span>
          <input name="hashtags" defaultValue={asset.hashtags.join(" ")} disabled={!podeGerenciar} className="h-9 rounded-xs border border-border bg-surface-elevated px-3 text-sm text-text" />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-text-muted">{t("CTA")}</span>
          <input name="cta" defaultValue={asset.cta} maxLength={160} disabled={!podeGerenciar} className="h-9 rounded-xs border border-border bg-surface-elevated px-3 text-sm text-text" />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-text-muted">{t("Texto alternativo")}</span>
          <input name="alt_text" defaultValue={asset.alt_text} maxLength={300} disabled={!podeGerenciar} className="h-9 rounded-xs border border-border bg-surface-elevated px-3 text-sm text-text" />
        </label>
        {podeGerenciar ? <Button type="submit" variant="secondary" disabled={pending}>{t("Salvar marketing")}</Button> : null}
      </form>

      {podePublicar ? (
        <div className="flex flex-wrap items-end gap-2 border-t border-border pt-3">
          <label className="flex min-w-[180px] flex-col gap-1">
            <span className="text-xs text-text-muted">{t("Escolha uma conta")}</span>
            <select value={selectedAccountId} onChange={(event) => setSelectedAccountId(event.target.value)} className="h-9 rounded-xs border border-border bg-surface-elevated px-3 text-sm text-text">
              <option value="">{t("Escolha uma conta")}</option>
              {accounts.map((account) => <option key={account.id} value={account.id}>{account.account_name}</option>)}
            </select>
          </label>
          <label className="flex min-w-[210px] flex-col gap-1">
            <span className="text-xs text-text-muted">{t("Data de publicação")}</span>
            <input type="datetime-local" value={scheduledAt} onChange={(event) => setScheduledAt(event.target.value)} className="h-9 rounded-xs border border-border bg-surface-elevated px-3 text-sm text-text" />
          </label>
          <Button
            type="button"
            disabled={pending || !selectedAccountId}
            onClick={() => {
              const formData = new FormData();
              formData.set("asset_id", asset.id);
              formData.set("social_account_id", selectedAccountId);
              formData.set("scheduled_at", scheduledAt);
              run(aprovarEEnfileirarMarketing, formData);
            }}
          >
            {t("Aprovar e publicar")}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
