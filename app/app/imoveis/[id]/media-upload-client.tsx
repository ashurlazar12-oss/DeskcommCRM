"use client";

import { useRef, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import {
  excluirMidiaImovel,
  finalizarUploadMidiaImovel,
  prepararUploadMidiaImovel,
} from "@/app/actions/imoveis/media";
import { IMOVEIS_MEDIA_BUCKET } from "@/lib/imoveis/media";
import { createClient } from "@/lib/supabase/browser";
import { useT } from "@/hooks/i18n/useT";

export type PropertyUploadedMedia = {
  id: string;
  media_type: "image" | "video";
  alt_text: string;
  original_name: string | null;
  content_type: string | null;
  size_bytes: number | null;
  preview_url: string;
};

function tamanho(size: number | null): string {
  if (!size) return "";
  if (size >= 1024 * 1024) return `${(size / 1024 / 1024).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(size / 1024))} KB`;
}

export function PropertyMediaUpload({
  propertyId,
  initialMedia,
  canManage,
}: {
  propertyId: string;
  initialMedia: PropertyUploadedMedia[];
  canManage: boolean;
}) {
  const t = useT();
  const fileRef = useRef<HTMLInputElement>(null);
  const [altText, setAltText] = useState("");
  const [feedback, setFeedback] = useState("");
  const [pending, startTransition] = useTransition();

  async function upload(file: File) {
    setFeedback("");
    const request = {
      property_id: propertyId,
      original_name: file.name,
      content_type: file.type,
      size_bytes: file.size,
      alt_text: altText,
    };
    const prepared = await prepararUploadMidiaImovel(request);
    if (!prepared.ok) {
      setFeedback(prepared.error);
      return;
    }

    const storage = createClient().storage.from(IMOVEIS_MEDIA_BUCKET);
    const uploaded = await storage.uploadToSignedUrl(prepared.path, prepared.token, file, {
      contentType: prepared.contentType,
      upsert: false,
    });
    if (uploaded.error) {
      setFeedback(t("Não foi possível enviar o arquivo. Tente novamente."));
      return;
    }

    const finalized = await finalizarUploadMidiaImovel({
      ...request,
      media_id: prepared.mediaId,
    });
    setFeedback(finalized.ok ? finalized.message : finalized.error);
    if (finalized.ok) {
      setAltText("");
      if (fileRef.current) fileRef.current.value = "";
      window.location.reload();
    }
  }

  return (
    <section className="rounded-md border border-border bg-surface p-4">
      <div className="mb-4">
        <h2 className="text-sm font-semibold">{t("Fotos e vídeos")}</h2>
        <p className="text-sm text-text-muted">
          {t("Envie arquivos da propriedade. Imagens aceitam até 15 MB e vídeos até 100 MB.")}
        </p>
      </div>

      {feedback ? (
        <p className="mb-4 rounded-md border border-border bg-surface-elevated p-3 text-sm" role="status">
          {feedback}
        </p>
      ) : null}

      {canManage ? (
        <form
          className="mb-5 grid gap-3 md:grid-cols-[1fr_1fr_auto]"
          onSubmit={(event) => {
            event.preventDefault();
            const file = fileRef.current?.files?.[0];
            if (!file) {
              setFeedback(t("Escolha uma foto ou vídeo."));
              return;
            }
            startTransition(() => upload(file));
          }}
        >
          <label className="flex flex-col gap-1">
            <span className="text-xs text-text-muted">{t("Arquivo")}</span>
            <input
              ref={fileRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,video/mp4,video/webm,video/quicktime"
              required
              className="min-h-9 rounded-xs border border-border bg-surface-elevated px-3 py-1.5 text-sm text-text"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-text-muted">{t("Texto alternativo")}</span>
            <input
              value={altText}
              onChange={(event) => setAltText(event.target.value)}
              maxLength={160}
              className="h-9 rounded-xs border border-border bg-surface-elevated px-3 text-sm text-text"
            />
          </label>
          <Button type="submit" disabled={pending}>
            {pending ? t("Enviando…") : t("Enviar arquivo")}
          </Button>
        </form>
      ) : null}

      {initialMedia.length === 0 ? (
        <div className="rounded-md border border-border p-6 text-sm text-text-muted">
          {t("Nenhum arquivo enviado.")}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {initialMedia.map((media) => (
            <article key={media.id} className="overflow-hidden rounded-md border border-border">
              <div className="aspect-[4/3] bg-surface-elevated">
                {media.media_type === "video" ? (
                  <video
                    src={media.preview_url}
                    controls
                    preload="metadata"
                    className="h-full w-full object-cover"
                  />
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={media.preview_url}
                    alt={media.alt_text || media.original_name || t("Imagem da propriedade")}
                    loading="lazy"
                    className="h-full w-full object-cover"
                  />
                )}
              </div>
              <div className="flex items-center justify-between gap-3 p-3">
                <div className="min-w-0">
                  <p className="truncate text-xs">{media.original_name || t("Arquivo")}</p>
                  <p className="text-[11px] text-text-muted">
                    {media.media_type === "video" ? t("Vídeo") : t("Imagem")}
                    {media.size_bytes ? ` · ${tamanho(media.size_bytes)}` : ""}
                  </p>
                </div>
                {canManage ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={pending}
                    onClick={() => {
                      if (!window.confirm(t("Excluir este arquivo?"))) return;
                      startTransition(async () => {
                        const result = await excluirMidiaImovel({
                          property_id: propertyId,
                          media_id: media.id,
                        });
                        setFeedback(result.ok ? result.message : result.error);
                        if (result.ok) window.location.reload();
                      });
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
  );
}
