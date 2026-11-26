import { Job, Worker } from "bullmq";
import config from "../config";
import { createRedisConnection } from "../config/redis.config";
import { verifyMailer } from "../integrations/mailer";
import { getQueue, QueueName, QUEUES } from "../queues";
import { maskEmail } from "../shared/email";
import { errorLogger, logger } from "../shared/logger";
import { onShutdown } from "../shared/shutdown";
import { deleteFileProcessor } from "./cleanup.processor";
import { emailProcessor } from "./email.processor";
import { JOB } from "./jobNames";
import { dispatchOutbox } from "./outbox.processor";
import { revalidateProcessor } from "./revalidate.processor";
import { offerExpireProcessor, orderSweepProcessor, payoutSweepProcessor } from "./offer.processor";
import { liftSuspensionProcessor } from "./user.lift-suspension.processor";
import { finalizeDeactivation } from "./user.processor";

/**
 * Starts every BullMQ processor + repeatable job (emails, cleanup, revalidate, outbox …).
 * Called by the API process when RUN_WORKER_IN_API=true (default), and by the standalone `worker.ts`.
 * MongoDB must already be connected. Workers are closed first on shutdown so running jobs can finish.
 */
type Processor = (job: Job) => Promise<unknown>;

/**
 * Queue → { job name → processor }. Register new jobs here.
 * Unknown job names fail (no silent drop).
 */
const registry: Partial<Record<QueueName, { concurrency: number; handlers: Record<string, Processor> }>> = {
  [QUEUES.email]: { concurrency: 5, handlers: { [JOB.sendEmail]: emailProcessor } },
  [QUEUES.revalidate]: { concurrency: 2, handlers: { [JOB.revalidateWebsite]: revalidateProcessor } },
  [QUEUES.user]: {
    concurrency: 2,
    handlers: { [JOB.finalizeDeactivation]: finalizeDeactivation, [JOB.liftSuspension]: liftSuspensionProcessor },
  },
  [QUEUES.cleanup]: { concurrency: 5, handlers: { [JOB.deleteFile]: deleteFileProcessor } },
  // concurrency 1: one dispatcher per worker process; row claiming keeps multiple processes safe.
  [QUEUES.outbox]: { concurrency: 1, handlers: { [JOB.outboxDispatch]: dispatchOutbox } },
  [QUEUES.order]: {
    concurrency: 1,
    handlers: { [JOB.offerExpire]: offerExpireProcessor, [JOB.orderSweep]: orderSweepProcessor, [JOB.payoutSweep]: payoutSweepProcessor },
  },
};

/**
 * Repeatable jobs. `upsertJobScheduler` is idempotent, so every worker instance can call it on
 * boot without creating duplicates.
 */
const registerSchedulers = async () => {
  await getQueue(QUEUES.outbox).upsertJobScheduler("outbox-poll", { every: 2_000 }, { name: JOB.outboxDispatch });
  await getQueue(QUEUES.order).upsertJobScheduler("offer-expire", { every: 10 * 60_000 }, { name: JOB.offerExpire });
  await getQueue(QUEUES.order).upsertJobScheduler("order-sweep", { every: 10 * 60_000 }, { name: JOB.orderSweep });
  await getQueue(QUEUES.order).upsertJobScheduler("payout-sweep", { every: 10 * 60_000 }, { name: JOB.payoutSweep });
};

let started = false;

export const startWorkers = async () => {
  if (started) return;
  started = true;
  const workers: Worker[] = [];

  for (const [queueName, def] of Object.entries(registry)) {
    if (!def) continue;
    const worker = new Worker(
      queueName,
      async (job) => {
        const handler = def.handlers[job.name];
        if (!handler) throw new Error(`No handler for ${queueName}:${job.name}`);
        return handler(job);
      },
      // Each Worker runs blocking commands → needs its own connection
      { connection: createRedisConnection(`worker-${queueName}`), concurrency: def.concurrency },
    );

    worker.on("failed", (job, err) => {
      const final = job && job.attemptsMade >= (job.opts.attempts ?? 1);
      errorLogger.error(
        `Job ${queueName}:${job?.name} (${job?.id}) failed${final ? " permanently" : ""}: ${err.message}`,
      );
      // Phase 6: final failure → admin alert
    });
    worker.on("error", (err) => errorLogger.error(`Worker ${queueName} error: ${err.message}`));

    workers.push(worker);
  }
  // Close workers first (let running jobs finish), then queues / redis / mongo
  onShutdown("workers", () => Promise.all(workers.map((w) => w.close())));
  await registerSchedulers();

  logger.info(`Worker started: ${workers.map((w) => w.name).join(", ")}`);

  // SMTP check up front: a wrong EMAIL_HOST / EMAIL_PASS shows here instead of only when an email fails.
  if (config.email.host && config.email.user && config.email.pass) {
    verifyMailer()
      .then(() => logger.info(`SMTP ready: ${config.email.host}:${config.email.port} as ${maskEmail(config.email.user!)}`))
      .catch((error) => errorLogger.error(`SMTP login FAILED (${config.email.host}:${config.email.port}): ${error.message}`));
  } else {
    logger.warn("Email is not configured (EMAIL_HOST / EMAIL_USER / EMAIL_PASS) — emails are only printed in the API console");
  }
};
