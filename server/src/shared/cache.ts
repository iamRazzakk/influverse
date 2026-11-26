import { getRedis } from "../config/redis.config";
import { getQueue, QUEUES } from "../queues";
import { errorLogger } from "./logger";

/**
 * Redis read-through cache + tag based invalidation.
 *
 * - `cache.wrap(key, ttl, loader, tags)` — return cached value if present, else run loader → cache.
 * - On data change, `cache.invalidate(tags)` — deletes all keys for those tags + (optionally) revalidates the website.
 * - If Redis is down, the cache is **bypassed** and the loader runs — cache is never a single point of failure.
 * - Many concurrent requests for the same key (stampede) → share one loader promise (single-flight, per process).
 *
 * Key / tag naming: `cms:faqs:brands`, tag `cms`, `creator:<id>`, `settings:platform`.
 */
const KEY = (k: string) => `c:${k}`;
const TAG = (t: string) => `ct:${t}`;

const inflight = new Map<string, Promise<unknown>>();

const get = async <T>(key: string): Promise<T | undefined> => {
  try {
    const raw = await getRedis().get(KEY(key));
    return raw === null ? undefined : (JSON.parse(raw) as T);
  } catch (error: any) {
    errorLogger.error(`cache.get(${key}) failed: ${error.message}`);
    return undefined;
  }
};

const set = async (key: string, value: unknown, ttlSec: number, tags: string[] = []) => {
  try {
    const pipe = getRedis().multi().set(KEY(key), JSON.stringify(value), "EX", ttlSec);
    for (const tag of tags) {
      pipe.sadd(TAG(tag), KEY(key));
      // Tag set must not outlive its keys
      pipe.expire(TAG(tag), ttlSec * 2);
    }
    await pipe.exec();
  } catch (error: any) {
    errorLogger.error(`cache.set(${key}) failed: ${error.message}`);
  }
};

const wrap = async <T>(
  key: string,
  ttlSec: number,
  loader: () => Promise<T>,
  tags: string[] = [],
): Promise<T> => {
  const hit = await get<T>(key);
  if (hit !== undefined) return hit;

  const pending = inflight.get(key) as Promise<T> | undefined;
  if (pending) return pending;

  const promise = (async () => {
    try {
      const value = await loader();
      // Don't cache null / undefined (so a resource created after a 404 shows up immediately)
      if (value !== undefined && value !== null) await set(key, value, ttlSec, tags);
      return value;
    } finally {
      inflight.delete(key);
    }
  })();
  inflight.set(key, promise);
  return promise;
};

const del = async (...keys: string[]) => {
  if (!keys.length) return;
  try {
    await getRedis().del(...keys.map(KEY));
  } catch (error: any) {
    errorLogger.error(`cache.del failed: ${error.message}`);
  }
};

type InvalidateOptions = {
  /** Tags for the website's (Next.js) `revalidateTag()` — refreshes the public page cache too */
  websiteTags?: string[];
};

const invalidate = async (tags: string[], options: InvalidateOptions = {}) => {
  try {
    const redis = getRedis();
    for (const tag of tags) {
      const keys = await redis.smembers(TAG(tag));
      if (keys.length) await redis.del(...keys);
      await redis.del(TAG(tag));
    }
  } catch (error: any) {
    errorLogger.error(`cache.invalidate(${tags.join(",")}) failed: ${error.message}`);
  }

  if (options.websiteTags?.length) {
    // Done in the worker with retries — doesn't block the API response
    await getQueue(QUEUES.revalidate)
      .add("website", { tags: options.websiteTags })
      .catch((error) => errorLogger.error(`revalidate enqueue failed: ${error.message}`));
  }
};

export const cache = { get, set, wrap, del, invalidate };

/** TTL (second) — docs/00-final-plan.md §3.7 */
export const TTL = {
  cms: 10 * 60,
  settings: 10 * 60,
  creatorPublic: 5 * 60,
  creatorSearch: 60,
  adminCounts: 60,
  session: 15 * 60,
} as const;
