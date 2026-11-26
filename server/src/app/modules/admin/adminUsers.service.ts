import type { Request } from "express";
import { StatusCodes } from "http-status-codes";
import ApiError from "../../../errors/ApiErrors";
import { JOB } from "../../../jobs/jobNames";
import { getQueue, QUEUES } from "../../../queues";
import { AuditService } from "../audit/audit.service";
import { SessionService } from "../auth/session.service";
import { BrandProfile } from "../brand/brand.model";
import { APPROVAL_STATUS } from "../creator/creator.constant";
import { CreatorProfile } from "../creator/creator.model";
import { CreatorService } from "../creator/creator.service";
import { NotificationService } from "../notification/notification.service";
import { USER_ROLE, USER_STATUS } from "../user/user.constant";
import { User } from "../user/user.model";

/**
 * Dashboard → Users page + creator approval queue (docs/00-final-plan.md §5.12).
 * Every write is audited and uses conditional updates so concurrent admin actions don't clash.
 */

export type UserListQuery = {
  role?: "brand" | "creator";
  status?: string;
  approval?: string;
  q?: string;
  sort: "recent" | "oldest" | "volume_desc" | "volume_asc" | "deals_desc" | "deals_asc" | "name_asc" | "name_desc";
  page: number;
  limit: number;
};

/** Each sort maps onto one of the compound indexes on `users`. */
const SORTS: Record<UserListQuery["sort"], Record<string, 1 | -1>> = {
  recent: { createdAt: -1, _id: -1 },
  oldest: { createdAt: 1, _id: 1 },
  volume_desc: { "stats.totalVolumeCents": -1, _id: 1 },
  volume_asc: { "stats.totalVolumeCents": 1, _id: 1 },
  deals_desc: { "stats.ordersCount": -1, _id: 1 },
  deals_asc: { "stats.ordersCount": 1, _id: 1 },
  name_asc: { name: 1, _id: 1 },
  name_desc: { name: -1, _id: 1 },
};

const USER_LIST_PROJECTION = "code email name avatar role status ban createdAt lastLoginAt stats";

const userNotFound = () => new ApiError(StatusCodes.NOT_FOUND, "User not found");

/** Profile fields shown in the users table, loaded with two `$in` queries (no aggregation). */
const loadProfiles = async (userIds: unknown[]) => {
  const [brands, creators] = await Promise.all([
    BrandProfile.find({ userId: { $in: userIds } }).select("userId companyName country city industry verified").lean(),
    CreatorProfile.find({ userId: { $in: userIds } })
      .select("userId handle country city categories verified approvalStatus rating")
      .lean(),
  ]);
  return {
    brandByUser: new Map(brands.map((b) => [String(b.userId), b])),
    creatorByUser: new Map(creators.map((c) => [String(c.userId), c])),
  };
};

const toAdminUserRow = (user: Record<string, any>, profiles: Awaited<ReturnType<typeof loadProfiles>>) => {
  const brand = profiles.brandByUser.get(String(user._id));
  const creator = profiles.creatorByUser.get(String(user._id));
  const location = [creator?.city ?? brand?.city, creator?.country ?? brand?.country].filter(Boolean).join(", ");
  return {
    id: String(user._id),
    code: user.code,
    name: user.name,
    email: user.email,
    avatar: user.avatar ?? null,
    role: user.role,
    status: user.status,
    handle: creator?.handle ?? null,
    companyName: brand?.companyName ?? null,
    category: creator?.categories?.[0] ?? brand?.industry ?? null,
    approvalStatus: creator?.approvalStatus ?? null,
    isVerified: Boolean(creator?.verified ?? brand?.verified),
    rating: creator?.rating ?? null,
    location,
    totalVolumeCents: user.stats?.totalVolumeCents ?? 0,
    ordersCount: user.stats?.ordersCount ?? 0,
    ban: user.ban ?? null,
    joinedAt: user.createdAt,
    lastLoginAt: user.lastLoginAt ?? null,
  };
};

/** GET /admin/users */
const list = async (query: UserListQuery) => {
  const filter: Record<string, unknown> = {};
  if (query.role) filter.role = query.role;
  if (query.status) filter.status = query.status;

  // Creator approval queue filter lives on creator_profiles → resolve to user ids first (indexed).
  if (query.approval) {
    const creatorIds = await CreatorProfile.find({ approvalStatus: query.approval }).select("userId").lean();
    filter._id = { $in: creatorIds.map((c) => c.userId) };
  }

  if (query.q) {
    const term = query.q.trim();
    // Exact code lookup (USR-10042) hits the unique index; anything else uses the `user_text`
    // index — never an unanchored regex, which would scan all users.
    if (/^USR-\d+$/i.test(term)) filter.code = term.toUpperCase();
    else filter.$text = { $search: term };
  }

  const [users, total] = await Promise.all([
    User.find(filter)
      .select(USER_LIST_PROJECTION)
      .sort(SORTS[query.sort])
      .skip((query.page - 1) * query.limit)
      .limit(query.limit)
      .lean(),
    User.countDocuments(filter),
  ]);
  const profiles = await loadProfiles(users.map((u) => u._id));

  return {
    items: users.map((u) => toAdminUserRow(u, profiles)),
    meta: { page: query.page, limit: query.limit, total, totalPages: Math.ceil(total / query.limit) },
  };
};

/** GET /admin/users/:id */
const getOne = async (userId: string) => {
  const user = await User.findById(userId).select(`${USER_LIST_PROJECTION} phone emailVerified onboardingCompleted deactivation`).lean();
  if (!user) throw userNotFound();
  const profile =
    user.role === USER_ROLE.brand
      ? await BrandProfile.findOne({ userId }).lean()
      : await CreatorProfile.findOne({ userId }).lean();
  const profiles = await loadProfiles([user._id]);
  return { ...toAdminUserRow(user, profiles), phone: user.phone ?? null, onboardingCompleted: user.onboardingCompleted, profile };
};

const liftSuspensionJobId = (userId: string) => `lift-suspension:${userId}`;

type SuspendInput = {
  actionType: "warning" | "temporary" | "permanent";
  reason: string;
  escrowDisposition: "hold" | "refund";
  notes?: string;
  until?: Date;
};

/** POST /admin/users/:id/suspend */
const suspend = async (req: Request, userId: string, input: SuspendInput) => {
  const user = await User.findById(userId).select("code status role").lean();
  if (!user) throw userNotFound();

  // A warning only informs the user — the account keeps working.
  if (input.actionType === "warning") {
    await NotificationService.notifyUser(userId, {
      type: "account_suspended",
      title: "Warning from INFLUVERSE",
      body: input.reason,
    });
    await AuditService.record(req, { action: "user.suspend", targetType: "user", targetId: userId, targetCode: user.code, after: { actionType: "warning" }, reason: input.reason });
    return { status: user.status, actionType: "warning" };
  }

  if (input.actionType === "temporary" && (!input.until || input.until <= new Date())) {
    throw new ApiError(StatusCodes.BAD_REQUEST, "A temporary suspension needs a future end date");
  }

  // Conditional update: only active (or scheduled-for-deactivation) accounts can be suspended.
  const suspended = await User.findOneAndUpdate(
    { _id: userId, status: { $in: [USER_STATUS.active, USER_STATUS.deactivationScheduled] } },
    {
      $set: {
        status: USER_STATUS.suspended,
        ban: {
          type: input.actionType,
          reason: input.reason,
          escrowDisposition: input.escrowDisposition,
          notes: input.notes,
          until: input.actionType === "temporary" ? input.until : undefined,
          bannedBy: req.admin!.id,
          bannedAt: new Date(),
        },
      },
      $inc: { tokenVersion: 1 }, // every access token stops working immediately
    },
    { new: true },
  )
    .select("status ban")
    .lean();
  if (!suspended) throw new ApiError(StatusCodes.CONFLICT, "User is already suspended or deactivated");

  await SessionService.revokeAll("user", userId, "admin_suspended");
  await SessionService.invalidateAuthState("user", userId);
  if (user.role === USER_ROLE.creator) await CreatorService.recomputeSearchable(userId);

  if (input.actionType === "temporary") {
    await getQueue(QUEUES.user).add(
      JOB.liftSuspension,
      { userId },
      { jobId: liftSuspensionJobId(userId), delay: input.until!.getTime() - Date.now() },
    );
  }

  // Phase 3: escrowDisposition = "refund" → refund the brand's held escrows via the payment queue.

  await NotificationService.notifyUser(userId, {
    type: "account_suspended",
    title: "Your account has been suspended",
    body: input.reason,
  });
  await AuditService.record(req, {
    action: "user.suspend",
    targetType: "user",
    targetId: userId,
    targetCode: user.code,
    before: { status: user.status },
    after: { status: USER_STATUS.suspended, actionType: input.actionType, until: input.until },
    reason: input.reason,
  });
  return suspended;
};

/** Shared by POST /admin/users/:id/reactivate and the lift-suspension job. */
const liftSuspension = async (userId: string) => {
  const reactivated = await User.findOneAndUpdate(
    { _id: userId, status: USER_STATUS.suspended },
    { $set: { status: USER_STATUS.active }, $unset: { ban: 1 } },
    { new: true },
  )
    .select("code role")
    .lean();
  if (!reactivated) return null;

  await SessionService.invalidateAuthState("user", userId);
  if (reactivated.role === USER_ROLE.creator) await CreatorService.recomputeSearchable(userId);
  return reactivated;
};

const reactivate = async (req: Request, userId: string) => {
  const reactivated = await liftSuspension(userId);
  if (!reactivated) throw new ApiError(StatusCodes.CONFLICT, "User is not suspended");

  const pendingLift = await getQueue(QUEUES.user).getJob(liftSuspensionJobId(userId));
  await pendingLift?.remove();

  await AuditService.record(req, {
    action: "user.reactivate",
    targetType: "user",
    targetId: userId,
    targetCode: reactivated.code,
    before: { status: USER_STATUS.suspended },
    after: { status: USER_STATUS.active },
  });
  return { status: USER_STATUS.active };
};

// ---------------------------------------------------------------------------
// Creator approval queue
// ---------------------------------------------------------------------------

/** POST /admin/creators/:id/approve and /action-required */
const reviewCreator = async (req: Request, creatorId: string, decision: "approved" | "action_required", note?: string) => {
  const updated = await CreatorProfile.findOneAndUpdate(
    // Only creators who submitted onboarding and aren't already in that state.
    { userId: creatorId, onboardingSubmittedAt: { $ne: null }, approvalStatus: { $ne: decision } },
    {
      $set: {
        approvalStatus: decision,
        ...(decision === APPROVAL_STATUS.approved
          ? { approvedBy: req.admin!.id, approvedAt: new Date() }
          : { approvalNote: note }),
      },
      ...(decision === APPROVAL_STATUS.approved && { $unset: { approvalNote: 1 } }),
    },
    { new: true },
  )
    .select("handle approvalStatus")
    .lean();
  if (!updated) throw new ApiError(StatusCodes.CONFLICT, "Creator not found, not submitted yet, or already in this state");

  await CreatorService.recomputeSearchable(creatorId);
  await NotificationService.notifyUser(
    creatorId,
    decision === APPROVAL_STATUS.approved
      ? { type: "creator_approved", title: "Your profile is live! 🎉", body: "Brands can now find and hire you.", link: "/creator/dashboard" }
      : { type: "creator_action_required", title: "Your profile needs a few changes", body: note, link: "/creator/profile" },
    { email: "offers" },
  );
  await AuditService.record(req, {
    action: decision === APPROVAL_STATUS.approved ? "creator.approve" : "creator.action_required",
    targetType: "user",
    targetId: creatorId,
    targetCode: updated.handle ?? undefined,
    after: { approvalStatus: decision },
    reason: note,
  });
  return updated;
};

/** POST /admin/creators/:id/feature — homepage "featured creators" toggle. */
const setFeatured = async (req: Request, creatorId: string, isFeatured: boolean) => {
  const updated = await CreatorProfile.findOneAndUpdate({ userId: creatorId }, { $set: { isFeatured } }, { new: true })
    .select("handle isFeatured")
    .lean();
  if (!updated) throw userNotFound();
  await CreatorService.invalidate(creatorId, updated.handle);
  await AuditService.record(req, { action: "creator.feature", targetType: "user", targetId: creatorId, after: { isFeatured } });
  return updated;
};

export const AdminUsersService = { list, getOne, suspend, reactivate, liftSuspension, reviewCreator, setFeatured };
