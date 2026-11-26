import { Job } from "bullmq";
import { SessionService } from "../app/modules/auth/session.service";
import { CreatorProfile } from "../app/modules/creator/creator.model";
import { BrandProfile } from "../app/modules/brand/brand.model";
import { USER_STATUS } from "../app/modules/user/user.constant";
import { User } from "../app/modules/user/user.model";
import { CreatorService } from "../app/modules/creator/creator.service";
import { logger } from "../shared/logger";

/**
 * Queue `user` → `finalize-deactivation` (D14).
 * Grace period over → anonymize: wipe name / email / phone / avatar, disable login.
 * Order / ledger / review records are kept (snapshots retain the old name, legal record).
 */
export const finalizeDeactivation = async (job: Job<{ userId: string }>) => {
  const { userId } = job.data;
  const user = await User.findById(userId).select("status deactivation role").lean();
  // If cancelled, do nothing (idempotent)
  if (!user || user.status !== USER_STATUS.deactivationScheduled) return;
  if (user.deactivation?.scheduledFor && user.deactivation.scheduledFor > new Date()) return;

  await User.updateOne(
    { _id: userId },
    {
      $set: {
        status: USER_STATUS.deactivated,
        name: "Deleted user",
        email: `deleted+${userId}@deleted.influverse.invalid`,
        passwordHash: "!",
      },
      $unset: { phone: 1, avatar: 1, lastLoginIp: 1 },
      $inc: { tokenVersion: 1 },
    },
  );
  if (user.role === "creator") {
    await CreatorProfile.updateOne(
      { userId },
      {
        $set: { isSearchable: false, name: "Deleted user" },
        $unset: { avatar: 1, coverImage: 1, contactEmail: 1, contactPhone: 1, bio: 1, handle: 1 },
      },
    );
    await CreatorService.invalidate(userId);
  } else {
    await BrandProfile.updateOne({ userId }, { $unset: { logo: 1, coverImage: 1, vatNumber: 1, billingAddress: 1 } });
  }
  await SessionService.revokeAll("user", userId, "deactivated");
  await SessionService.invalidateAuthState("user", userId);
  logger.info(`User ${userId} deactivated + anonymised`);
};
