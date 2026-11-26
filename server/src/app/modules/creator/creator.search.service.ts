import { createHash } from "crypto";
import { FilterQuery, Types } from "mongoose";
import { StatusCodes } from "http-status-codes";
import ApiError from "../../../errors/ApiErrors";
import { cache, TTL } from "../../../shared/cache";
import { isObjectId } from "../../../shared/db";
import { withIds } from "../../../utils/dto";
import { escapeRegex } from "../../../utils/regex";
import { BrandProfile } from "../brand/brand.model";
import { Order } from "../order/order.model";
import { Package } from "../package/package.model";
import { GalleryPhoto, PortfolioItem } from "../portfolio/portfolio.model";
import { FOLLOWER_RANGES } from "./creator.constant";
import { CREATOR_CARD_PROJECTION, CREATOR_PRIVATE_FIELDS, toCreatorCard } from "./creator.mapper";
import { CreatorProfile, ICreatorProfile } from "./creator.model";
import { creatorCacheKeys } from "./creator.service";
import { SEARCH_SORTS } from "./creator.validation";

/**
 * Public creator discovery (docs/00-final-plan.md §5.4).
 *
 * D20: no external search engine. Every query starts with `isSearchable: true`, which is the
 * prefix of the compound indexes on creator_profiles, so Mongo serves filters + sorts from indexes.
 * Text search uses the `creator_text` index. Results are cached in Redis for 60 s.
 */

/** Cache tag shared by all list results; dropped when creator data changes in bulk. */
export const SEARCH_CACHE_TAG = "creators:search";

const creatorNotFound = () => new ApiError(StatusCodes.NOT_FOUND, "Creator not found");

export type CreatorSearchInput = {
  q?: string;
  category?: string;
  platform?: string;
  country?: string;
  gender?: string;
  followerRange?: keyof typeof FOLLOWER_RANGES;
  minPrice?: number;
  maxPrice?: number;
  verified?: boolean;
  sort: (typeof SEARCH_SORTS)[number];
  page: number;
  limit: number;
};

/** `_id` is the final tie-breaker so pagination is stable when values are equal. */
const SORT_ORDERS: Record<Exclude<CreatorSearchInput["sort"], "relevance">, Record<string, 1 | -1>> = {
  price_asc: { startingPriceCents: 1, _id: 1 },
  price_desc: { startingPriceCents: -1, _id: 1 },
  followers: { followersTotal: -1, _id: 1 },
  rating: { rating: -1, reviewsCount: -1, _id: 1 },
  newest: { createdAt: -1, _id: 1 },
};

const buildFilter = (input: CreatorSearchInput): FilterQuery<ICreatorProfile> => {
  const filter: FilterQuery<ICreatorProfile> = { isSearchable: true };
  if (input.category) filter.categories = input.category; // multikey index: matches any array element
  if (input.platform) filter.platformKeys = input.platform;
  if (input.country) filter.country = input.country;
  if (input.gender) filter.gender = input.gender;
  if (input.verified !== undefined) filter.verified = input.verified;
  if (input.followerRange) {
    const [min, max] = FOLLOWER_RANGES[input.followerRange];
    filter.followersTotal = { $gte: min, $lt: max };
  }
  if (input.minPrice !== undefined || input.maxPrice !== undefined) {
    filter.startingPriceCents = {
      ...(input.minPrice !== undefined && { $gte: input.minPrice }),
      ...(input.maxPrice !== undefined && { $lte: input.maxPrice }),
    };
  }
  if (input.q && input.q.length >= 2) {
    // `$language: none` disables stemming so handles / brand names match literally.
    filter.$text = { $search: input.q, $language: "none" };
  }
  return filter;
};

/** GET /creators */
const search = (input: CreatorSearchInput) => {
  const cacheKey = `creators:search:${createHash("sha1").update(JSON.stringify(input)).digest("hex")}`;

  return cache.wrap(
    cacheKey,
    TTL.creatorSearch,
    async () => {
      const filter = buildFilter(input);
      const isTextSearch = Boolean(filter.$text);

      let query = CreatorProfile.find(filter, isTextSearch ? { score: { $meta: "textScore" } } : {}).select(
        CREATOR_CARD_PROJECTION,
      );
      if (input.sort !== "relevance") query = query.sort(SORT_ORDERS[input.sort]);
      else if (isTextSearch) query = query.sort({ score: { $meta: "textScore" }, rating: -1 } as any);
      else query = query.sort({ isFeatured: -1, rating: -1, reviewsCount: -1, _id: 1 });

      const [profiles, total] = await Promise.all([
        query.skip((input.page - 1) * input.limit).limit(input.limit).lean(),
        CreatorProfile.countDocuments(filter),
      ]);

      return {
        items: profiles.map(toCreatorCard),
        meta: { page: input.page, limit: input.limit, total, totalPages: Math.ceil(total / input.limit) },
      };
    },
    [SEARCH_CACHE_TAG],
  );
};

/**
 * GET /creators/suggest — typeahead (top 4).
 * Anchored, case-sensitive-on-lowercase regex on `handle` can use the handle index (handles are stored lowercase).
 */
const suggest = (q: string) => {
  const term = q.toLowerCase().replace(/^@/, "");
  return cache.wrap(
    `creators:suggest:${term}`,
    TTL.creatorSearch,
    async () => {
      const prefix = escapeRegex(term);
      const profiles = await CreatorProfile.find({
        isSearchable: true,
        $or: [{ handle: new RegExp(`^${prefix}`) }, { name: new RegExp(`^${prefix}`, "i") }],
      })
        .select("userId handle name avatar verified categories")
        .sort({ followersTotal: -1 })
        .limit(4)
        .lean();

      return profiles.map((profile) => ({
        id: String(profile.userId),
        handle: profile.handle,
        name: profile.name,
        avatar: profile.avatar ?? null,
        verified: Boolean(profile.verified),
        category: profile.categories?.[0] ?? null,
      }));
    },
    [SEARCH_CACHE_TAG],
  );
};

/** GET /creators/featured — home page row. */
const featured = (limit = 8) =>
  cache.wrap(
    `creators:featured:${limit}`,
    TTL.creatorPublic,
    async () => {
      const profiles = await CreatorProfile.find({ isSearchable: true })
        .select(CREATOR_CARD_PROJECTION)
        .sort({ isFeatured: -1, rating: -1, reviewsCount: -1 })
        .limit(limit)
        .lean();
      return profiles.map(toCreatorCard);
    },
    [SEARCH_CACHE_TAG],
  );

/** Handle → userId, cached so `/creators/@handle` doesn't hit Mongo twice. */
const resolveUserId = async (idOrHandle: string): Promise<string | null> => {
  if (isObjectId(idOrHandle)) return idOrHandle;
  const handle = idOrHandle.toLowerCase().replace(/^@/, "");
  return cache.wrap(creatorCacheKeys.handleLookup(handle), TTL.creatorPublic, async () => {
    const profile = await CreatorProfile.findOne({ handle }).select("userId").lean();
    return profile ? String(profile.userId) : null;
  });
};

/** GET /creators/:idOrHandle — public profile + active packages + portfolio + gallery. */
/** Latest brand reviews (written on completed orders) for the public "Client Reviews" section. */
const PUBLIC_REVIEWS_LIMIT = 50;
const loadReviews = async (creatorId: Types.ObjectId) => {
  const orders = await Order.find({ creatorId, "review.rating": { $exists: true } })
    .sort({ "review.createdAt": -1 })
    .limit(PUBLIC_REVIEWS_LIMIT)
    .select("title brandId review")
    .lean();
  const brands = await BrandProfile.find({ userId: { $in: orders.map((o) => o.brandId) } }).select("userId companyName logo").lean();
  const brandById = new Map(brands.map((b) => [String(b.userId), b]));
  return orders.map((o) => {
    const brand = brandById.get(String(o.brandId));
    return {
      id: String(o._id),
      brandName: brand?.companyName || "Brand",
      brandLogo: brand?.logo ?? null,
      rating: o.review!.rating,
      comment: o.review!.comment ?? "",
      campaignName: o.title,
      createdAt: o.review!.createdAt,
    };
  });
};

const getPublic = async (idOrHandle: string, viewerUserId?: string) => {
  const userId = await resolveUserId(idOrHandle);
  if (!userId) throw creatorNotFound();

  const detail = await cache.wrap(
    creatorCacheKeys.publicDetail(userId),
    TTL.creatorPublic,
    async () => {
      const creatorObjectId = new Types.ObjectId(userId);
      const profile = await CreatorProfile.findOne({ userId: creatorObjectId }).select(CREATOR_PRIVATE_FIELDS).lean();
      if (!profile) return null;

      const [packages, portfolio, gallery, reviews] = await Promise.all([
        Package.find({ creatorId: creatorObjectId, isArchived: false, isActive: true })
          .sort({ sortOrder: 1, priceCents: 1 })
          .select("-isArchived")
          .lean(),
        PortfolioItem.find({ creatorId: creatorObjectId }).sort({ sortOrder: 1, createdAt: -1 }).limit(60).lean(),
        GalleryPhoto.find({ creatorId: creatorObjectId }).sort({ sortOrder: 1, createdAt: -1 }).limit(60).lean(),
        loadReviews(creatorObjectId),
      ]);

      const { _id, userId: _userId, platforms: _rawPlatforms, ...profileFields } = profile;
      return {
        // Card fields last so the formatted `platforms` array wins over the raw sub-document.
        profile: { ...profileFields, ...toCreatorCard(profile) },
        isSearchable: Boolean(profile.isSearchable),
        packages: withIds(packages),
        portfolio: withIds(portfolio),
        gallery: withIds(gallery),
        reviews,
      };
    },
    [creatorCacheKeys.tag(userId)],
  );

  // Not yet approved → only the creator can preview their own page.
  if (!detail || (!detail.isSearchable && viewerUserId !== userId)) throw creatorNotFound();
  return detail;
};

export const CreatorSearchService = { search, suggest, featured, getPublic };
