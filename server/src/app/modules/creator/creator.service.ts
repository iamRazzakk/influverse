import { StatusCodes } from "http-status-codes";
import ApiError from "../../../errors/ApiErrors";
import { cache } from "../../../shared/cache";
import { withId } from "../../../utils/dto";
import { NotificationService } from "../notification/notification.service";
import { DEFAULT_PACKAGE } from "../package/package.constant";
import { Package } from "../package/package.model";
// Circular with package.service, safe because both sides only call each other inside functions.
import { PackageService } from "../package/package.service";
import { GalleryPhoto, PortfolioItem } from "../portfolio/portfolio.model";
import { USER_STATUS } from "../user/user.constant";
import { User } from "../user/user.model";
import { APPROVAL_STATUS, CREATOR_REQUIRED_FOR_ONBOARDING, SocialPlatform } from "./creator.constant";
import { summarisePlatforms } from "./creator.mapper";
import { CreatorProfile } from "./creator.model";

/**
 * Creator managing their own profile (docs/00-final-plan.md §5.4) plus the
 * "recompute" functions other modules call after creator content changes.
 * Public search / detail lives in creator.search.service.ts.
 */

const creatorNotFound = () => new ApiError(StatusCodes.NOT_FOUND, "Creator not found");

export const creatorCacheKeys = {
  publicDetail: (userId: string) => `creator:public:${userId}`,
  handleLookup: (handle: string) => `creator:handle:${handle}`,
  /** Tag attached to every cached entry about one creator. */
  tag: (userId: string) => `creator:${userId}`,
};

/**
 * Drops API cache entries for a creator and asks the website (Next.js) to revalidate its pages.
 * Call after anything visible on the public profile changes.
 */
const invalidate = async (userId: string, handle?: string | null) => {
  await cache.invalidate([creatorCacheKeys.tag(userId)], {
    websiteTags: ["creators", ...(handle ? [`creator:${handle}`] : [])],
  });
};

// ---------------------------------------------------------------------------
// Denormalised fields — recomputed after related data changes
// ---------------------------------------------------------------------------

/** A creator is listed publicly only when approved, active and onboarded. */
const recomputeSearchable = async (userId: string) => {
  const [profile, user] = await Promise.all([
    CreatorProfile.findOne({ userId }).select("approvalStatus handle").lean(),
    User.findById(userId).select("status onboardingCompleted").lean(),
  ]);
  if (!profile || !user) return;

  const isSearchable =
    profile.approvalStatus === APPROVAL_STATUS.approved &&
    user.status === USER_STATUS.active &&
    Boolean(user.onboardingCompleted);

  await CreatorProfile.updateOne({ userId }, { $set: { isSearchable } });
  await invalidate(userId, profile.handle);
};

/** startingPriceCents = cheapest active package (used for search sort / price filter). */
const recomputeStartingPrice = async (userId: string) => {
  const cheapest = await Package.findOne({ creatorId: userId, isArchived: false, isActive: true })
    .sort({ priceCents: 1 })
    .select("priceCents")
    .lean();
  await CreatorProfile.updateOne({ userId }, { $set: { startingPriceCents: cheapest?.priceCents ?? 0 } });
};

/** Profile completion % (docs/01 §4.2): base 50 + package 15 + ≥3 portfolio 15 + ≥2 socials 10 + ≥2 photos 10. */
const recomputeCompletion = async (userId: string) => {
  const [profile, packageCount, portfolioCount, photoCount] = await Promise.all([
    CreatorProfile.findOne({ userId }).select("platformKeys").lean(),
    Package.countDocuments({ creatorId: userId, isArchived: false }),
    PortfolioItem.countDocuments({ creatorId: userId }),
    GalleryPhoto.countDocuments({ creatorId: userId }),
  ]);
  if (!profile) return;

  const profileCompletion =
    50 +
    (packageCount > 0 ? 15 : 0) +
    (portfolioCount >= 3 ? 15 : 0) +
    ((profile.platformKeys?.length ?? 0) >= 2 ? 10 : 0) +
    (photoCount >= 2 ? 10 : 0);
  await CreatorProfile.updateOne({ userId }, { $set: { profileCompletion } });
};

/** One call for package / portfolio / gallery modules after they change something. */
const onContentChanged = async (userId: string) => {
  await Promise.all([recomputeStartingPrice(userId), recomputeCompletion(userId)]);
  const profile = await CreatorProfile.findOne({ userId }).select("handle").lean();
  await invalidate(userId, profile?.handle);
};

/** users.name / users.avatar are copied into creator_profiles so search needs no join. */
const syncFromUser = async (userId: string, data: { name?: string; avatar?: string }) => {
  const profile = await CreatorProfile.findOneAndUpdate({ userId }, { $set: data }, { new: true })
    .select("handle")
    .lean();
  await invalidate(userId, profile?.handle);
};

// ---------------------------------------------------------------------------
// Own profile (/me/creator-profile)
// ---------------------------------------------------------------------------

const getMine = async (userId: string) => {
  const profile = await CreatorProfile.findOne({ userId }).lean();
  if (!profile) throw creatorNotFound();
  return withId(profile);
};

const isHandleTaken = async (handle: string, exceptUserId?: string) =>
  Boolean(await CreatorProfile.exists({ handle, ...(exceptUserId && { userId: { $ne: exceptUserId } }) }));

const updateMine = async (userId: string, input: Record<string, unknown>) => {
  const { onboardingStep, ...fields } = input as Record<string, any>;

  const current = await CreatorProfile.findOne({ userId }).select("handle approvalStatus onboardingSubmittedAt").lean();
  if (!current) throw creatorNotFound();

  if (fields.handle && fields.handle !== current.handle && (await isHandleTaken(fields.handle, userId))) {
    throw new ApiError(StatusCodes.CONFLICT, "This handle is already taken");
  }

  const $set: Record<string, unknown> = {};
  const $unset: Record<string, 1> = {};
  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined) continue;
    if (value === null) $unset[key] = 1;
    else $set[key] = value;
  }
  // A creator who was asked for changes goes back to the review queue once they edit their profile.
  if (current.approvalStatus === APPROVAL_STATUS.actionRequired && current.onboardingSubmittedAt) {
    $set.approvalStatus = APPROVAL_STATUS.underReview;
  }

  const updated = await CreatorProfile.findOneAndUpdate(
    { userId },
    { ...(Object.keys($set).length && { $set }), ...(Object.keys($unset).length && { $unset }) },
    { new: true, runValidators: true },
  ).lean();

  if (onboardingStep) {
    // $lt guard: the step only moves forward, never back.
    await User.updateOne({ _id: userId, onboardingStep: { $lt: onboardingStep } }, { $set: { onboardingStep } });
  }

  await invalidate(userId, current.handle);
  if (current.handle && updated?.handle !== current.handle) await cache.del(creatorCacheKeys.handleLookup(current.handle));
  return withId(updated!);
};

/** Writes one platform and the derived search fields in a single atomic update. */
const writePlatforms = async (userId: string, platforms: Record<string, unknown>) => {
  const updated = await CreatorProfile.findOneAndUpdate(
    { userId },
    { $set: { platforms, ...summarisePlatforms(platforms as any) } },
    { new: true },
  )
    .select("platforms platformKeys followersTotal handle")
    .lean();
  if (!updated) throw creatorNotFound();
  await recomputeCompletion(userId);
  await invalidate(userId, updated.handle);
  return { platforms: updated.platforms, platformKeys: updated.platformKeys, followersTotal: updated.followersTotal };
};

const upsertPlatform = async (
  userId: string,
  platform: SocialPlatform,
  data: { handle: string; url?: string; followers: number; engagementRate: number; avgViews: number },
) => {
  const current = await CreatorProfile.findOne({ userId }).select("platforms").lean();
  if (!current) throw creatorNotFound();
  return writePlatforms(userId, {
    ...current.platforms,
    [platform]: { ...data, connected: false, lastSyncedAt: new Date() },
  });
};

const removePlatform = async (userId: string, platform: SocialPlatform) => {
  const current = await CreatorProfile.findOne({ userId }).select("platforms").lean();
  if (!current) throw creatorNotFound();
  const { [platform]: _removed, ...remaining } = (current.platforms ?? {}) as Record<string, unknown>;
  return writePlatforms(userId, remaining);
};

const isMissing = (value: unknown) =>
  value === undefined || value === null || value === "" || (Array.isArray(value) && value.length === 0);

/**
 * Submits onboarding: validates required fields, creates the default package if none exists,
 * puts the creator in the admin review queue and notifies admins (first submit only).
 */
const completeOnboarding = async (userId: string) => {
  const owner = await User.findById(userId).select("emailVerified").lean();
  if (!owner?.emailVerified) throw new ApiError(StatusCodes.FORBIDDEN, "Please verify your email before finishing onboarding");
  const profile = await CreatorProfile.findOne({ userId }).lean();
  if (!profile) throw creatorNotFound();

  const missing = CREATOR_REQUIRED_FOR_ONBOARDING.filter((field) => isMissing((profile as any)[field]));
  if (missing.length) throw new ApiError(StatusCodes.UNPROCESSABLE_ENTITY, `Please complete: ${missing.join(", ")}`);

  // Goes through PackageService so the package-slot counter stays correct.
  if (!(await Package.exists({ creatorId: userId, isArchived: false }))) {
    await PackageService.createPackage(userId, {
      ...DEFAULT_PACKAGE,
      platforms: [...DEFAULT_PACKAGE.platforms],
      inclusions: [...DEFAULT_PACKAGE.inclusions],
      popular: true,
      isActive: true,
    });
  }

  const isFirstSubmit = !profile.onboardingSubmittedAt;
  const nextApprovalStatus =
    profile.approvalStatus === APPROVAL_STATUS.approved ? APPROVAL_STATUS.approved : APPROVAL_STATUS.underReview;

  const updated = await CreatorProfile.findOneAndUpdate(
    { userId },
    { $set: { approvalStatus: nextApprovalStatus, onboardingSubmittedAt: profile.onboardingSubmittedAt ?? new Date() } },
    { new: true },
  ).lean();
  const user = await User.findByIdAndUpdate(userId, { $set: { onboardingCompleted: true, onboardingStep: 6 } }, { new: true })
    .select("name")
    .lean();

  await Promise.all([recomputeStartingPrice(userId), recomputeCompletion(userId), recomputeSearchable(userId)]);

  if (isFirstSubmit && nextApprovalStatus === APPROVAL_STATUS.underReview) {
    await NotificationService.notifyAdmins(
      {
        type: "new_creator_application",
        title: "New creator application",
        body: `${user?.name ?? "A creator"} (@${profile.handle}) submitted onboarding for review`,
        link: `/users?creator=${userId}`,
        data: { creatorId: userId },
      },
      { permission: "creators.approve" },
    );
  }
  return withId(updated!);
};

const handleAvailable = async (handle: string, exceptUserId?: string) => ({
  handle,
  available: !(await isHandleTaken(handle, exceptUserId)),
});

export const CreatorService = {
  getMine,
  updateMine,
  upsertPlatform,
  removePlatform,
  completeOnboarding,
  handleAvailable,
  syncFromUser,
  recomputeSearchable,
  recomputeStartingPrice,
  recomputeCompletion,
  onContentChanged,
  invalidate,
};
