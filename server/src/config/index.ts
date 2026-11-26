import dotenv from "dotenv";
import path from "path";
import { z } from "zod";

dotenv.config({ path: path.join(process.cwd(), ".env") });

/**
 * Env schema (docs/00-final-plan.md §11.1).
 * Missing required vars fail at process start — no undefined bugs at runtime.
 * Optional groups (Stripe / S3 / Email) may be absent in dev; they are checked when used.
 */
const csv = z
  .string()
  .default("")
  .transform((v) =>
    v
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  );

const bool = z
  .enum(["true", "false"])
  .default("false")
  .transform((v) => v === "true");

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.coerce.number().int().positive().default(9990),
  /** 0.0.0.0 = listen on every interface, so both http://localhost:PORT and http://<LAN-IP>:PORT work */
  IP: z.string().default("0.0.0.0"),
  /** true (default): the API process also runs the background jobs (emails etc.). false: run worker.ts separately. */
  RUN_WORKER_IN_API: z.enum(["true", "false"]).default("true").transform((v) => v === "true"),
  API_URL: z.string().url().default("http://localhost:9990"),
  WEBSITE_URL: z.string().url().default("http://localhost:3000"),
  DASHBOARD_URL: z.string().url().default("http://localhost:5173"),
  CORS_ORIGINS: csv,
  /** Next.js on-demand revalidation (`POST {WEBSITE_URL}/api/revalidate`) — skipped if not set */
  WEBSITE_REVALIDATE_SECRET: z.string().min(16).optional(),

  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  REDIS_URL: z.string().min(1).default("redis://localhost:6379"),

  JWT_USER_SECRET: z.string().min(32, "JWT_USER_SECRET must be at least 32 chars"),
  JWT_ADMIN_SECRET: z.string().min(32, "JWT_ADMIN_SECRET must be at least 32 chars"),
  JWT_RESET_SECRET: z.string().min(32, "JWT_RESET_SECRET must be at least 32 chars"),
  JWT_ISSUER: z.string().default("influverse"),
  ACCESS_TOKEN_TTL: z.string().default("15m"),
  REFRESH_TTL_DAYS: z.coerce.number().int().positive().default(30),
  REFRESH_TTL_SHORT_DAYS: z.coerce.number().int().positive().default(1),
  BCRYPT_SALT_ROUNDS: z.coerce.number().int().min(10).max(15).default(12),
  COOKIE_DOMAIN: z.string().optional(),
  COOKIE_SECURE: bool,
  /** Use `none` when the API and website are on different sites (domains) (+ COOKIE_SECURE=true) */
  COOKIE_SAME_SITE: z.enum(["lax", "strict", "none"]).default("lax"),

  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
  /** Production: the Connect ("connected accounts") webhook endpoint has its own secret. Stripe CLI uses one secret for both. */
  STRIPE_CONNECT_WEBHOOK_SECRET: z.string().optional(),
  STRIPE_CONNECT_RETURN_URL: z.string().optional(),
  STRIPE_CONNECT_REFRESH_URL: z.string().optional(),

  S3_ENDPOINT: z.string().optional(),
  S3_REGION: z.string().default("auto"),
  S3_BUCKET_PUBLIC: z.string().optional(),
  S3_BUCKET_PRIVATE: z.string().optional(),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),
  S3_PUBLIC_BASE_URL: z.string().optional(),


  EMAIL_HOST: z.string().optional(),
  EMAIL_PORT: z.coerce.number().int().positive().default(587),
  EMAIL_USER: z.string().optional(),
  EMAIL_PASS: z.string().optional(),
  EMAIL_FROM: z.string().default("INFLUVERSE <no-reply@influverse.local>"),

  SUPER_ADMIN_EMAIL: z.string().email().optional(),
  SUPER_ADMIN_PASSWORD: z.string().min(8).optional(),

  LOG_LEVEL: z.string().optional(),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const issues = parsed.error.issues
    .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
    .join("\n");
  // Importing the logger would be circular (logger reads config) — so use console.
  // Only variable NAMES are printed, never values.
  console.error(`\n❌ Invalid environment variables:\n${issues}\n`);
  process.exit(1);
}

const env = parsed.data;

const config = {
  env: env.NODE_ENV,
  isProd: env.NODE_ENV === "production",
  isTest: env.NODE_ENV === "test",
  port: env.PORT,
  ip: env.IP,
  runWorkerInApi: env.RUN_WORKER_IN_API,
  urls: {
    api: env.API_URL,
    website: env.WEBSITE_URL,
    dashboard: env.DASHBOARD_URL,
  },
  websiteRevalidateSecret: env.WEBSITE_REVALIDATE_SECRET,
  /** CORS + socket.io whitelist. Defaults to website + dashboard URLs if CORS_ORIGINS is not set. */
  corsOrigins: env.CORS_ORIGINS.length
    ? env.CORS_ORIGINS
    : [env.WEBSITE_URL, env.DASHBOARD_URL],

  databaseUrl: env.DATABASE_URL,
  redisUrl: env.REDIS_URL,

  jwt: {
    userSecret: env.JWT_USER_SECRET,
    adminSecret: env.JWT_ADMIN_SECRET,
    resetSecret: env.JWT_RESET_SECRET,
    issuer: env.JWT_ISSUER,
    accessTtl: env.ACCESS_TOKEN_TTL,
    refreshTtlDays: env.REFRESH_TTL_DAYS,
    refreshTtlShortDays: env.REFRESH_TTL_SHORT_DAYS,
  },
  bcryptSaltRounds: env.BCRYPT_SALT_ROUNDS,
  cookie: {
    domain: env.COOKIE_DOMAIN,
    secure: env.COOKIE_SECURE,
    sameSite: env.COOKIE_SAME_SITE,
  },

  stripe: {
    secretKey: env.STRIPE_SECRET_KEY,
    webhookSecret: env.STRIPE_WEBHOOK_SECRET,
    connectWebhookSecret: env.STRIPE_CONNECT_WEBHOOK_SECRET,
    connectReturnUrl: env.STRIPE_CONNECT_RETURN_URL,
    connectRefreshUrl: env.STRIPE_CONNECT_REFRESH_URL,
  },

  s3: {
    endpoint: env.S3_ENDPOINT,
    region: env.S3_REGION,
    bucketPublic: env.S3_BUCKET_PUBLIC,
    bucketPrivate: env.S3_BUCKET_PRIVATE,
    accessKeyId: env.S3_ACCESS_KEY_ID,
    secretAccessKey: env.S3_SECRET_ACCESS_KEY,
    publicBaseUrl: env.S3_PUBLIC_BASE_URL,
  },

  email: {
    host: env.EMAIL_HOST,
    port: env.EMAIL_PORT,
    user: env.EMAIL_USER,
    pass: env.EMAIL_PASS,
    from: env.EMAIL_FROM,
  },

  superAdmin: {
    email: env.SUPER_ADMIN_EMAIL,
    password: env.SUPER_ADMIN_PASSWORD,
  },

  logLevel: env.LOG_LEVEL,
} as const;

export type AppConfig = typeof config;
export default config;
