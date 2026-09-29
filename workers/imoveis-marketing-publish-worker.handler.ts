import { createAdminClient } from "@/lib/supabase/admin";
import { audit } from "@/lib/audit";
import { decryptSocialAccountToken, marketingBackoffMinutes } from "@/lib/imoveis/marketing";
import { publishToMeta, PermanentMetaError } from "@/lib/imoveis/meta";
import type { EventHandler, EventRow, HandlerResult } from "@/lib/event-log/dispatcher";

const HANDLER_KEY = "imoveis.social-publisher";
const STALE_PUBLISHING_MS = 10 * 60 * 1000;

type Job = {
  id: string;
  organization_id: string;
  property_id: string;
  marketing_asset_id: string;
  social_account_id: string;
  status: "pending" | "publishing" | "published" | "failed" | "cancelled";
  scheduled_at: string;
  provider_media_container_id: string | null;
  attempts: number;
  next_attempt_at: string | null;
  updated_at: string;
};

type Asset = {
  id: string;
  platform: "instagram" | "facebook";
  caption: string;
  hashtags: string[];
  alt_text: string;
  status: string;
};

export const imoveisSocialPublishHandler: EventHandler = {
  key: HANDLER_KEY,
  events: ["imoveis.social_publish_requested"],
  async handle(row: EventRow): Promise<HandlerResult> {
    const jobId = String(row.payload.job_id ?? row.entity_id ?? "");
    if (!jobId) return { consumer_key: HANDLER_KEY, status: "skipped", detail: "missing_job_id" };

    const admin = createAdminClient();
    const { data: jobData, error: jobError } = await admin
      .from("imoveis_publication_jobs")
      .select("id, organization_id, property_id, marketing_asset_id, social_account_id, status, scheduled_at, provider_media_container_id, attempts, next_attempt_at, updated_at")
      .eq("id", jobId)
      .maybeSingle();

    if (jobError) throw new Error(jobError.message);
    if (!jobData) return { consumer_key: HANDLER_KEY, status: "skipped", detail: "job_not_found" };

    const job = jobData as Job;
    if (job.status === "cancelled" || job.status === "published" || job.status === "failed") {
      return { consumer_key: HANDLER_KEY, status: "skipped", detail: "job_already_terminal" };
    }

    const stale = job.status === "publishing" && Date.now() - new Date(job.updated_at).getTime() > STALE_PUBLISHING_MS;
    const claim = await admin
      .from("imoveis_publication_jobs")
      .update({ status: "publishing", updated_at: new Date().toISOString() })
      .eq("id", job.id)
      .eq("organization_id", job.organization_id)
      .in("status", stale ? ["publishing"] : ["pending"])
      .select("id")
      .maybeSingle();

    if (!claim.data) return { consumer_key: HANDLER_KEY, status: "skipped", detail: "claim_lost" };

    try {
      const [{ data: assetData, error: assetError }, { data: imageData, error: imageError }] = await Promise.all([
        admin.from("imoveis_marketing_assets")
          .select("id, platform, caption, hashtags, alt_text, status")
          .eq("id", job.marketing_asset_id).eq("organization_id", job.organization_id).maybeSingle(),
        admin.from("imoveis_property_images")
          .select("image_url, sort_order").eq("property_id", job.property_id).eq("organization_id", job.organization_id)
          .order("sort_order", { ascending: true }).limit(1).maybeSingle(),
      ]);

      if (assetError) throw new Error(assetError.message);
      if (imageError) throw new Error(imageError.message);
      if (!assetData) throw new Error("marketing_asset_not_found");
      if (!imageData) throw new PermanentMetaError("A propriedade não possui uma imagem para publicar.");

      const account = await decryptSocialAccountToken(job.social_account_id, job.organization_id);
      const asset = assetData as Asset;
      const caption = asset.hashtags.length ? asset.caption.trim() + "\n\n" + asset.hashtags.join(" ") : asset.caption.trim();

      const result = await publishToMeta({
        platform: account.platform,
        externalAccountId: account.externalAccountId,
        accessToken: account.accessToken,
        imageUrl: String((imageData as { image_url: string }).image_url),
        caption,
        altText: asset.alt_text,
        providerMediaContainerId: job.provider_media_container_id,
      });

      await admin.from("imoveis_publication_jobs").update({
        status: "published",
        provider_media_container_id: result.providerMediaContainerId,
        external_publication_id: result.externalPublicationId,
        permalink: result.permalink,
        attempts: job.attempts,
        next_attempt_at: null,
        last_error: null,
        updated_at: new Date().toISOString(),
      }).eq("id", job.id).eq("organization_id", job.organization_id);

      await admin.from("imoveis_marketing_assets").update({
        status: "published",
        published_at: new Date().toISOString(),
      }).eq("id", job.marketing_asset_id).eq("organization_id", job.organization_id);

      await audit({
        action: "imoveis.publication_published",
        actorUserId: null,
        organizationId: job.organization_id,
        resourceType: "imoveis_publication_job",
        resourceId: job.id,
        metadata: { platform: account.platform, external_publication_id: result.externalPublicationId },
      });

      return { consumer_key: HANDLER_KEY, status: "ok", detail: "published" };
    } catch (error) {
      const attempts = job.attempts + 1;
      const detail = error instanceof Error ? error.message : String(error);

      if (error instanceof PermanentMetaError) {
        await admin.from("imoveis_publication_jobs").update({
          status: "failed",
          attempts,
          next_attempt_at: null,
          last_error: detail,
          updated_at: new Date().toISOString(),
        }).eq("id", job.id).eq("organization_id", job.organization_id);

        await audit({
          action: "imoveis.publication_failed",
          actorUserId: null,
          organizationId: job.organization_id,
          resourceType: "imoveis_publication_job",
          resourceId: job.id,
          metadata: { permanent: true, error: detail },
        });
        return { consumer_key: HANDLER_KEY, status: "ok", detail: "permanent_failure" };
      }

      const retryAt = new Date(Date.now() + marketingBackoffMinutes(attempts) * 60_000).toISOString();
      await admin.from("imoveis_publication_jobs").update({
        status: "pending",
        attempts,
        next_attempt_at: retryAt,
        last_error: detail,
        updated_at: new Date().toISOString(),
      }).eq("id", job.id).eq("organization_id", job.organization_id);

      return { consumer_key: HANDLER_KEY, status: "ok", detail: "retry_scheduled" };
    }
  },
};
