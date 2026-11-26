import { z } from "zod";
import { zObjectId, zUrl } from "../../../shared/zod";
import { ASPECT_RATIOS, GALLERY_CATEGORIES, MEDIA_TYPES, PHOTO_ASPECTS } from "./portfolio.model";

const idParam = z.object({ id: zObjectId });
const zDate = z.coerce.date().max(new Date(Date.now() + 24 * 3600_000), "Date can't be in the future");

const portfolioFields = z.object({
  fileId: zObjectId,
  title: z.string().trim().min(1).max(120),
  brandName: z.string().trim().max(100).optional(),
  brandLogo: zUrl.optional(),
  description: z.string().trim().max(2000).optional(),
  mediaType: z.enum(MEDIA_TYPES).optional(),
  thumbnailUrl: zUrl.optional(),
  durationSec: z.number().positive().max(3 * 3600).optional(),
  aspectRatio: z.enum(ASPECT_RATIOS).optional(),
  platforms: z.array(z.string().trim().max(20)).max(5).optional(),
  deliverableType: z.string().trim().max(60).optional(),
  soundTrack: z.string().trim().max(120).optional(),
  metrics: z
    .object({
      views: z.number().int().min(0),
      likes: z.number().int().min(0),
      comments: z.number().int().min(0),
      shares: z.number().int().min(0),
      engagementRate: z.number().min(0).max(100),
    })
    .partial()
    .optional(),
  completedDate: zDate.optional(),
  packagePriceCents: z.number().int().min(0).optional(),
});

const galleryFields = z.object({
  fileId: zObjectId,
  caption: z.string().trim().max(300).optional(),
  category: z.enum(GALLERY_CATEGORIES).optional(),
  aspectRatio: z.enum(PHOTO_ASPECTS).optional(),
  takenAt: zDate.optional(),
  location: z.string().trim().max(100).optional(),
  cameraGear: z.string().trim().max(100).optional(),
  tags: z.array(z.string().trim().min(1).max(30)).max(10).optional(),
});

const nonEmpty = (v: object) => Object.keys(v).length > 0;

export const PortfolioValidation = {
  createPortfolio: z.object({ body: portfolioFields.strict() }),
  updatePortfolio: z.object({ params: idParam, body: portfolioFields.partial().strict().refine(nonEmpty, "Nothing to update") }),
  createGallery: z.object({ body: galleryFields.strict() }),
  updateGallery: z.object({ params: idParam, body: galleryFields.partial().strict().refine(nonEmpty, "Nothing to update") }),
  idParam: z.object({ params: idParam }),
  reorder: z.object({ body: z.object({ ids: z.array(zObjectId).min(1).max(100) }) }),
};
