import { NextFunction, Request, Response } from "express";

/**
 * NoSQL operator injection guard (audit #15).
 * Strips keys that start with `$` or contain `.` from client input — so `?role[$ne]=x`, `{ "email": { "$gt": "" } }` won't work.
 *
 * Why not `mongoose.set('sanitizeFilter', true)`: it also wraps our own code's filters like `{ status: { $in: [...] } }`
 * in `$eq`, silently breaking them. Cleaning at the input level is safer and predictable.
 */
const isUnsafeKey = (key: string) => key.startsWith("$") || key.includes(".");

const clean = (value: unknown, depth = 0): unknown => {
  if (depth > 20 || value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map((v) => clean(v, depth + 1));
  // Buffer / Date etc. are not plain objects — leave them as-is
  if (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) {
    return value;
  }
  const out: Record<string, unknown> = {};
  for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
    if (isUnsafeKey(key) || key === "__proto__" || key === "constructor" || key === "prototype") continue;
    out[key] = clean(v, depth + 1);
  }
  return out;
};

const sanitizeInput = (req: Request, _res: Response, next: NextFunction) => {
  if (req.body && typeof req.body === "object" && !Buffer.isBuffer(req.body)) {
    req.body = clean(req.body);
  }
  if (req.query) req.query = clean(req.query) as Request["query"];
  if (req.params) req.params = clean(req.params) as Request["params"];
  next();
};

export default sanitizeInput;
