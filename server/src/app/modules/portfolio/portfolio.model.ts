import { InferSchemaType, model, Schema } from "mongoose";
import { fileRefSchema } from "../../../shared/schemas";

export const MEDIA_TYPES = ["image", "video"] as const;
export const ASPECT_RATIOS = ["9:16", "16:9", "1:1", "4:5"] as const;
export const GALLERY_CATEGORIES = [
  "headshot",
  "lifestyle",
  "modeling",
  "bts",
  "outdoors",
  "studio",
  "editorial",
  "action",
  "photo",
] as const;
export const PHOTO_ASPECTS = ["portrait", "landscape", "square"] as const;

/** docs/03 §3.2 — creator's demo / past work */
const portfolioItemSchema = new Schema(
  {
    creatorId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    title: { type: String, required: true, trim: true, maxlength: 120 },
    brandName: { type: String, trim: true, default: "Personal Work", maxlength: 100 },
    brandLogo: String,
    description: { type: String, maxlength: 2000 },
    mediaType: { type: String, enum: MEDIA_TYPES, required: true },
    media: { type: fileRefSchema, required: true },
    thumbnailUrl: String,
    durationSec: Number,
    aspectRatio: { type: String, enum: ASPECT_RATIOS },
    platforms: { type: [String], default: [] },
    deliverableType: String,
    soundTrack: String,
    metrics: {
      views: { type: Number, default: 0 },
      likes: { type: Number, default: 0 },
      comments: { type: Number, default: 0 },
      shares: { type: Number, default: 0 },
      engagementRate: { type: Number, default: 0 },
    },
    completedDate: Date,
    packagePriceCents: Number,
    orderId: { type: Schema.Types.ObjectId, ref: "Order" },
    sortOrder: { type: Number, default: 0 },
  },
  { timestamps: true, versionKey: false },
);
portfolioItemSchema.index({ creatorId: 1, sortOrder: 1 });

/** docs/03 §3.3 — lookbook photo */
const galleryPhotoSchema = new Schema(
  {
    creatorId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    photo: { type: fileRefSchema, required: true },
    caption: { type: String, maxlength: 300 },
    category: { type: String, enum: GALLERY_CATEGORIES, default: "lifestyle" },
    aspectRatio: { type: String, enum: PHOTO_ASPECTS },
    takenAt: Date,
    location: { type: String, maxlength: 100 },
    cameraGear: { type: String, maxlength: 100 },
    tags: { type: [String], default: [] },
    sortOrder: { type: Number, default: 0 },
  },
  { timestamps: true, versionKey: false },
);
galleryPhotoSchema.index({ creatorId: 1, sortOrder: 1 });

export type IPortfolioItem = InferSchemaType<typeof portfolioItemSchema>;
export type IGalleryPhoto = InferSchemaType<typeof galleryPhotoSchema>;
export const PortfolioItem = model("PortfolioItem", portfolioItemSchema, "portfolio_items");
export const GalleryPhoto = model("GalleryPhoto", galleryPhotoSchema, "gallery_photos");
