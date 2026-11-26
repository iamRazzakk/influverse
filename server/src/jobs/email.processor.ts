import { Job } from "bullmq";
import { sendEmail } from "../integrations/mailer";
import { maskEmail } from "../shared/email";
import { errorLogger, logger } from "../shared/logger";
import { ISendEmail } from "../types/email";

/**
 * Queue `email` → job `send`. Throwing makes BullMQ retry (exp backoff, 5 attempts).
 * Every attempt is logged with the recipient (masked) and subject, so you can see exactly which email
 * was sent, which one failed and why (wrong SMTP password, blocked port, rejected address…).
 */
export const emailProcessor = async (job: Job<ISendEmail>) => {
  const { to, subject, html } = job.data;
  const attempt = `attempt ${job.attemptsMade + 1}/${job.opts.attempts ?? 1}`;
  try {
    const info = await sendEmail(to, subject, html);
    logger.info(`Email SENT ✓ → ${maskEmail(to)} | "${subject}" (job ${job.id}, ${attempt}, smtp: ${info.response ?? "ok"})`);
  } catch (error: any) {
    errorLogger.error(`Email FAILED ✗ → ${maskEmail(to)} | "${subject}" (job ${job.id}, ${attempt}): ${error?.message}`);
    throw error;
  }
};
