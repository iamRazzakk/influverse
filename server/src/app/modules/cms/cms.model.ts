import { InferSchemaType, model, Schema } from "mongoose";

/** docs/03-data-models.md §13 — content managed from the dashboard CMS page. */

export const CMS_PAGE_SLUGS = ["terms", "privacy", "about"] as const;
export const FAQ_CATEGORIES = ["brands", "creators"] as const;
export const SOCIAL_LINK_PLATFORMS = ["facebook", "instagram", "x", "linkedin", "youtube", "tiktok"] as const;

/** Legal / about pages. Keeps the last 10 versions for rollback and audit. */
const cmsPageSchema = new Schema(
  {
    slug: { type: String, enum: CMS_PAGE_SLUGS, required: true, unique: true },
    title: { type: String, required: true, maxlength: 200 },
    contentMarkdown: { type: String, required: true, maxlength: 200_000 },
    version: { type: String, required: true, default: "1.0" },
    isPublished: { type: Boolean, default: true },
    updatedBy: { type: Schema.Types.ObjectId, ref: "Admin" },
    history: {
      type: [
        {
          version: String,
          contentMarkdown: String,
          updatedBy: { type: Schema.Types.ObjectId, ref: "Admin" },
          updatedAt: Date,
          _id: false,
        },
      ],
      default: [],
    },
  },
  { timestamps: true, versionKey: false },
);

const faqSchema = new Schema(
  {
    code: { type: String, required: true, unique: true },
    category: { type: String, enum: FAQ_CATEGORIES, required: true, default: "brands" },
    question: { type: String, required: true, maxlength: 500 },
    answer: { type: String, required: true, maxlength: 5000 },
    /** 1-based position inside its category. */
    order: { type: Number, required: true },
    isPublished: { type: Boolean, default: true },
    translations: {
      de: { question: String, answer: String },
    },
  },
  { timestamps: true, versionKey: false },
);
faqSchema.index({ category: 1, order: 1 });

/** "Trusted by" logo strip on the website. */
const partnerBrandSchema = new Schema(
  {
    code: { type: String, required: true, unique: true },
    name: { type: String, required: true, maxlength: 100 },
    logoUrl: { type: String, required: true },
    websiteUrl: String,
    category: String,
    order: { type: Number, required: true },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true, versionKey: false },
);
partnerBrandSchema.index({ isActive: 1, order: 1 });

/** Single document (`key: 'site'`): logos, hero copy, social links, brand ticker. */
const siteSettingsSchema = new Schema(
  {
    key: { type: String, required: true, unique: true, default: "site" },
    logoLightUrl: String,
    logoDarkUrl: String,
    faviconUrl: String,
    heroHeadline: { type: String, maxlength: 200 },
    heroSubtitle: { type: String, maxlength: 500 },
    supportEmail: String,
    socialLinks: {
      type: [{ platform: { type: String, enum: SOCIAL_LINK_PLATFORMS }, url: String, _id: false }],
      default: [],
    },
    ticker: {
      headline: { type: String, default: "Trusted by leading brands" },
      speedSeconds: { type: Number, default: 26, min: 5, max: 120 },
      pauseOnHover: { type: Boolean, default: true },
      direction: { type: String, enum: ["left", "right"], default: "left" },
      isEnabled: { type: Boolean, default: true },
    },
    updatedBy: { type: Schema.Types.ObjectId, ref: "Admin" },
  },
  { timestamps: true, versionKey: false },
);

export type ICmsPage = InferSchemaType<typeof cmsPageSchema>;
export type IFaq = InferSchemaType<typeof faqSchema>;
export type IPartnerBrand = InferSchemaType<typeof partnerBrandSchema>;
export type ISiteSettings = InferSchemaType<typeof siteSettingsSchema>;

export const CmsPage = model("CmsPage", cmsPageSchema, "cms_pages");
export const Faq = model("Faq", faqSchema, "faqs");
export const PartnerBrand = model("PartnerBrand", partnerBrandSchema, "partner_brands");
export const SiteSettings = model("SiteSettings", siteSettingsSchema, "site_settings");
