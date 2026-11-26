import type { Request } from "express";
import { Model } from "mongoose";
import { StatusCodes } from "http-status-codes";
import ApiError from "../../../errors/ApiErrors";
import { cache, TTL } from "../../../shared/cache";
import { CODE_PREFIX, nextCode } from "../../../shared/codeGenerator";
import { withId, withIds } from "../../../utils/dto";
import { AuditService, diffFields } from "../audit/audit.service";
import { CmsPage, Faq, PartnerBrand, SiteSettings } from "./cms.model";

/**
 * CMS (docs/00-final-plan.md §5.11 public, §5.12 admin).
 *
 * Public reads are cached in Redis for 10 minutes under the `cms` tag. Every admin write
 * drops that tag and asks the website to revalidate its statically generated pages,
 * so edits show up within seconds without a redeploy.
 */

const CMS_TAG = "cms";
const cmsKey = (name: string) => `cms:${name}`;

/** Website (Next.js) cache tags affected by each kind of change. */
const WEBSITE_TAGS = {
  page: (slug: string) => [`cms:page:${slug}`],
  faqs: ["cms:faqs"],
  partnerBrands: ["cms:partner-brands"],
  site: ["cms:site"],
};

const afterWrite = (websiteTags: string[]) => cache.invalidate([CMS_TAG], { websiteTags });

const notFound = (what: string) => new ApiError(StatusCodes.NOT_FOUND, `${what} not found`);

// ---------------------------------------------------------------------------
// Public (website)
// ---------------------------------------------------------------------------

const getPublishedPage = async (slug: string) => {
  const page = await cache.wrap(
    cmsKey(`page:${slug}`),
    TTL.cms,
    () => CmsPage.findOne({ slug, isPublished: true }).select("slug title contentMarkdown version updatedAt").lean(),
    [CMS_TAG],
  );
  if (!page) throw notFound("Page");
  return withId(page);
};

const listPublishedFaqs = (category?: string) =>
  cache.wrap(
    cmsKey(`faqs:${category ?? "all"}`),
    TTL.cms,
    async () =>
      withIds(
        await Faq.find({ isPublished: true, ...(category && { category }) })
          .select("category question answer order translations")
          .sort({ category: 1, order: 1 })
          .lean(),
      ),
    [CMS_TAG],
  );

const listActivePartnerBrands = () =>
  cache.wrap(
    cmsKey("partner-brands"),
    TTL.cms,
    async () =>
      withIds(await PartnerBrand.find({ isActive: true }).select("name logoUrl websiteUrl order").sort({ order: 1 }).lean()),
    [CMS_TAG],
  );

const getSite = () =>
  cache.wrap(
    cmsKey("site"),
    TTL.cms,
    async () => (await SiteSettings.findOne({ key: "site" }).select("-key -updatedBy").lean()) ?? {},
    [CMS_TAG],
  );

// ---------------------------------------------------------------------------
// Admin — legal / about pages
// ---------------------------------------------------------------------------

const MAX_PAGE_HISTORY = 10;

const adminGetPage = async (slug: string) => {
  const page = await CmsPage.findOne({ slug }).select("-history").lean();
  if (!page) throw notFound("Page");
  return { ...withId(page), lastModified: page.updatedAt };
};

/** PUT /admin/cms/pages/:slug — upsert; the previous version is pushed into a capped history. */
const adminSavePage = async (
  req: Request,
  slug: string,
  input: { title: string; contentMarkdown: string; version: string; isPublished: boolean },
) => {
  const previous = await CmsPage.findOne({ slug }).select("title version contentMarkdown isPublished updatedBy updatedAt").lean();

  const update: Record<string, unknown> = { $set: { ...input, updatedBy: req.admin!.id } };
  if (previous) {
    // $push with $slice keeps only the newest N versions — one atomic write, no read-modify-save.
    update.$push = {
      history: {
        $each: [{ version: previous.version, contentMarkdown: previous.contentMarkdown, updatedBy: previous.updatedBy, updatedAt: previous.updatedAt }],
        $slice: -MAX_PAGE_HISTORY,
      },
    };
  }
  const page = await CmsPage.findOneAndUpdate({ slug }, update, { new: true, upsert: true, runValidators: true })
    .select("-history")
    .lean();

  await afterWrite(WEBSITE_TAGS.page(slug));
  await AuditService.record(req, {
    action: "cms.update",
    targetType: "cms_page",
    targetId: page!._id,
    targetCode: slug,
    ...diffFields(previous ?? {}, { title: input.title, version: input.version, isPublished: input.isPublished }),
  });
  return { ...withId(page!), lastModified: page!.updatedAt };
};

// ---------------------------------------------------------------------------
// Admin — ordered lists (FAQs, partner brands)
// ---------------------------------------------------------------------------

/**
 * Swaps an item with its neighbour (up = smaller order). Two targeted updates in one
 * `bulkWrite` round-trip; `scope` keeps FAQ moves inside their own category.
 */
const moveInList = async (
  model: Model<any>,
  id: string,
  direction: "up" | "down",
  scope: (item: any) => Record<string, unknown>,
) => {
  const item = await model.findById(id).lean<{ _id: unknown; order: number }>();
  if (!item) return null;

  const neighbour = await model
    .findOne({ ...scope(item), order: direction === "up" ? { $lt: item.order } : { $gt: item.order } })
    .sort({ order: direction === "up" ? -1 : 1 })
    .lean<{ _id: unknown; order: number }>();
  if (!neighbour) return item; // already at the edge

  await model.bulkWrite([
    { updateOne: { filter: { _id: item._id }, update: { $set: { order: neighbour.order } } } },
    { updateOne: { filter: { _id: neighbour._id }, update: { $set: { order: item.order } } } },
  ]);
  return item;
};

/** Closes the gap left by a deleted item so orders stay 1..n. */
const shiftDownAfter = (model: Model<any>, scope: Record<string, unknown>, removedOrder: number) =>
  model.updateMany({ ...scope, order: { $gt: removedOrder } }, { $inc: { order: -1 } });

const nextOrder = async (model: Model<any>, scope: Record<string, unknown>) => {
  const last = await model.findOne(scope).sort({ order: -1 }).select("order").lean<{ order: number }>();
  return (last?.order ?? 0) + 1;
};

// FAQs

const adminListFaqs = async (category?: string) =>
  withIds(await Faq.find(category ? { category } : {}).sort({ category: 1, order: 1 }).lean());

const adminCreateFaq = async (req: Request, input: { category: string; question: string; answer: string; isPublished: boolean }) => {
  const faq = await Faq.create({
    ...input,
    code: await nextCode(CODE_PREFIX.faq),
    order: await nextOrder(Faq, { category: input.category }),
  });
  await afterWrite(WEBSITE_TAGS.faqs);
  await AuditService.record(req, { action: "cms.update", targetType: "faq", targetId: faq._id, targetCode: faq.code, after: input });
  return withId(faq.toObject());
};

const adminUpdateFaq = async (req: Request, id: string, input: Record<string, unknown>) => {
  const before = await Faq.findById(id).lean();
  if (!before) throw notFound("FAQ");

  const $set: Record<string, unknown> = { ...input };
  // Moving to another category appends the FAQ to the end of that category.
  if (input.category && input.category !== before.category) {
    $set.order = await nextOrder(Faq, { category: input.category });
  }
  const faq = await Faq.findByIdAndUpdate(id, { $set }, { new: true, runValidators: true }).lean();
  if (input.category && input.category !== before.category) {
    await shiftDownAfter(Faq, { category: before.category }, before.order);
  }

  await afterWrite(WEBSITE_TAGS.faqs);
  await AuditService.record(req, { action: "cms.update", targetType: "faq", targetId: id, targetCode: before.code, ...diffFields(before, input) });
  return withId(faq!);
};

const adminDeleteFaq = async (req: Request, id: string) => {
  const faq = await Faq.findByIdAndDelete(id).lean();
  if (!faq) throw notFound("FAQ");
  await shiftDownAfter(Faq, { category: faq.category }, faq.order);
  await afterWrite(WEBSITE_TAGS.faqs);
  await AuditService.record(req, { action: "cms.update", targetType: "faq", targetId: id, targetCode: faq.code, before: { question: faq.question } });
};

const adminMoveFaq = async (req: Request, id: string, direction: "up" | "down") => {
  const moved = await moveInList(Faq, id, direction, (item) => ({ category: item.category }));
  if (!moved) throw notFound("FAQ");
  await afterWrite(WEBSITE_TAGS.faqs);
  return adminListFaqs();
};

// Partner brands

const adminListPartnerBrands = async () => withIds(await PartnerBrand.find().sort({ order: 1 }).lean());

const adminCreatePartnerBrand = async (
  req: Request,
  input: { name: string; logoUrl: string; websiteUrl?: string; category?: string; isActive: boolean },
) => {
  const brand = await PartnerBrand.create({
    ...input,
    code: await nextCode(CODE_PREFIX.partnerBrand),
    order: await nextOrder(PartnerBrand, {}),
  });
  await afterWrite(WEBSITE_TAGS.partnerBrands);
  await AuditService.record(req, { action: "cms.update", targetType: "partner_brand", targetId: brand._id, targetCode: brand.code, after: input });
  return withId(brand.toObject());
};

const adminUpdatePartnerBrand = async (req: Request, id: string, input: Record<string, unknown>) => {
  const before = await PartnerBrand.findById(id).lean();
  if (!before) throw notFound("Partner brand");
  const brand = await PartnerBrand.findByIdAndUpdate(id, { $set: input }, { new: true, runValidators: true }).lean();
  await afterWrite(WEBSITE_TAGS.partnerBrands);
  await AuditService.record(req, { action: "cms.update", targetType: "partner_brand", targetId: id, targetCode: before.code, ...diffFields(before, input) });
  return withId(brand!);
};

const adminDeletePartnerBrand = async (req: Request, id: string) => {
  const brand = await PartnerBrand.findByIdAndDelete(id).lean();
  if (!brand) throw notFound("Partner brand");
  await shiftDownAfter(PartnerBrand, {}, brand.order);
  await afterWrite(WEBSITE_TAGS.partnerBrands);
  await AuditService.record(req, { action: "cms.update", targetType: "partner_brand", targetId: id, targetCode: brand.code, before: { name: brand.name } });
};

const adminMovePartnerBrand = async (_req: Request, id: string, direction: "up" | "down") => {
  const moved = await moveInList(PartnerBrand, id, direction, () => ({}));
  if (!moved) throw notFound("Partner brand");
  await afterWrite(WEBSITE_TAGS.partnerBrands);
  return adminListPartnerBrands();
};

// Site settings (assets, hero copy, social links, ticker)

const adminGetSite = async () => (await SiteSettings.findOne({ key: "site" }).lean()) ?? {};

const adminUpdateSite = async (req: Request, input: Record<string, unknown>) => {
  const before = await SiteSettings.findOne({ key: "site" }).lean();
  // Dot-notation for the ticker so a partial ticker update doesn't wipe the other ticker fields.
  const { ticker, ...rest } = input as { ticker?: Record<string, unknown> };
  const $set: Record<string, unknown> = { ...rest, updatedBy: req.admin!.id };
  for (const [key, value] of Object.entries(ticker ?? {})) $set[`ticker.${key}`] = value;

  const site = await SiteSettings.findOneAndUpdate({ key: "site" }, { $set }, { new: true, upsert: true, runValidators: true }).lean();
  await afterWrite(WEBSITE_TAGS.site);
  await AuditService.record(req, { action: "cms.update", targetType: "site_settings", targetId: site!._id, ...diffFields(before ?? {}, input) });
  return site;
};

export const CmsService = {
  getPublishedPage,
  listPublishedFaqs,
  listActivePartnerBrands,
  getSite,
  adminGetPage,
  adminSavePage,
  adminListFaqs,
  adminCreateFaq,
  adminUpdateFaq,
  adminDeleteFaq,
  adminMoveFaq,
  adminListPartnerBrands,
  adminCreatePartnerBrand,
  adminUpdatePartnerBrand,
  adminDeletePartnerBrand,
  adminMovePartnerBrand,
  adminGetSite,
  adminUpdateSite,
};
