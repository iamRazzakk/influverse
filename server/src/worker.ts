/**
 * Standalone worker process (optional): all BullMQ processors + repeatable jobs.
 * By default the API (`npm run dev` / `npm start`) already runs them in-process (RUN_WORKER_IN_API=true).
 * For heavy traffic set RUN_WORKER_IN_API=false and run this separately: `npm run dev:worker` / `npm run start:worker`.
 */
import { connectDB, disconnectDB } from "./config/database";
import { closeRedis } from "./config/redis.config";
import { closeQueues } from "./queues";
import { startWorkers } from "./jobs/startWorkers";
import { errorLogger } from "./shared/logger";
import { installProcessHandlers, onShutdown, shutdown } from "./shared/shutdown";

installProcessHandlers();

async function main() {
  await connectDB();
  onShutdown("mongodb", disconnectDB);
  onShutdown("redis", closeRedis);
  // Close the producer connection used when processors enqueue to other queues
  onShutdown("queues", closeQueues);
  await startWorkers();
}

main().catch((error) => {
  errorLogger.error(`Worker startup failed: ${error?.message}`, { stack: error?.stack });
  void shutdown("startup failure", 1);
});
