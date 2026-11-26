import type { FileContext } from "./file.model";

const MB = 1024 * 1024;
const IMAGE = ["image/jpeg", "image/png", "image/webp", "image/gif", "image/avif"];
const VIDEO = ["video/mp4", "video/quicktime", "video/webm"];
const AUDIO = ["audio/mpeg", "audio/wav", "audio/mp4", "audio/aac"];
const DOCS = [
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "text/plain",
  "text/csv",
];
const ARCHIVE = ["application/zip", "application/x-zip-compressed"];

type Rule = {
  mimes: string[];
  maxBytes: number;
  visibility: "public" | "private";
  /** Who is allowed to upload */
  owners: ("user" | "admin")[];
};

/**
 * Per-context rules — the mime / size the client declares is signed into the presigned URL,
 * so uploading a different size / type to S3 fails the signature. Re-checked via HeadObject on complete.
 */
export const UPLOAD_RULES: Record<Exclude<FileContext, "invoice_pdf" | "export">, Rule> = {
  avatar: { mimes: IMAGE, maxBytes: 10 * MB, visibility: "public", owners: ["user", "admin"] },
  brand_logo: { mimes: IMAGE, maxBytes: 8 * MB, visibility: "public", owners: ["user"] },
  cover: { mimes: IMAGE, maxBytes: 15 * MB, visibility: "public", owners: ["user"] },
  gallery: { mimes: IMAGE, maxBytes: 20 * MB, visibility: "public", owners: ["user"] },
  portfolio: { mimes: [...IMAGE, ...VIDEO], maxBytes: 300 * MB, visibility: "public", owners: ["user"] },
  verification_sample: { mimes: [...IMAGE, ...VIDEO, "application/pdf"], maxBytes: 100 * MB, visibility: "private", owners: ["user"] },
  deliverable: { mimes: [...IMAGE, ...VIDEO, ...AUDIO, ...DOCS, ...ARCHIVE], maxBytes: 2048 * MB, visibility: "private", owners: ["user"] },
  chat_attachment: { mimes: [...IMAGE, ...VIDEO, ...AUDIO, ...DOCS, ...ARCHIVE], maxBytes: 100 * MB, visibility: "private", owners: ["user", "admin"] },
  order_attachment: { mimes: [...IMAGE, ...VIDEO, ...DOCS, ...ARCHIVE], maxBytes: 100 * MB, visibility: "private", owners: ["user"] },
  ticket_attachment: { mimes: [...IMAGE, ...VIDEO, ...DOCS], maxBytes: 50 * MB, visibility: "private", owners: ["user", "admin"] },
  cms_asset: { mimes: [...IMAGE, "image/svg+xml", "image/x-icon", "image/vnd.microsoft.icon"], maxBytes: 5 * MB, visibility: "public", owners: ["admin"] },
};

export const UPLOADABLE_CONTEXTS = Object.keys(UPLOAD_RULES) as (keyof typeof UPLOAD_RULES)[];

export const PRESIGN_PUT_TTL_SEC = 15 * 60;
export const PRESIGN_GET_TTL_SEC = 10 * 60;
