import config from "../config";

/**
 * Development only: also allow the website / dashboard when opened from localhost or a private LAN IP
 * (e.g. http://10.10.26.159:5173), so testing from other devices on the network works without editing CORS_ORIGINS.
 * Production allows only the CORS_ORIGINS whitelist.
 */
const DEV_LAN_ORIGIN = /^https?:\/\/(localhost|127\.0\.0\.1|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+)(:\d+)?$/;

export const isAllowedOrigin = (origin: string) =>
  config.corsOrigins.includes(origin) || (!config.isProd && DEV_LAN_ORIGIN.test(origin));

/** Same rule in the callback shape that `cors` and socket.io expect. Requests without an Origin (curl, server-to-server) pass. */
export const corsOriginCallback = (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) =>
  callback(null, !origin || isAllowedOrigin(origin));
