import { createHmac } from "crypto";
import { createWriteStream, promises as fs } from "fs";
import path from "path";
import { pipeline } from "stream/promises";
import { Transform, type Readable } from "stream";
import config from "../config";
import { safeEqual } from "../utils/crypto";

/**
 * Default file storage: files are written to `server/uploads/<key>` and served by this API.
 * Used whenever S3 is not configured (no S3_* env); setting S3_* later switches new uploads to S3.
 *
 * It mimics S3 presigned URLs so the frontend code is the same for both:
 * the client PUTs the file to a short-lived signed URL, private files are read through a signed GET URL.
 *
 * Note: with more than one API server, all of them must share the same `uploads` folder
 * (e.g. a mounted volume), otherwise a file saved on one server is missing on the other.
 */
export const LOCAL_BUCKET = "local";
export const LOCAL_ROOT = path.resolve(process.cwd(), "uploads");

const apiBase = () => config.urls.api.replace(/\/$/, "");

// Signing key derived from an existing secret, so no extra env var is needed.
const sign = (value: string) =>
  createHmac("sha256", `local-storage:${config.jwt.resetSecret}`).update(value).digest("hex");

const signedQuery = (action: "put" | "get", fileId: string, ttlSec: number) => {
  const exp = Math.floor(Date.now() / 1000) + ttlSec;
  return `exp=${exp}&sig=${sign(`${action}:${fileId}:${exp}`)}`;
};

/** True when `sig` is valid for this action + file and `exp` has not passed. */
export const verifyLocalSignature = (action: "put" | "get", fileId: string, exp: unknown, sig: unknown) => {
  const expNum = Number(exp);
  if (!Number.isFinite(expNum) || expNum < Date.now() / 1000 || typeof sig !== "string") return false;
  return safeEqual(sign(`${action}:${fileId}:${expNum}`), sig);
};

/** Resolves a storage key to a path inside LOCAL_ROOT (refuses `..` tricks). */
const fullPath = (key: string) => {
  const resolved = path.resolve(LOCAL_ROOT, key);
  if (!resolved.startsWith(LOCAL_ROOT + path.sep)) throw new Error("Invalid storage key");
  return resolved;
};

export const LocalStorage = {
  uploadUrl: (fileId: string, ttlSec: number) => `${apiBase()}/api/v1/uploads/${fileId}/local?${signedQuery("put", fileId, ttlSec)}`,

  /** Public files are served statically from `/static/<key>` (key always starts with `public/`). */
  publicUrl: (key: string) => `${apiBase()}/static/${key.split("/").map(encodeURIComponent).join("/")}`,

  signedGetUrl: (fileId: string, ttlSec: number) => `${apiBase()}/api/v1/files/${fileId}/local?${signedQuery("get", fileId, ttlSec)}`,

  fullPath,

  /**
   * Streams the request body to disk. Stops as soon as more than `maxBytes` arrive.
   * Returns the number of bytes written; the caller compares it with the declared size.
   */
  write: async (key: string, body: Readable, maxBytes: number) => {
    const target = fullPath(key);
    await fs.mkdir(path.dirname(target), { recursive: true });
    let written = 0;
    const limiter = new Transform({
      transform(chunk: Buffer, _encoding, callback) {
        written += chunk.length;
        if (written > maxBytes) return callback(new Error("File is larger than declared"));
        callback(null, chunk);
      },
    });
    try {
      await pipeline(body, limiter, createWriteStream(target));
    } catch (error) {
      await fs.rm(target, { force: true });
      throw error;
    }
    return written;
  },

  size: async (key: string) => (await fs.stat(fullPath(key))).size,

  remove: (key: string) => fs.rm(fullPath(key), { force: true }),
};
