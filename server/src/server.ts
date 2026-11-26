/**
 * API process: Express (REST + Stripe webhook) + Socket.io.
 * Background jobs (emails, cleanup, revalidate, outbox) also start here when RUN_WORKER_IN_API=true (default),
 * so one `npm run dev` / `npm start` runs everything. Set it to false to run `worker.ts` as its own process.
 */
import http from "http";
import config from "./config";
import app from "./app";
import { connectDB, disconnectDB } from "./config/database";
import { closeRedis, pingRedis } from "./config/redis.config";
import { closeQueues } from "./queues";
import { closeSocket, initSocket } from "./socket";
import { startWorkers } from "./jobs/startWorkers";
import { errorLogger, logger } from "./shared/logger";
import { installProcessHandlers, onShutdown, shutdown } from "./shared/shutdown";

installProcessHandlers();

async function main() {
  if (!(await pingRedis())) throw new Error("Redis connection failed");
  onShutdown("redis", closeRedis);
  onShutdown("queues", closeQueues);

  await connectDB();
  onShutdown("mongodb", disconnectDB);

  const server = http.createServer(app);
  initSocket(server);
  // io.close() also closes the http server
  onShutdown("http + socket", closeSocket);

  await new Promise<void>((resolve) => server.listen(config.port, config.ip, resolve));
  logger.info(`API listening on http://${config.ip}:${config.port} (${config.env})`);

  if (config.runWorkerInApi) await startWorkers();
  else logger.info("Background worker disabled here (RUN_WORKER_IN_API=false) — run `npm run start:worker` separately");
}

main().catch((error) => {
  errorLogger.error(`API startup failed: ${error?.message}`, { stack: error?.stack });
  void shutdown("startup failure", 1);
});
