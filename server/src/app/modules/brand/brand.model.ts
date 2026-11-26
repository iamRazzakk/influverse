import { HydratedDocument, InferSchemaType, model, Schema } from "mongoose";
import {
  BRAND_INDUSTRIES,
  CAMPAIGN_GOALS,
  COMPANY_SIZES,
  CREATOR_TIERS,
  MONTHLY_BUDGETS,
  TARGET_PLATFORMS,
} from "./brand.constant";

/**
 * docs/03-data-models.md §2.1 — 1:1 profile for `users.role = brand`.
 * An empty profile is created on register; required fields are checked at `complete-onboarding`.
 */
const brandProfileSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, unique: true },
    slug: { type: String, required: true, unique: true, lowercase: true },
    companyName: { type: String, trim: true, maxlength: 120 },
    logo: String,
    coverImage: String,
    jobTitle: { type: String, trim: true, maxlength: 100 },
    tagline: { type: String, trim: true, maxlength: 160 },
    bio: { type: String, maxlength: 2000 },
    website: String,
    country: { type: String, uppercase: true, minlength: 2, maxlength: 2 },
    city: { type: String, trim: true, maxlength: 100 },
    companySize: { type: String, enum: COMPANY_SIZES },
    foundedYear: Number,
    industry: { type: String, enum: BRAND_INDUSTRIES },
    industryTags: { type: [String], default: [] },
    targetPlatforms: { type: [{ type: String, enum: TARGET_PLATFORMS }], default: [] },
    campaignGoals: { type: [{ type: String, enum: CAMPAIGN_GOALS }], default: [] },
    monthlyBudget: { type: String, enum: MONTHLY_BUDGETS },
    creatorTiers: { type: [{ type: String, enum: CREATOR_TIERS }], default: [] },
    vatNumber: { type: String, trim: true },
    billingAddress: {
      type: new Schema(
        { line1: String, line2: String, city: String, postalCode: String, country: String },
        { _id: false },
      ),
      default: undefined,
    },
    verified: { type: Boolean, default: false },
    stats: {
      rating: { type: Number, default: 0 },
      reviewsCount: { type: Number, default: 0 },
      totalCampaigns: { type: Number, default: 0 },
      escrowFundedRate: { type: Number, default: 0 },
      avgResponseHours: { type: Number, default: 0 },
      avgPayoutCents: { type: Number, default: 0 },
      lifetimeSpendCents: { type: Number, default: 0 },
    },
  },
  { timestamps: true, versionKey: false },
);

brandProfileSchema.index({ industry: 1, country: 1 });

export type IBrandProfile = InferSchemaType<typeof brandProfileSchema>;
export type BrandProfileDoc = HydratedDocument<IBrandProfile>;
export const BrandProfile = model("BrandProfile", brandProfileSchema, "brand_profiles");
