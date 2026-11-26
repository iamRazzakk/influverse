import express, { NextFunction, Request, Response } from "express";
import path from "path";
import { LOCAL_ROOT } from "./shared/localStorage";
import cors, { CorsOptions } from "cors";
import { corsOriginCallback } from "./shared/corsOrigin";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import mongoose from "mongoose";
import { StatusCodes } from "http-status-codes";
import config from "./config";
import { Morgan } from "./shared/morgan";
import globalErrorHandler from "./app/middlewares/globalErrorHandler";
import requestId from "./app/middlewares/requestId";
import sanitizeInput from "./app/middlewares/sanitizeInput";
import { apiLimiter } from "./shared/rateLimiter";
import router from "./app/routes";
import handleStripeWebhook from "./integrations/stripeWebhook";
import { pingRedis } from "./config/redis.config";

const app = express();

app.disable("x-powered-by");

// Behind a reverse proxy (nginx / load balancer): use the real client IP (needed for rate limiting)
app.set("trust proxy", 1);

app.use(requestId);
app.use(Morgan.successHandler);
app.use(Morgan.errorHandler);
app.use(helmet());

/** Only whitelisted origins may call with cookies (audit #10). Requests without an Origin (curl, server-to-server) are allowed. */
export const corsOptions: CorsOptions = {
  origin: corsOriginCallback,
  credentials: true,
  exposedHeaders: ["x-request-id"],
};
app.use(cors(corsOptions));

// Stripe signature check needs the raw body — must be mounted BEFORE the JSON parser (audit #4)
app.post(
  "/api/v1/webhooks/stripe",
  express.raw({ type: "application/json", limit: "1mb" }),
  handleStripeWebhook,
);

app.use(cookieParser());
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true, limit: "1mb" }));
app.use(sanitizeInput);

/** Root — a friendly response when someone opens the server URL in a browser. All APIs live under /api/v1. */
app.get("/", (_req: Request, res: Response) => {
  res.status(StatusCodes.OK).json({
    success: true,
    message: "INFLUVERSE API is running",
    data: { api: "/api/v1", health: "/health", ready: "/health/ready" },
  });
});

/** Liveness — is the process alive (Docker HEALTHCHECK) */
app.get("/health", (_req: Request, res: Response) => {
  res.status(StatusCodes.OK).json({ status: "ok", uptime: Math.round(process.uptime()) });
});

/** Readiness — are Mongo + Redis connected (load balancer) */
app.get("/health/ready", async (_req: Request, res: Response) => {
  const mongo = mongoose.connection.readyState === 1;
  const redis = await pingRedis();
  const ok = mongo && redis;
  res
    .status(ok ? StatusCodes.OK : StatusCodes.SERVICE_UNAVAILABLE)
    .json({ status: ok ? "ok" : "degraded", mongo, redis });
});

/**
 * Public uploaded files (images, videos) stored on this server's disk. Only the `public/` folder is exposed;
 * private files go through signed `/api/v1/files/:id/local` URLs.
 * Cross-Origin-Resource-Policy lets the website / dashboard (other ports) show these images.
 */
app.use(
  "/static/public",
  (_req: Request, res: Response, next: NextFunction) => {
    res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
    next();
  },
  express.static(path.join(LOCAL_ROOT, "public"), { fallthrough: false, maxAge: "7d", index: false }),
);

app.use("/api/v1", apiLimiter, router);

// 404 — must come before the error handler (it used to be after, so it was never reached)
app.use((req: Request, res: Response) => {
  res.status(StatusCodes.NOT_FOUND).json({
    success: false,
    message: "Not Found",
    errorMessages: [{ path: req.originalUrl, message: "API doesn't exist" }],
  });
});

app.use(globalErrorHandler);

export default app;
