import { Job } from "bullmq";
import config from "../config";
import { logger } from "../shared/logger";

/**
 * Queue `revalidate` → job `website`.
 * The website's `POST /api/revalidate` route calls `revalidateTag(tag)` (Next.js on-demand ISR).
 * Skipped if no secret is set (dev).
 */
export const revalidateProcessor = async (job: Job<{ tags: string[] }>) => {
  if (!config.websiteRevalidateSecret) return;

  const res = await fetch(`${config.urls.website}/api/revalidate`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-revalidate-secret": config.websiteRevalidateSecret,
    },
    body: JSON.stringify({ tags: job.data.tags }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`Website revalidate failed: HTTP ${res.status}`);
  logger.info(`Website revalidated: ${job.data.tags.join(", ")}`);
};
