import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";

import { fail, ok } from "@/lib/api/wrappers";
import { autorizaCron } from "@/lib/auth/cron-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { emitPublicationRequested, type MarketingDatabase } from "@/lib/imoveis/marketing";
import type { SupabaseClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest): Promise<Response> {
  return handle(req);
}

export async function POST(req: NextRequest): Promise<Response> {
  return handle(req);
}

async function handle(req: NextRequest): Promise<Response> {
  const requestId = randomUUID();
  if (!autorizaCron(req)) return fail("forbidden", "Cron secret missing or invalid.", 403, { requestId });

  const admin = createAdminClient() as unknown as SupabaseClient<MarketingDatabase>;
  const now = new Date();
  const nowIso = now.toISOString();
  const staleEnqueue = new Date(now.getTime() - 120_000).toISOString();

  const { data: candidates, error } = await admin.from("imoveis_publication_jobs")
    .select("id, organization_id")
    .eq("status", "pending")
    .lte("scheduled_at", nowIso)
    .or(`next_attempt_at.is.null,next_attempt_at.lte.${nowIso}`)
    .or(`last_enqueued_at.is.null,last_enqueued_at.lt.${staleEnqueue}`)
    .limit(20);

  if (error) return fail("internal_error", error.message, 500, { requestId });

  let queued = 0;
  for (const job of candidates ?? []) {
    const { data: claimed } = await admin.from("imoveis_publication_jobs")
      .update({ last_enqueued_at: nowIso, updated_at: nowIso })
      .eq("id", job.id).eq("status", "pending")
      .or(`last_enqueued_at.is.null,last_enqueued_at.lt.${staleEnqueue}`)
      .select("id")
      .maybeSingle();

    if (!claimed) continue;
    try {
      await emitPublicationRequested(job.organization_id, job.id, null);
      queued += 1;
    } catch {
      // The throttle prevents an outage from flooding event_log on every minute tick.
    }
  }

  return ok({ queued }, { requestId });
}
