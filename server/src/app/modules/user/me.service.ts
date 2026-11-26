import { StatusCodes } from "http-status-codes";
import ApiError from "../../../errors/ApiErrors";
import { getQueue, QUEUES } from "../../../queues";
import { verifyPassword } from "../../../utils/password";
import { withId } from "../../../utils/dto";
import { SessionService } from "../auth/session.service";
import { BrandProfile } from "../brand/brand.model";
import { CreatorProfile } from "../creator/creator.model";
import { CreatorService } from "../creator/creator.service";
import { SettingsService } from "../settings/settings.service";
import { USER_ROLE, USER_STATUS } from "./user.constant";
import { toUserDto, USER_SELF_PROJECTION } from "./user.dto";
import { User } from "./user.model";

/** Logged-in brand / creator managing their own account (docs/00-final-plan.md §5.2). */

export const DEACTIVATION_JOB = "finalize-deactivation";
const deactivationJobId = (userId: string) => `deactivate:${userId}`;

const accountNotFound = () => new ApiError(StatusCodes.NOT_FOUND, "Account not found");

/** Splits a PATCH body into `$set` / `$unset` — `null` means "clear this field". */
const toPatchUpdate = (input: Record<string, unknown>) => {
  const $set: Record<string, unknown> = {};
  const $unset: Record<string, 1> = {};
  for (const [key, value] of Object.entries(input)) {
    if (value === undefined) continue;
    if (value === null) $unset[key] = 1;
    else $set[key] = value;
  }
  return { ...(Object.keys($set).length && { $set }), ...(Object.keys($unset).length && { $unset }) };
};

/** GET /me — account + role profile. Wallet summary and unread counts are added by later phases. */
const getMe = async (userId: string) => {
  const user = await User.findById(userId).select(USER_SELF_PROJECTION).lean();
  if (!user) throw accountNotFound();

  const profile =
    user.role === USER_ROLE.brand
      ? await BrandProfile.findOne({ userId }).lean()
      : await CreatorProfile.findOne({ userId }).select("-approvedBy").lean();

  return { user: toUserDto(user), profile: profile ? withId(profile) : null };
};

const updateMe = async (
  userId: string,
  input: { name?: string; phone?: string | null; avatar?: string | null; preferredLanguage?: string },
) => {
  const user = await User.findByIdAndUpdate(userId, toPatchUpdate(input), { new: true, runValidators: true })
    .select(USER_SELF_PROJECTION)
    .lean();
  if (!user) throw accountNotFound();

  // Creator name/avatar are copied into creator_profiles for search — keep them in sync.
  if (user.role === USER_ROLE.creator && (input.name !== undefined || input.avatar !== undefined)) {
    await CreatorService.syncFromUser(userId, { name: user.name, avatar: user.avatar ?? undefined });
  }
  if (input.name !== undefined) await SessionService.invalidateAuthState("user", userId);
  return toUserDto(user);
};

const updateNotificationPrefs = async (userId: string, prefs: Record<string, boolean | undefined>) => {
  // Dot-notation $set touches only the provided keys and leaves the others unchanged.
  const $set: Record<string, boolean> = {};
  for (const [key, value] of Object.entries(prefs)) {
    if (typeof value === "boolean") $set[`notificationPrefs.${key}`] = value;
  }
  const user = await User.findByIdAndUpdate(userId, { $set }, { new: true }).select("notificationPrefs").lean();
  if (!user) throw accountNotFound();
  return user.notificationPrefs;
};

/**
 * D14: schedules deactivation after the grace period. A delayed BullMQ job anonymises the
 * account later; cancelling removes the job. Profile is hidden from search during the grace period.
 */
const deactivate = async (userId: string, password: string, reason?: string) => {
  const user = await User.findById(userId).select("+passwordHash").lean();
  if (!user) throw accountNotFound();
  if (!(await verifyPassword(password, user.passwordHash))) {
    throw new ApiError(StatusCodes.BAD_REQUEST, "Password is incorrect");
  }

  const { deactivationGraceDays } = await SettingsService.getPlatform();
  const scheduledFor = new Date(Date.now() + deactivationGraceDays * 24 * 3600_000);

  // The status condition makes this idempotent: a second request finds no active account to update.
  const scheduled = await User.updateOne(
    { _id: userId, status: USER_STATUS.active },
    {
      $set: {
        status: USER_STATUS.deactivationScheduled,
        deactivation: { requestedAt: new Date(), scheduledFor, reason },
      },
    },
  );
  if (scheduled.modifiedCount !== 1) throw new ApiError(StatusCodes.CONFLICT, "Deactivation is already scheduled");

  await getQueue(QUEUES.user).add(
    DEACTIVATION_JOB,
    { userId },
    { jobId: deactivationJobId(userId), delay: scheduledFor.getTime() - Date.now() },
  );
  await SessionService.invalidateAuthState("user", userId);
  await CreatorService.recomputeSearchable(userId);
  return { scheduledFor };
};

const cancelDeactivation = async (userId: string) => {
  const user = await User.findOneAndUpdate(
    { _id: userId, status: USER_STATUS.deactivationScheduled },
    { $set: { status: USER_STATUS.active }, $unset: { deactivation: 1 } },
    { new: true },
  )
    .select(USER_SELF_PROJECTION)
    .lean();
  if (!user) throw new ApiError(StatusCodes.CONFLICT, "No scheduled deactivation");

  const job = await getQueue(QUEUES.user).getJob(deactivationJobId(userId));
  await job?.remove();
  await SessionService.invalidateAuthState("user", userId);
  await CreatorService.recomputeSearchable(userId);
  return toUserDto(user);
};

export const MeService = { getMe, updateMe, updateNotificationPrefs, deactivate, cancelDeactivation };
