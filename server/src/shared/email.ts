import { randomUUID } from "crypto";
import { getQueue, QUEUES } from "../queues";
import { ISendEmail } from "../types/email";
import { JOB } from "../jobs/jobNames";
import config from "../config";
import { errorLogger, logger } from "./logger";

const isEmailConfigured = () => Boolean(config.email.host && config.email.user && config.email.pass);

/** Strips the HTML so the console shows readable text (OTP codes, links). */
const toText = (html: string) =>
  html.replace(/<style[\s\S]*?<\/style>/gi, "").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();

/** "abdur@gmail.com" → "ab***@gmail.com" — enough to recognise in logs without storing full addresses. */
export const maskEmail = (email: string) => {
  const [name, domain] = email.split("@");
  return domain ? `${name.slice(0, 2)}***@${domain}` : "***";
};

/**
 * Puts an email on the `email` queue — it does NOT send it. The worker process sends it
 * (`src/jobs/email.processor.ts`) with retries, so API requests never wait on SMTP.
 *
 * Pass an `idempotencyKey` (e.g. `otp:<tokenId>`) when the same email must never be queued twice.
 */
export const enqueueEmail = async (email: ISendEmail, idempotencyKey?: string) => {
  // Development without SMTP: print the email in the API console (so OTP codes can still be tested).
  if (!isEmailConfigured() && !config.isProd) {
    logger.warn(`[email not configured] To: ${email.to} | ${email.subject} | ${toText(email.html)}`);
    return;
  }
  const queue = getQueue(QUEUES.email);
  const job = await queue.add(
    JOB.sendEmail,
    { to: email.to, subject: email.subject, html: email.html },
    { jobId: `email:${idempotencyKey ?? randomUUID()}` },
  );
  logger.info(`Email queued → ${maskEmail(email.to)} | "${email.subject}" (job ${job.id})`);

  // Emails are sent only by the worker process. Without one they wait in Redis forever — say so loudly.
  const workers = await queue.getWorkersCount().catch(() => -1);
  if (workers === 0) {
    errorLogger.error(
      `No email worker is running — "${email.subject}" will not be sent until you start it (npm run dev:worker / npm run start:worker).`,
    );
  }
};
