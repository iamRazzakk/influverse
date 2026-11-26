import { createHash, randomBytes, timingSafeEqual } from "crypto";

/** URL-safe random token (refresh token, invite / reset link) */
export const randomToken = (bytes = 48): string => randomBytes(bytes).toString("base64url");

/** Store only the hash of tokens / OTPs in the DB — a DB leak doesn't make the tokens usable */
export const sha256 = (value: string): string => createHash("sha256").update(value).digest("hex");

export const safeEqual = (a: string, b: string): boolean => {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
};

export default randomToken;
