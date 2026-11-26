import { errorLogger, logger } from "./logger";

type Task = { name: string; run: () => Promise<unknown> | unknown };

const tasks: Task[] = [];
let shuttingDown = false;

/** What to close on shutdown — runs in REVERSE registration order (last opened, first closed). */
export const onShutdown = (name: string, run: Task["run"]) => {
  tasks.push({ name, run });
};

export const shutdown = async (reason: string, exitCode = 0) => {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info(`Shutting down (${reason})...`);

  // Force exit if not done within 10s (hung connection)
  const timer = setTimeout(() => {
    errorLogger.error("Graceful shutdown timed out, forcing exit");
    process.exit(1);
  }, 10_000);
  timer.unref();

  for (const task of [...tasks].reverse()) {
    try {
      await task.run();
      logger.info(`  ✔ ${task.name} closed`);
    } catch (error: any) {
      errorLogger.error(`  ✘ ${task.name} close failed: ${error?.message}`);
    }
  }
  process.exit(exitCode);
};

/** Install SIGTERM / SIGINT / crash handlers in one go */
export const installProcessHandlers = () => {
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("uncaughtException", (error) => {
    errorLogger.error(`uncaughtException: ${error.message}`, { stack: error.stack });
    void shutdown("uncaughtException", 1);
  });
  process.on("unhandledRejection", (reason: any) => {
    errorLogger.error(`unhandledRejection: ${reason?.message ?? reason}`, { stack: reason?.stack });
    void shutdown("unhandledRejection", 1);
  });
};
