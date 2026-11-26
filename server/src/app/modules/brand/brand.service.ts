import { StatusCodes } from "http-status-codes";
import ApiError from "../../../errors/ApiErrors";
import { cache, TTL } from "../../../shared/cache";
import { isObjectId } from "../../../shared/db";
import { User } from "../user/user.model";
import { USER_STATUS } from "../user/user.constant";
import { BRAND_REQUIRED_FOR_ONBOARDING } from "./brand.constant";
import { BrandProfile } from "./brand.model";

const notFound = () => new ApiError(StatusCodes.NOT_FOUND, "Brand not found");

const invalidate = (userId: string, slug?: string) =>
  cache.invalidate([`brand:${userId}`, ...(slug ? [`brand:slug:${slug}`] : [])], { websiteTags: slug ? [`brand:${slug}`] : [] });

const getMine = async (userId: string) => {
  const profile = await BrandProfile.findOne({ userId }).lean();
  if (!profile) throw notFound();
  return profile;
};

const updateMine = async (userId: string, input: Record<string, unknown>) => {
  const { onboardingStep, ...fields } = input as Record<string, any>;
  const $set: Record<string, unknown> = {};
  const $unset: Record<string, 1> = {};
  for (const [k, v] of Object.entries(fields)) {
    if (v === undefined) continue;
    if (v === null) $unset[k] = 1;
    else $set[k] = v;
  }
  const profile = await BrandProfile.findOneAndUpdate(
    { userId },
    { ...(Object.keys($set).length ? { $set } : {}), ...(Object.keys($unset).length ? { $unset } : {}) },
    { new: true, runValidators: true },
  ).lean();
  if (!profile) throw notFound();

  if (onboardingStep) {
    await User.updateOne({ _id: userId, onboardingStep: { $lt: onboardingStep } }, { $set: { onboardingStep } });
  }
  await invalidate(userId, profile.slug);
  return profile;
};

const completeOnboarding = async (userId: string) => {
  const owner = await User.findById(userId).select("emailVerified").lean();
  if (!owner?.emailVerified) throw new ApiError(StatusCodes.FORBIDDEN, "Please verify your email before finishing onboarding");
  const profile = await getMine(userId);
  const missing = BRAND_REQUIRED_FOR_ONBOARDING.filter((f) => !profile[f]);
  if (missing.length) throw new ApiError(StatusCodes.UNPROCESSABLE_ENTITY, `Please complete: ${missing.join(", ")}`);
  await User.updateOne({ _id: userId }, { $set: { onboardingCompleted: true, onboardingStep: 6 } });
  return profile;
};

/** GET /brands/:slug (id also works) — public brand page, 5 min cache */
const getPublic = async (slugOrId: string) => {
  const filter = isObjectId(slugOrId) ? { userId: slugOrId } : { slug: slugOrId.toLowerCase() };
  const data = await cache.wrap(
    `brand:public:${slugOrId.toLowerCase()}`,
    TTL.creatorPublic,
    async () => {
      const profile = await BrandProfile.findOne(filter)
        .select("-vatNumber -billingAddress")
        .lean();
      if (!profile) return null;
      const user = await User.findById(profile.userId).select("name avatar status").lean();
      if (!user || user.status !== USER_STATUS.active) return null;
      return { ...profile, id: String(profile.userId), contactName: user.name, avatar: user.avatar ?? null };
    },
    [isObjectId(slugOrId) ? `brand:${slugOrId}` : `brand:slug:${slugOrId.toLowerCase()}`],
  );
  if (!data) throw notFound();
  return data;
};

export const BrandService = { getMine, updateMine, completeOnboarding, getPublic, invalidate };
