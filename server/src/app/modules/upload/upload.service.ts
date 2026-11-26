import { DeleteObjectCommand, GetObjectCommand, HeadObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { ClientSession, Types } from "mongoose";
import { StatusCodes } from "http-status-codes";
import config from "../../../config";
import { getS3, isS3Configured } from "../../../config/s3";
import { LOCAL_BUCKET, LocalStorage } from "../../../shared/localStorage";
import ApiError from "../../../errors/ApiErrors";
import { errorLogger } from "../../../shared/logger";
import { File, FileContext } from "./file.model";
import { PRESIGN_GET_TTL_SEC, PRESIGN_PUT_TTL_SEC, UPLOAD_RULES } from "./upload.constant";

type Owner = { type: "user" | "admin"; id: string };

const safeName = (name: string) =>
  name
    .normalize("NFKD")
    .replace(/[^\w.\-]+/g, "_")
    .replace(/_+/g, "_")
    .slice(-120) || "file";

/** No S3 env → files are stored on this server's disk in `uploads/` (see shared/localStorage.ts). */
const useLocalStorage = () => !isS3Configured();

const bucketFor = (visibility: "public" | "private") =>
  useLocalStorage() ? LOCAL_BUCKET : visibility === "public" ? config.s3.bucketPublic! : config.s3.bucketPrivate!;

export const publicUrl = (key: string) =>
  useLocalStorage()
    ? LocalStorage.publicUrl(key)
    : config.s3.publicBaseUrl
    ? `${config.s3.publicBaseUrl.replace(/\/$/, "")}/${key}`
    : `https://${config.s3.bucketPublic}.s3.${config.s3.region}.amazonaws.com/${key}`;

/** POST /uploads/presign → client PUTs directly to S3 (the file never passes through the API server) */
const presign = async (
  owner: Owner,
  input: { context: keyof typeof UPLOAD_RULES; fileName: string; mime: string; sizeBytes: number },
) => {
  const rule = UPLOAD_RULES[input.context];
  if (!rule || !rule.owners.includes(owner.type)) {
    throw new ApiError(StatusCodes.FORBIDDEN, "Upload not allowed for this context");
  }
  if (!rule.mimes.includes(input.mime)) throw new ApiError(StatusCodes.UNSUPPORTED_MEDIA_TYPE, "File type not allowed");
  if (input.sizeBytes > rule.maxBytes) {
    throw new ApiError(StatusCodes.REQUEST_TOO_LONG, `File too large (max ${Math.round(rule.maxBytes / 1024 / 1024)} MB)`);
  }

  const fileId = new Types.ObjectId();
  const key = `${rule.visibility}/${input.context}/${owner.id}/${fileId}-${safeName(input.fileName)}`;
  const bucket = bucketFor(rule.visibility);

  await File.create({
    _id: fileId,
    ownerType: owner.type,
    ownerId: owner.id,
    context: input.context,
    key,
    bucket,
    originalName: input.fileName.slice(0, 255),
    mime: input.mime,
    sizeBytes: input.sizeBytes,
    visibility: rule.visibility,
    status: "pending",
  });

  // ContentType + ContentLength are signed → S3 rejects the upload if the client sends a different type / size.
  // Local storage checks the same two things in PUT /uploads/:id/local.
  const uploadUrl = useLocalStorage()
    ? LocalStorage.uploadUrl(String(fileId), PRESIGN_PUT_TTL_SEC)
    : await getSignedUrl(
        getS3(),
        new PutObjectCommand({ Bucket: bucket, Key: key, ContentType: input.mime, ContentLength: input.sizeBytes }),
        { expiresIn: PRESIGN_PUT_TTL_SEC },
      );

  return {
    fileId: String(fileId),
    uploadUrl,
    method: "PUT" as const,
    headers: { "Content-Type": input.mime },
    expiresIn: PRESIGN_PUT_TTL_SEC,
    publicUrl: rule.visibility === "public" ? publicUrl(key) : null,
  };
};

/** POST /uploads/:id/complete — verify the file really exists in S3 and the size matches */
const complete = async (owner: Owner, fileId: string, media: { width?: number; height?: number; durationSec?: number }) => {
  const file = await File.findOne({ _id: fileId, ownerType: owner.type, ownerId: owner.id }).lean();
  if (!file) throw new ApiError(StatusCodes.NOT_FOUND, "File not found");
  if (file.status === "ready") return toDto(file);
  if (file.status !== "pending") throw new ApiError(StatusCodes.CONFLICT, "File is not pending");

  try {
    const size =
      file.bucket === LOCAL_BUCKET
        ? await LocalStorage.size(file.key)
        : (await getS3().send(new HeadObjectCommand({ Bucket: file.bucket, Key: file.key }))).ContentLength;
    if (size !== file.sizeBytes) throw new Error("size mismatch");
  } catch {
    throw new ApiError(StatusCodes.BAD_REQUEST, "Upload not found or incomplete. Please upload again.");
  }

  // Only flip pending → ready (conditional update keeps a double "complete" call harmless).
  const mediaSet = Object.fromEntries(Object.entries(media).map(([key, value]) => [`media.${key}`, value]));
  const ready = await File.findOneAndUpdate(
    { _id: file._id, status: "pending" },
    { $set: { status: "ready", ...mediaSet } },
    { new: true },
  ).lean();
  return toDto(ready ?? file);
};

/** Response shape for an uploaded file. Private files have no direct URL (use GET /files/:id/url). */
const toDto = (file: { _id: unknown; context: string; originalName: string; mime: string; sizeBytes: number; visibility: string; key: string; media?: unknown }) => ({
  id: String(file._id),
  context: file.context,
  name: file.originalName,
  mime: file.mime,
  size: file.sizeBytes,
  visibility: file.visibility,
  url: file.visibility === "public" ? publicUrl(file.key) : null,
  media: file.media,
});

/**
 * Used by other modules (portfolio, deliverable, chat …) to validate client-sent fileIds and build FileRefs.
 * Only the caller's own, ready files in an allowed context. Private file `url` = `/files/:id/url` (needs a signed GET).
 */
const resolveOwnFiles = async (
  owner: Owner,
  fileIds: string[],
  contexts: FileContext[],
  attachTo?: { kind: string; id: string },
  session?: ClientSession,
) => {
  if (!fileIds.length) return [];
  const unique = [...new Set(fileIds)];
  const files = await File.find({
    _id: { $in: unique },
    ownerType: owner.type,
    ownerId: owner.id,
    status: "ready",
    context: { $in: contexts },
  })
    .select("originalName mime sizeBytes visibility key")
    .session(session ?? null)
    .lean();
  if (files.length !== unique.length) throw new ApiError(StatusCodes.BAD_REQUEST, "One or more files are invalid");

  if (attachTo) {
    // Inside the caller's transaction when a session is passed, so a rollback also un-attaches.
    await File.updateMany({ _id: { $in: unique } }, { $set: { attachedTo: attachTo } }, { session });
  }
  const byId = new Map(files.map((f) => [String(f._id), f]));
  return unique.map((id) => {
    const f = byId.get(id)!;
    return {
      fileId: f._id,
      url: f.visibility === "public" ? publicUrl(f.key) : `/files/${id}/url`,
      name: f.originalName,
      mime: f.mime,
      size: f.sizeBytes,
    };
  });
};

// ---------- private file access ----------

/** Modules register "who can access an entity of this kind" (order party, conversation participant …) */
type AccessResolver = (attachedId: string, viewer: Owner) => Promise<boolean>;
const accessResolvers = new Map<string, AccessResolver>();
export const registerFileAccess = (kind: string, resolver: AccessResolver) => accessResolvers.set(kind, resolver);

/** GET /files/:id/url — 10 min signed URL for a private file */
const signedUrl = async (viewer: Owner, fileId: string) => {
  const file = await File.findOne({ _id: fileId, status: "ready" }).lean();
  if (!file) throw new ApiError(StatusCodes.NOT_FOUND, "File not found");

  if (file.visibility === "public") return { url: publicUrl(file.key), expiresIn: null };

  let allowed = viewer.type === "admin" || (file.ownerType === viewer.type && String(file.ownerId) === viewer.id);
  if (!allowed && file.attachedTo?.kind && file.attachedTo.id) {
    const resolver = accessResolvers.get(file.attachedTo.kind);
    allowed = resolver ? await resolver(String(file.attachedTo.id), viewer) : false;
  }
  if (!allowed) throw new ApiError(StatusCodes.NOT_FOUND, "File not found");

  if (file.bucket === LOCAL_BUCKET) {
    return { url: LocalStorage.signedGetUrl(String(file._id), PRESIGN_GET_TTL_SEC), expiresIn: PRESIGN_GET_TTL_SEC };
  }
  const url = await getSignedUrl(
    getS3(),
    new GetObjectCommand({
      Bucket: file.bucket,
      Key: file.key,
      ResponseContentDisposition: `inline; filename="${safeName(file.originalName)}"`,
    }),
    { expiresIn: PRESIGN_GET_TTL_SEC },
  );
  return { url, expiresIn: PRESIGN_GET_TTL_SEC };
};

/** Called by the orphan cleanup job: deletes S3 object + DB row */
const hardDelete = async (fileId: string) => {
  const file = await File.findById(fileId).select("bucket key").lean();
  if (!file) return;
  try {
    if (file.bucket === LOCAL_BUCKET) await LocalStorage.remove(file.key);
    else await getS3().send(new DeleteObjectCommand({ Bucket: file.bucket, Key: file.key }));
  } catch (error: any) {
    errorLogger.error(`S3 delete failed for ${file.key}: ${error.message}`);
    return;
  }
  await File.updateOne({ _id: fileId }, { $set: { status: "deleted" } });
};

// ---------- local disk storage (default when S3 is not configured) ----------

/** PUT /uploads/:id/local?exp&sig — receives the raw file body, like a presigned S3 PUT. */
const receiveLocalUpload = async (fileId: string, contentType: string | undefined, body: import("stream").Readable) => {
  const file = await File.findOne({ _id: fileId, bucket: LOCAL_BUCKET, status: "pending" }).select("key mime sizeBytes").lean();
  if (!file) throw new ApiError(StatusCodes.NOT_FOUND, "Upload not found or already finished");
  if ((contentType ?? "").split(";")[0].trim().toLowerCase() !== file.mime) {
    throw new ApiError(StatusCodes.UNSUPPORTED_MEDIA_TYPE, "Content-Type does not match the declared file type");
  }
  let written: number;
  try {
    written = await LocalStorage.write(file.key, body, file.sizeBytes);
  } catch {
    throw new ApiError(StatusCodes.BAD_REQUEST, "Upload failed: file is larger than declared");
  }
  if (written !== file.sizeBytes) {
    await LocalStorage.remove(file.key);
    throw new ApiError(StatusCodes.BAD_REQUEST, "Upload failed: file size does not match");
  }
};

/** GET /files/:id/local?exp&sig — the signed-URL target for private local files. */
const localFileForDownload = async (fileId: string) => {
  const file = await File.findOne({ _id: fileId, bucket: LOCAL_BUCKET, status: "ready" }).select("key mime originalName").lean();
  if (!file) throw new ApiError(StatusCodes.NOT_FOUND, "File not found");
  return { path: LocalStorage.fullPath(file.key), mime: file.mime, name: safeName(file.originalName) };
};

export const UploadService = {
  presign,
  complete,
  resolveOwnFiles,
  signedUrl,
  hardDelete,
  receiveLocalUpload,
  localFileForDownload,
};
