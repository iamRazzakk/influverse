import { z } from "zod";
import { isObjectId } from "./db";

/** Common Zod pieces shared by all modules — rules in one place (D11: password min 8) */
export const zEmail = z.string().trim().toLowerCase().email("Invalid email address").max(254);
export const zPassword = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .max(128, "Password is too long");
export const zObjectId = z.string().refine(isObjectId, "Invalid id");
export const zName = z.string().trim().min(1, "Name is required").max(100);
export const zPhone = z
  .string()
  .trim()
  .regex(/^\+?[1-9]\d{6,14}$/, "Invalid phone number");
export const zUrl = z.string().trim().url().max(2048);
export const zCountry = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z]{2}$/, "Use ISO-2 country code");

/** `?page&limit` — limit cap 100 */
export const zPagination = {
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
};

/** `?flag=true|false` query string → boolean */
export const zQueryBool = z.enum(["true", "false"]).transform((v) => v === "true");

export const zIdParam = z.object({ params: z.object({ id: zObjectId }) });
