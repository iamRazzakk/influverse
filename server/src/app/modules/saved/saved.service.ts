import { StatusCodes } from "http-status-codes";
import ApiError from "../../../errors/ApiErrors";
import { CREATOR_CARD_PROJECTION, toCreatorCard } from "../creator/creator.mapper";
import { CreatorProfile } from "../creator/creator.model";
import { SavedCreator } from "./saved.model";

/** Brand bookmarks (docs/00-final-plan.md §5.5). */

/** PUT /me/saved-creators/:creatorId — idempotent: saving an already-saved creator is a no-op. */
const save = async (brandId: string, creatorId: string) => {
  if (!(await CreatorProfile.exists({ userId: creatorId, isSearchable: true }))) {
    throw new ApiError(StatusCodes.NOT_FOUND, "Creator not found");
  }
  // Upsert + unique index: concurrent double clicks can't create duplicates.
  await SavedCreator.updateOne({ brandId, creatorId }, { $setOnInsert: { brandId, creatorId } }, { upsert: true });
  return { creatorId, saved: true };
};

/** DELETE /me/saved-creators/:creatorId — idempotent as well. */
const unsave = async (brandId: string, creatorId: string) => {
  await SavedCreator.deleteOne({ brandId, creatorId });
  return { creatorId, saved: false };
};

/**
 * GET /me/saved-creators — creator cards, newest save first.
 * Two indexed queries instead of an aggregation `$lookup`: page of ids, then the cards by `$in`.
 */
const list = async (brandId: string, page: number, limit: number) => {
  const [saved, total] = await Promise.all([
    SavedCreator.find({ brandId })
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .select("creatorId createdAt")
      .lean(),
    SavedCreator.countDocuments({ brandId }),
  ]);

  const profiles = await CreatorProfile.find({ userId: { $in: saved.map((s) => s.creatorId) } })
    .select(`${CREATOR_CARD_PROJECTION} isSearchable`)
    .lean();
  const byCreatorId = new Map(profiles.map((p) => [String(p.userId), p]));

  const items = saved
    .map((s) => {
      const profile = byCreatorId.get(String(s.creatorId));
      // A creator who was suspended / deactivated after being saved is shown as unavailable.
      return profile ? { ...toCreatorCard(profile), savedAt: s.createdAt, available: Boolean(profile.isSearchable) } : null;
    })
    .filter(Boolean);

  return { items, meta: { page, limit, total, totalPages: Math.ceil(total / limit) } };
};

/** For creator cards / profile page: which of these creators has the brand saved? */
const savedIdsAmong = async (brandId: string, creatorIds: string[]) => {
  if (!creatorIds.length) return new Set<string>();
  const rows = await SavedCreator.find({ brandId, creatorId: { $in: creatorIds } }).select("creatorId").lean();
  return new Set(rows.map((r) => String(r.creatorId)));
};

export const SavedService = { save, unsave, list, savedIdsAmong };
