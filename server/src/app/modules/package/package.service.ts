import { StatusCodes } from "http-status-codes";
import ApiError from "../../../errors/ApiErrors";
import { CODE_PREFIX, nextCode } from "../../../shared/codeGenerator";
import { decrementCounter, incrementWithinLimit } from "../../../shared/db";
import { withId, withIds } from "../../../utils/dto";
import { CreatorProfile } from "../creator/creator.model";
import { CreatorService } from "../creator/creator.service";
import { SettingsService } from "../settings/settings.service";
import { derivePackageType, UsageRights } from "./package.constant";
import { Package } from "./package.model";

/**
 * Creator rate card — max 3 packages per creator (D25), each can be toggled active / inactive.
 * Inactive packages stay visible to the creator but are hidden from brands and can't be ordered.
 * "Delete" archives the package so existing orders keep their reference.
 *
 * No transactions here (small CRUD): the package limit is enforced by an atomic conditional
 * `$inc` on the creator profile, and the slot is handed back if the insert fails.
 */

export type PackageInput = {
  title: string;
  description?: string;
  platforms: string[];
  priceCents: number;
  deliveryDays: number;
  revisions: number;
  inclusions: string[];
  usageRights: UsageRights;
  popular: boolean;
  isActive: boolean;
};

const packageNotFound = () => new ApiError(StatusCodes.NOT_FOUND, "Package not found");
const ownLivePackage = (creatorId: string, packageId: string) => ({ _id: packageId, creatorId, isArchived: false });

/** Only one "popular" package per creator. */
const clearOtherPopular = (creatorId: string, keepPackageId: unknown) =>
  Package.updateMany({ creatorId, _id: { $ne: keepPackageId }, popular: true }, { $set: { popular: false } });

const listMine = async (creatorId: string) =>
  withIds(await Package.find({ creatorId, isArchived: false }).sort({ sortOrder: 1, createdAt: 1 }).lean());

/** Used by POST /me/packages, duplicate, and onboarding (default package). */
const createPackage = async (creatorId: string, input: PackageInput) => {
  const { maxPackagesPerCreator } = await SettingsService.getPlatform();
  await incrementWithinLimit(
    CreatorProfile,
    { userId: creatorId },
    "packageCount",
    maxPackagesPerCreator,
    `You can have at most ${maxPackagesPerCreator} packages. Remove or edit an existing one first.`,
  );

  let created;
  try {
    created = await Package.create({
      ...input,
      code: await nextCode(CODE_PREFIX.package),
      creatorId,
      type: derivePackageType(input.platforms),
      sortOrder: await Package.countDocuments({ creatorId, isArchived: false }),
    });
  } catch (error) {
    await decrementCounter(CreatorProfile, { userId: creatorId }, "packageCount"); // give the slot back
    throw error;
  }

  if (input.popular) await clearOtherPopular(creatorId, created._id);
  await CreatorService.onContentChanged(creatorId);
  return withId(created.toObject());
};

const updatePackage = async (creatorId: string, packageId: string, input: Partial<PackageInput>) => {
  const $set: Record<string, unknown> = { ...input };
  if (input.platforms) $set.type = derivePackageType(input.platforms);

  const updated = await Package.findOneAndUpdate(ownLivePackage(creatorId, packageId), { $set }, { new: true, runValidators: true }).lean();
  if (!updated) throw packageNotFound();

  if (input.popular) await clearOtherPopular(creatorId, updated._id);
  await CreatorService.onContentChanged(creatorId);
  return withId(updated);
};

/** DELETE /me/packages/:id — archive (orders keep pointing at it) and free the slot. */
const archivePackage = async (creatorId: string, packageId: string) => {
  // The `isArchived: false` condition makes a double delete a no-op, so the slot is freed only once.
  const archived = await Package.findOneAndUpdate(
    ownLivePackage(creatorId, packageId),
    { $set: { isArchived: true, isActive: false, popular: false } },
  )
    .select("_id")
    .lean();
  if (!archived) throw packageNotFound();

  await decrementCounter(CreatorProfile, { userId: creatorId }, "packageCount");
  await CreatorService.onContentChanged(creatorId);
};

/** POST /me/packages/:id/duplicate — copies the package as a new, non-popular one. */
const duplicatePackage = async (creatorId: string, packageId: string) => {
  const source = await Package.findOne(ownLivePackage(creatorId, packageId)).lean();
  if (!source) throw packageNotFound();
  return createPackage(creatorId, {
    title: `${source.title} (Copy)`.slice(0, 100),
    description: source.description ?? undefined,
    platforms: source.platforms as string[],
    priceCents: source.priceCents,
    deliveryDays: source.deliveryDays,
    revisions: source.revisions ?? 2,
    inclusions: source.inclusions ?? [],
    usageRights: (source.usageRights ?? "organic_30d") as UsageRights,
    popular: false,
    isActive: source.isActive ?? true,
  });
};

/** PATCH /me/packages/reorder — `ids` in display order, one bulkWrite round-trip. */
const reorderPackages = async (creatorId: string, ids: string[]) => {
  await Package.bulkWrite(
    ids.map((id, index) => ({
      updateOne: { filter: { _id: id, creatorId, isArchived: false }, update: { $set: { sortOrder: index } } },
    })),
  );
  await CreatorService.onContentChanged(creatorId);
  return listMine(creatorId);
};

/**
 * For order creation (Phase 3): returns the package only if brands may buy it right now.
 * Accepts the order transaction's session so the check and the order insert see the same snapshot.
 */
const getOrderablePackage = async (packageId: string, session?: import("mongoose").ClientSession) => {
  const pkg = await Package.findOne({ _id: packageId, isArchived: false, isActive: true }).session(session ?? null).lean();
  if (!pkg) throw new ApiError(StatusCodes.NOT_FOUND, "This package is not available");
  return pkg;
};

export const PackageService = {
  listMine,
  createPackage,
  updatePackage,
  archivePackage,
  duplicatePackage,
  reorderPackages,
  getOrderablePackage,
};
