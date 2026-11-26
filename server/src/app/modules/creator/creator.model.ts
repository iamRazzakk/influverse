import { HydratedDocument, InferSchemaType, model, Schema } from "mongoose";
import {
  APPROVAL_STATUS,
  COLLABORATION_PREFERENCES,
  CREATOR_CATEGORIES,
  GENDERS,
  SOCIAL_PLATFORMS,
} from "./creator.constant";

const socialPlatformSchema = new Schema(
  {
    handle: { type: String, trim: true },
    url: String,
    followers: { type: Number, default: 0, min: 0 },
    engagementRate: { type: Number, default: 0, min: 0, max: 100 },
    avgViews: { type: Number, default: 0, min: 0 },
    connected: { type: Boolean, default: false },
    lastSyncedAt: Date,
  },
  { _id: false },
);

/**
 * docs/03-data-models.md §2.2 — creator public profile + **search source** (D20: no Meilisearch).
 * Denormalised for search: `name`, `avatar` (synced from users), `followersTotal`, `platformKeys`.
 */
const creatorProfileSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, unique: true },
    // Set during onboarding — null before that (sparse unique)
    handle: { type: String, lowercase: true, trim: true },
    name: { type: String, trim: true },
    avatar: String,
    bio: { type: String, maxlength: 1000 },
    coverImage: String,
    contactEmail: String,
    contactPhone: String,
    gender: { type: String, enum: GENDERS },
    country: { type: String, uppercase: true, minlength: 2, maxlength: 2 },
    city: { type: String, trim: true },
    languages: { type: [String], default: [] },
    categories: { type: [{ type: String, enum: CREATOR_CATEGORIES }], default: [] },
    tags: { type: [String], default: [] },
    collaborationPreferences: { type: [{ type: String, enum: COLLABORATION_PREFERENCES }], default: [] },
    aestheticVibe: String,
    platforms: {
      instagram: { type: socialPlatformSchema, default: undefined },
      tiktok: { type: socialPlatformSchema, default: undefined },
      youtube: { type: socialPlatformSchema, default: undefined },
    },
    /** Which platforms are connected — multikey index for the `?platform=` filter */
    platformKeys: { type: [{ type: String, enum: SOCIAL_PLATFORMS }], default: [] },
    followersTotal: { type: Number, default: 0 },
    ugc: {
      enabled: { type: Boolean, default: false },
      avgDeliveryDays: Number,
    },
    audience: {
      topCountries: { type: [{ country: String, percentage: Number, _id: false }], default: undefined },
      genderSplit: { female: Number, male: Number },
      topAgeGroup: String,
    },
    approvalStatus: {
      type: String,
      enum: Object.values(APPROVAL_STATUS),
      default: APPROVAL_STATUS.underReview,
      required: true,
    },
    approvalNote: String,
    approvedBy: { type: Schema.Types.ObjectId, ref: "Admin" },
    approvedAt: Date,
    onboardingSubmittedAt: Date,
    verified: { type: Boolean, default: false },
    startingPriceCents: { type: Number, default: 0 },
    /**
     * Number of non-archived packages. Reserved atomically with a conditional `$inc`
     * (`packageCount < max`) so two parallel "create package" requests can't exceed the limit.
     */
    packageCount: { type: Number, default: 0, min: 0 },
    /** Same atomic-slot idea for the showcase limits. */
    portfolioCount: { type: Number, default: 0, min: 0 },
    galleryCount: { type: Number, default: 0, min: 0 },
    rating: { type: Number, default: 0 },
    reviewsCount: { type: Number, default: 0 },
    totalCollaborations: { type: Number, default: 0 },
    profileCompletion: { type: Number, default: 50 },
    /** approved + user active + onboarding complete → shown in public search */
    isSearchable: { type: Boolean, default: false },
    isFeatured: { type: Boolean, default: false },
    /** Sum of all review ratings — `rating` = ratingSum / reviewsCount, updated atomically per review. */
    ratingSum: { type: Number },
    /**
     * Stripe Connect Express account that receives payouts. Bank details live on Stripe, never here.
     * `payoutsEnabled` mirrors Stripe (onboarding finished + transfers capability active).
     */
    stripeConnect: {
      type: new Schema(
        { accountId: String, payoutsEnabled: { type: Boolean, default: false }, detailsSubmitted: { type: Boolean, default: false }, syncedAt: Date },
        { _id: false },
      ),
      default: undefined,
    },
  },
  { timestamps: true, versionKey: false },
);

creatorProfileSchema.index({ handle: 1 }, { unique: true, partialFilterExpression: { handle: { $type: "string" } } });
// Admin approval queue
creatorProfileSchema.index({ approvalStatus: 1, onboardingSubmittedAt: 1 });
// Public search: every query starts with `isSearchable: true` → kept as the index prefix
creatorProfileSchema.index({ isSearchable: 1, categories: 1, startingPriceCents: 1 });
creatorProfileSchema.index({ isSearchable: 1, platformKeys: 1, followersTotal: -1 });
creatorProfileSchema.index({ isSearchable: 1, country: 1, rating: -1 });
creatorProfileSchema.index({ isSearchable: 1, followersTotal: -1 });
creatorProfileSchema.index({ isSearchable: 1, rating: -1, reviewsCount: -1 });
creatorProfileSchema.index({ isSearchable: 1, isFeatured: 1, rating: -1 });
creatorProfileSchema.index(
  { name: "text", handle: "text", tags: "text", bio: "text" },
  { weights: { handle: 10, name: 8, tags: 4, bio: 1 }, name: "creator_text", default_language: "none" },
);

export type ICreatorProfile = InferSchemaType<typeof creatorProfileSchema>;
export type CreatorProfileDoc = HydratedDocument<ICreatorProfile>;
export const CreatorProfile = model("CreatorProfile", creatorProfileSchema, "creator_profiles");
