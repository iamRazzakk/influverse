import type { Request } from "express";
import { StatusCodes } from "http-status-codes";
import ApiError from "../../../errors/ApiErrors";
import { CODE_PREFIX, nextCode } from "../../../shared/codeGenerator";
import { escapeRegex } from "../../../utils/regex";
import { withId, withIds } from "../../../utils/dto";
import { AuditService } from "../audit/audit.service";
import { CreatorProfile } from "../creator/creator.model";
import { CreatorService } from "../creator/creator.service";
import { NotificationService } from "../notification/notification.service";
import { UploadService } from "../upload/upload.service";
import { VERIFICATION_STATUS, VerificationRequest } from "./verification.model";

/**
 * Verified badge flow: creator applies → admins notified → admin approves / rejects → creator notified.
 * Review actions use conditional updates (`status: pending`), so two admins clicking at the same
 * time can't both process the same request.
 */

type ApplyInput = {
  platforms: { instagram?: string; tiktok?: string; youtube?: string };
  primaryPlatform?: "instagram" | "tiktok" | "youtube";
  followersTotal?: number;
  avgViews?: number;
  sampleWork?: { title?: string; url?: string; views?: number; fileId?: string };
  note?: string;
};

const DUPLICATE_KEY = 11000;

/** POST /me/verification-requests */
const apply = async (creatorId: string, input: ApplyInput) => {
  const profile = await CreatorProfile.findOne({ userId: creatorId })
    .select("name handle avatar country categories verified approvalStatus")
    .lean();
  if (!profile) throw new ApiError(StatusCodes.NOT_FOUND, "Creator profile not found");
  if (profile.verified) throw new ApiError(StatusCodes.CONFLICT, "You are already verified");
  if (profile.approvalStatus !== "approved") {
    throw new ApiError(StatusCodes.CONFLICT, "Your profile must be approved before applying for the badge");
  }

  const { fileId, ...sampleWork } = input.sampleWork ?? {};
  const sampleFile = fileId
    ? (await UploadService.resolveOwnFiles({ type: "user", id: creatorId }, [fileId], ["verification_sample", "portfolio"]))[0]
    : undefined;

  let request;
  try {
    request = await VerificationRequest.create({
      ...input,
      sampleWork: { ...sampleWork, ...(sampleFile && { file: sampleFile }) },
      code: await nextCode(CODE_PREFIX.verification),
      creatorId,
      creatorSnapshot: {
        name: profile.name,
        handle: profile.handle,
        avatar: profile.avatar,
        country: profile.country,
        categories: profile.categories,
      },
    });
  } catch (error: any) {
    // The partial unique index rejects a second pending request (also under concurrent submits).
    if (error?.code === DUPLICATE_KEY) throw new ApiError(StatusCodes.CONFLICT, "You already have a pending verification request");
    throw error;
  }

  await NotificationService.notifyAdmins(
    {
      type: "new_verification",
      title: "New verification request",
      body: `@${profile.handle} applied for the verified badge`,
      link: `/verification?request=${request._id}`,
      data: { requestId: String(request._id) },
    },
    { permission: "verification.manage" },
  );
  return withId(request.toObject());
};

/** GET /me/verification-requests/latest */
const latestForCreator = async (creatorId: string) => {
  const request = await VerificationRequest.findOne({ creatorId }).sort({ createdAt: -1 }).select("-creatorSnapshot").lean();
  return request ? withId(request) : null;
};

// ---------------------------------------------------------------------------
// Admin
// ---------------------------------------------------------------------------

const adminList = async (query: { status?: string; q?: string; page: number; limit: number }) => {
  const filter: Record<string, unknown> = {};
  if (query.status) filter.status = query.status;
  if (query.q) {
    const pattern = new RegExp(escapeRegex(query.q), "i");
    filter.$or = [{ code: pattern }, { "creatorSnapshot.name": pattern }, { "creatorSnapshot.handle": pattern }];
  }
  const [items, total, counts] = await Promise.all([
    VerificationRequest.find(filter)
      .sort({ createdAt: -1 })
      .skip((query.page - 1) * query.limit)
      .limit(query.limit)
      .lean(),
    VerificationRequest.countDocuments(filter),
    Promise.all(
      Object.values(VERIFICATION_STATUS).map(async (status) => [status, await VerificationRequest.countDocuments({ status })] as const),
    ),
  ]);
  return {
    items: withIds(items),
    meta: { page: query.page, limit: query.limit, total, totalPages: Math.ceil(total / query.limit), counts: Object.fromEntries(counts) },
  };
};

const adminGet = async (requestId: string) => {
  const request = await VerificationRequest.findById(requestId).lean();
  if (!request) throw new ApiError(StatusCodes.NOT_FOUND, "Verification request not found");
  return withId(request);
};

/** Moves a pending request to approved / rejected exactly once. */
const review = async (
  req: Request,
  requestId: string,
  decision: "approved" | "rejected",
  rejectionReason?: string,
) => {
  const reviewed = await VerificationRequest.findOneAndUpdate(
    { _id: requestId, status: VERIFICATION_STATUS.pending },
    {
      $set: {
        status: decision,
        reviewedBy: req.admin!.id,
        reviewedAt: new Date(),
        ...(rejectionReason && { rejectionReason }),
      },
    },
    { new: true },
  ).lean();
  if (!reviewed) throw new ApiError(StatusCodes.CONFLICT, "This request was already reviewed or does not exist");

  const creatorId = String(reviewed.creatorId);
  if (decision === "approved") {
    await CreatorProfile.updateOne({ userId: creatorId }, { $set: { verified: true } });
    await CreatorService.invalidate(creatorId, reviewed.creatorSnapshot?.handle);
  }

  await NotificationService.notifyUser(creatorId, {
    type: decision === "approved" ? "verification_approved" : "verification_rejected",
    title: decision === "approved" ? "You're verified! 🎉" : "Verification request not approved",
    body: decision === "approved" ? "The verified badge is now shown on your profile." : rejectionReason,
    link: "/creator/profile",
  });
  await AuditService.record(req, {
    action: decision === "approved" ? "verification.approve" : "verification.reject",
    targetType: "verification_request",
    targetId: reviewed._id,
    targetCode: reviewed.code,
    after: { status: decision },
    reason: rejectionReason,
  });
  return withId(reviewed);
};

export const VerificationService = { apply, latestForCreator, adminList, adminGet, review };
