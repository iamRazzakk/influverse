import { Model, Types } from "mongoose";
import { StatusCodes } from "http-status-codes";
import ApiError from "../../../errors/ApiErrors";
import { JOB } from "../../../jobs/jobNames";
import { getQueue, QUEUES } from "../../../queues";
import { decrementCounter, incrementWithinLimit } from "../../../shared/db";
import { errorLogger } from "../../../shared/logger";
import { withId, withIds } from "../../../utils/dto";
import { CreatorProfile } from "../creator/creator.model";
import { CreatorService } from "../creator/creator.service";
import { UploadService } from "../upload/upload.service";
import { GalleryPhoto, PortfolioItem } from "./portfolio.model";

/**
 * Creator showcase: portfolio items (past / demo work) and lookbook gallery photos.
 * Media is uploaded first via /uploads/presign, then referenced here by `fileId`.
 *
 * No transactions (small CRUD). Limits use an atomic conditional `$inc` on the creator profile;
 * replaced / deleted media is removed from S3 by a background job, queued only after the
 * database change succeeded.
 */

export const PORTFOLIO_LIMIT = 30;
export const GALLERY_LIMIT = 60;

type ShowcaseKind = "portfolio" | "gallery";

const SHOWCASE = {
  portfolio: { model: PortfolioItem as Model<any>, counter: "portfolioCount", limit: PORTFOLIO_LIMIT, mediaField: "media", label: "Portfolio item" },
  gallery: { model: GalleryPhoto as Model<any>, counter: "galleryCount", limit: GALLERY_LIMIT, mediaField: "photo", label: "Photo" },
} as const;

const notFound = (label: string) => new ApiError(StatusCodes.NOT_FOUND, `${label} not found`);
const isVideo = (mime: string) => mime.startsWith("video/");

/** Background S3 deletion of a file nothing references anymore (retried by the cleanup queue). */
const scheduleFileDeletion = async (fileId: unknown) => {
  if (!fileId) return;
  await getQueue(QUEUES.cleanup)
    .add(JOB.deleteFile, { fileId: String(fileId) }, { jobId: `delete-file:${fileId}` })
    .catch((error) => errorLogger.error(`Failed to queue file deletion ${fileId}: ${error.message}`));
};

/** Checks ownership + upload status and links the file to the item. */
const resolveMedia = async (creatorId: string, fileId: string, kind: ShowcaseKind, itemId: unknown) => {
  const [media] = await UploadService.resolveOwnFiles({ type: "user", id: creatorId }, [fileId], [kind], {
    kind,
    id: String(itemId),
  });
  return media;
};

const list = async (kind: ShowcaseKind, creatorId: string) =>
  withIds(await SHOWCASE[kind].model.find({ creatorId }).sort({ sortOrder: 1, createdAt: -1 }).lean());

const create = async (kind: ShowcaseKind, creatorId: string, input: Record<string, any> & { fileId: string }) => {
  const { model, counter, limit, mediaField } = SHOWCASE[kind];
  const { fileId, ...fields } = input;

  await incrementWithinLimit(CreatorProfile, { userId: creatorId }, counter, limit, `You can have at most ${limit} ${kind} items`);

  let created;
  try {
    // Id generated up-front so the file can be linked to the item before the insert.
    const itemId = new Types.ObjectId();
    const media = await resolveMedia(creatorId, fileId, kind, itemId);
    const mediaType = kind === "portfolio" ? (fields.mediaType ?? (isVideo(media.mime) ? "video" : "image")) : undefined;

    created = await model.create({
      ...fields,
      _id: itemId,
      creatorId,
      [mediaField]: media,
      ...(mediaType && { mediaType }),
      sortOrder: await model.countDocuments({ creatorId }),
    });
  } catch (error) {
    await decrementCounter(CreatorProfile, { userId: creatorId }, counter); // give the slot back
    throw error;
  }

  await CreatorService.onContentChanged(creatorId);
  return withId(created.toObject());
};

const update = async (kind: ShowcaseKind, creatorId: string, itemId: string, input: Record<string, any>) => {
  const { model, mediaField, label } = SHOWCASE[kind];
  const { fileId, ...fields } = input;
  const $set: Record<string, unknown> = { ...fields };

  if (fileId) {
    const media = await resolveMedia(creatorId, fileId, kind, itemId);
    $set[mediaField] = media;
    if (kind === "portfolio" && !fields.mediaType) $set.mediaType = isVideo(media.mime) ? "video" : "image";
  }

  // `new: false` returns the previous version, so we know which old file to clean up.
  const previous = await model
    .findOneAndUpdate({ _id: itemId, creatorId }, { $set }, { new: false, runValidators: true })
    .lean<Record<string, any>>();
  if (!previous) throw notFound(label);

  const oldFileId = previous[mediaField]?.fileId;
  if (fileId && oldFileId && String(oldFileId) !== fileId) await scheduleFileDeletion(oldFileId);

  await CreatorService.onContentChanged(creatorId);
  return withId({ ...previous, ...$set } as { _id: unknown });
};

const remove = async (kind: ShowcaseKind, creatorId: string, itemId: string) => {
  const { model, counter, mediaField, label } = SHOWCASE[kind];

  const deleted = await model.findOneAndDelete({ _id: itemId, creatorId }).select(`${mediaField}.fileId`).lean<Record<string, any>>();
  if (!deleted) throw notFound(label);

  await decrementCounter(CreatorProfile, { userId: creatorId }, counter);
  await scheduleFileDeletion(deleted[mediaField]?.fileId);
  await CreatorService.onContentChanged(creatorId);
};

/** One bulkWrite round-trip; ids that don't belong to the creator are simply not matched. */
const reorder = async (kind: ShowcaseKind, creatorId: string, ids: string[]) => {
  await SHOWCASE[kind].model.bulkWrite(
    ids.map((id, index) => ({ updateOne: { filter: { _id: id, creatorId }, update: { $set: { sortOrder: index } } } })),
  );
  await CreatorService.onContentChanged(creatorId);
  return list(kind, creatorId);
};

export const PortfolioService = {
  listPortfolio: (creatorId: string) => list("portfolio", creatorId),
  createPortfolioItem: (creatorId: string, input: Record<string, any> & { fileId: string }) => create("portfolio", creatorId, input),
  updatePortfolioItem: (creatorId: string, itemId: string, input: Record<string, any>) => update("portfolio", creatorId, itemId, input),
  deletePortfolioItem: (creatorId: string, itemId: string) => remove("portfolio", creatorId, itemId),
  reorderPortfolio: (creatorId: string, ids: string[]) => reorder("portfolio", creatorId, ids),

  listGallery: (creatorId: string) => list("gallery", creatorId),
  createGalleryPhoto: (creatorId: string, input: Record<string, any> & { fileId: string }) => create("gallery", creatorId, input),
  updateGalleryPhoto: (creatorId: string, photoId: string, input: Record<string, any>) => update("gallery", creatorId, photoId, input),
  deleteGalleryPhoto: (creatorId: string, photoId: string) => remove("gallery", creatorId, photoId),
  reorderGallery: (creatorId: string, ids: string[]) => reorder("gallery", creatorId, ids),
};
