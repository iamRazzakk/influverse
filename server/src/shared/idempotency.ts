import { createHash } from "crypto";
import { NextFunction, Request, Response } from "express";
import { StatusCodes } from "http-status-codes";
import { getRedis } from "../config/redis.config";
import { errorLogger } from "./logger";

/**
 * `Idempotency-Key` support for POST endpoints (same idea as Stripe's API).
 *
 * A network retry or a double click must not create two orders / two payments. The client sends a
 * random key per logical action; the first request runs, later requests with the same key get the
 * stored response instead of running again.
 *
 * - Same key + same body while the first is still running → 409 (client should retry shortly).
 * - Same key + different body → 422 (key reuse bug on the client).
 * - 5xx responses are NOT stored, so the client can safely retry.
 * - Keys are scoped per caller (user / admin / IP) and expire after 24 h.
 */

const HEADER = "idempotency-key";
const KEY_PATTERN = /^[A-Za-z0-9_-]{8,128}$/;
const TTL_SEC = 24 * 3600;
const IN_FLIGHT_TTL_SEC = 60;

type StoredEntry =
  | { state: "processing"; bodyHash: string }
  | { state: "done"; bodyHash: string; status: number; body: unknown };

type Options = {
  /** Reject requests without the header (use for payments / orders). */
  required?: boolean;
  /**
   * If Redis is unavailable: `true` = reject with 503 (money endpoints), `false` = run without protection.
   */
  failClosed?: boolean;
};

const callerScope = (req: Request) =>
  req.user ? `u:${req.user.id}` : req.admin ? `a:${req.admin.id}` : `ip:${req.ip}`;

const hashBody = (body: unknown) => createHash("sha256").update(JSON.stringify(body ?? {})).digest("hex");

export const idempotent =
  (options: Options = {}) =>
  async (req: Request, res: Response, next: NextFunction) => {
    const clientKey = req.header(HEADER);
    if (!clientKey) {
      if (options.required) {
        return res.status(StatusCodes.BAD_REQUEST).json({ success: false, message: "Idempotency-Key header is required" });
      }
      return next();
    }
    if (!KEY_PATTERN.test(clientKey)) {
      return res.status(StatusCodes.BAD_REQUEST).json({ success: false, message: "Invalid Idempotency-Key" });
    }

    const redisKey = `idem:${callerScope(req)}:${req.method}:${req.baseUrl}${req.path}:${clientKey}`;
    const bodyHash = hashBody(req.body);
    const redis = getRedis();

    try {
      // SET NX = only the first request claims the key.
      const claimed = await redis.set(redisKey, JSON.stringify({ state: "processing", bodyHash }), "EX", IN_FLIGHT_TTL_SEC, "NX");
      if (!claimed) {
        const existing = JSON.parse((await redis.get(redisKey)) ?? "null") as StoredEntry | null;
        if (existing && existing.bodyHash !== bodyHash) {
          return res
            .status(StatusCodes.UNPROCESSABLE_ENTITY)
            .json({ success: false, message: "Idempotency-Key was already used with a different request" });
        }
        if (existing?.state === "done") {
          res.setHeader("Idempotent-Replayed", "true");
          return res.status(existing.status).json(existing.body);
        }
        return res.status(StatusCodes.CONFLICT).json({ success: false, message: "The same request is already being processed" });
      }
    } catch (error: any) {
      errorLogger.error(`Idempotency check failed: ${error.message}`);
      if (options.failClosed) {
        return res.status(StatusCodes.SERVICE_UNAVAILABLE).json({ success: false, message: "Please try again in a moment" });
      }
      return next();
    }

    // Capture the JSON body so it can be replayed.
    const originalJson = res.json.bind(res);
    let responseBody: unknown;
    res.json = (body: unknown) => {
      responseBody = body;
      return originalJson(body);
    };

    res.on("finish", () => {
      const store =
        res.statusCode >= 500
          ? redis.del(redisKey) // server error → allow a clean retry
          : redis.set(
              redisKey,
              JSON.stringify({ state: "done", bodyHash, status: res.statusCode, body: responseBody } satisfies StoredEntry),
              "EX",
              TTL_SEC,
            );
      store.catch((error) => errorLogger.error(`Idempotency store failed: ${error.message}`));
    });

    next();
  };
