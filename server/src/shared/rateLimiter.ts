import type { Request } from "express";
import rateLimit, { ipKeyGenerator, Options } from "express-rate-limit";
import { RedisStore, RedisReply } from "rate-limit-redis";
import config from "../config";
import { getRedis } from "../config/redis.config";

/**
 * Redis store (audit #20): counters are shared across multiple api instances.
 * With a memory store each instance counts separately → the limit doesn't work.
 */
const store = (prefix: string): Options["store"] | undefined =>
  config.isTest
    ? undefined
    : new RedisStore({
        prefix: `rl:${prefix}:`,
        sendCommand: (command: string, ...args: string[]) => getRedis().call(command, ...args) as Promise<RedisReply>,
      });

/** IPv6 addresses are grouped by /56 so one client can't rotate through its whole IPv6 range. */
const byIp = (req: Request) => ipKeyGenerator(req.ip ?? "unknown");

const make = (
  prefix: string,
  windowMs: number,
  limit: number,
  message: string,
  extra: Partial<Pick<Options, "keyGenerator" | "skip">> = {},
) =>
  rateLimit({
    windowMs,
    limit,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    store: store(prefix),
    message: { success: false, message },
    keyGenerator: extra.keyGenerator ?? byIp,
    skip: (req, res) => config.isTest || (extra.skip ? extra.skip(req, res) : false),
  });

/** All of /api/v1 per IP — generous enough for normal browsing, blocks scrapers / floods. */
export const apiLimiter = make("api", 60_000, 300, "Too many requests, please try again later");

/** Login / register per IP. */
export const authLimiter = make("auth", 15 * 60_000, 20, "Too many auth attempts, please try again later");

/**
 * /auth/refresh per session, not per IP. The website's Next.js server refreshes sessions for many
 * users from one IP, so an IP limit would block normal use. The refresh token is `<sessionId>.<secret>`,
 * so the session id is the key; requests without a cookie fall back to the IP.
 * Normal use is ~4 refreshes per hour per session (15 min access token); 60 per 15 min is plenty.
 */
export const refreshLimiter = make("refresh", 15 * 60_000, 60, "Too many session refreshes, please try again later", {
  keyGenerator: (req) => {
    const raw = req.cookies?.rt;
    const sessionId = typeof raw === "string" ? raw.split(".")[0] : "";
    return /^[a-f0-9]{24}$/.test(sessionId) ? `sid:${sessionId}` : byIp(req);
  },
});

/** OTP send / verify per IP — strict to prevent brute force. */
export const otpLimiter = make("otp", 15 * 60_000, 5, "Too many code requests, please try again later");

/**
 * OTP per target email — stops brute-forcing ONE account's code from many IPs.
 * Use after `validateRequest` so `req.body.email` is already normalised.
 */
export const otpPerEmailLimiter = make("otp-email", 15 * 60_000, 8, "Too many attempts for this email, please try again later", {
  keyGenerator: (req) => `email:${String(req.body?.email ?? "").toLowerCase()}`,
});

/** Presign — prevents storage abuse. */
export const uploadLimiter = make("upload", 15 * 60_000, 120, "Too many uploads, please slow down");

/** Chat message send. */
export const messageLimiter = make("msg", 60_000, 60, "You're sending messages too fast");

/**
 * Write requests per authenticated account (mount AFTER userAuth / adminAuth).
 * Keyed by account id so users behind one office NAT don't share a budget,
 * and one user can't dodge the limit by switching IPs. GET requests are not counted.
 */
export const accountWriteLimiter = make("write", 60_000, 60, "Too many changes, please slow down", {
  keyGenerator: (req) => (req.user ? `u:${req.user.id}` : req.admin ? `a:${req.admin.id}` : byIp(req)),
  skip: (req) => req.method === "GET" || req.method === "HEAD",
});
