import Redis, { RedisOptions } from "ioredis";
import config from ".";
import { errorLogger, logger } from "../shared/logger";

/**
 * All Redis connections come from a single `REDIS_URL`.
 * - App cache / rate limit / socket adapter → `getRedis()` (shared singleton)
 * - BullMQ Workers run blocking commands, so workers get their own connection (`createRedisConnection`)
 * `maxRetriesPerRequest: null` is required by BullMQ.
 */
export const createRedisConnection = (
  name: string,
  options: RedisOptions = {},
): Redis => {
  const client = new Redis(config.redisUrl, {
    connectionName: `influverse:${name}`,
    maxRetriesPerRequest: null,
    enableReadyCheck: true,
    retryStrategy: (times) => Math.min(times * 200, 5000),
    ...options,
  });

  client.on("ready", () => logger.info(`Redis [${name}] ready`));
  client.on("error", (error) =>
    errorLogger.error(`Redis [${name}] error: ${error.message}`),
  );
  client.on("reconnecting", () => logger.warn(`Redis [${name}] reconnecting`));

  return client;
};

let shared: Redis | null = null;

/** Lazy shared connection — importing doesn't connect (convenient for tests / scripts). */
export const getRedis = (): Redis => {
  if (!shared) shared = createRedisConnection("app");
  return shared;
};

export const pingRedis = async (): Promise<boolean> => {
  try {
    return (await getRedis().ping()) === "PONG";
  } catch {
    return false;
  }
};

export const closeRedis = async (): Promise<void> => {
  if (shared) {
    await shared.quit().catch(() => shared?.disconnect());
    shared = null;
  }
};
