import type { Request } from "express";
import { StatusCodes } from "http-status-codes";
import config from "../../../config";
import ApiError from "../../../errors/ApiErrors";
import { CODE_PREFIX, nextCode } from "../../../shared/codeGenerator";
import { enqueueEmail } from "../../../shared/email";
import { emailTemplate } from "../../../shared/emailTemplates";
import { errorLogger } from "../../../shared/logger";
import { escapeRegex } from "../../../utils/regex";
import { AuditService, diffFields } from "../audit/audit.service";
import { ADMIN_INVITE_TTL_HOURS, AUTH_TOKEN_PURPOSE } from "../auth/auth.constant";
import { AuthTokenService } from "../auth/authToken.service";
import { SessionService } from "../auth/session.service";
import { ADMIN_ROLE, ADMIN_STATUS, AdminRole } from "./admin.constant";
import { ADMIN_PUBLIC_PROJECTION, toAdminDto } from "./admin.dto";
import { Admin } from "./admin.model";

/**
 * Admin team management (dashboard Team page, permission `team.manage` = super admin only).
 * Every change is written to the audit log.
 */

const adminNotFound = () => new ApiError(StatusCodes.NOT_FOUND, "Team member not found");
const NOT_DELETED = { deletedAt: null };

/** Refuses actions that would leave the platform without an active super admin. */
const assertNotLastSuperAdmin = async (targetId: string) => {
  const target = await Admin.findById(targetId).select("role status").lean();
  if (target?.role !== ADMIN_ROLE.superAdmin || target.status !== ADMIN_STATUS.active) return;
  const activeSuperAdmins = await Admin.countDocuments({ role: ADMIN_ROLE.superAdmin, status: ADMIN_STATUS.active, ...NOT_DELETED });
  if (activeSuperAdmins <= 1) {
    throw new ApiError(StatusCodes.CONFLICT, "There must be at least one active super admin");
  }
};

const assertNotSelf = (req: Request, targetId: string) => {
  if (req.admin!.id === targetId) throw new ApiError(StatusCodes.BAD_REQUEST, "You can't do this to your own account");
};

/** Signs the admin out everywhere and drops the cached auth state (role/status changes apply instantly). */
const forceRelogin = async (adminId: string) => {
  await Admin.updateOne({ _id: adminId }, { $inc: { tokenVersion: 1 } });
  await SessionService.revokeAll("admin", adminId, "admin_suspended");
  await SessionService.invalidateAuthState("admin", adminId);
};

const list = async (query: { role?: AdminRole; status?: string; q?: string }) => {
  const filter: Record<string, unknown> = { ...NOT_DELETED };
  if (query.role) filter.role = query.role;
  if (query.status) filter.status = query.status;
  if (query.q) {
    const pattern = new RegExp(escapeRegex(query.q), "i");
    filter.$or = [{ name: pattern }, { email: pattern }];
  }
  // Team size is small (tens), so no pagination is needed.
  const admins = await Admin.find(filter).select(ADMIN_PUBLIC_PROJECTION).sort({ createdAt: 1 }).lean();
  return admins.map(toAdminDto);
};

const sendInvite = async (req: Request, admin: { _id: unknown; email: string; name: string; role: string }) => {
  const rawToken = await AuthTokenService.issueLinkToken({
    subjectType: "admin",
    subjectId: admin._id,
    email: admin.email,
    purpose: AUTH_TOKEN_PURPOSE.adminInvite,
    ttlMinutes: ADMIN_INVITE_TTL_HOURS * 60,
    ip: req.ip,
  });
  const link = `${config.urls.dashboard}/accept-invite?token=${encodeURIComponent(rawToken)}`;
  await enqueueEmail(
      emailTemplate.adminInvite({
        to: admin.email,
        name: admin.name,
        invitedBy: req.admin!.name,
        role: admin.role,
        link,
        hours: ADMIN_INVITE_TTL_HOURS,
      }),
    )
    .catch((error) => errorLogger.error(`Admin invite email enqueue failed: ${error.message}`));
};

/** POST /admin/team/invite — creates an `invited` admin and emails a 48 h set-password link. */
const invite = async (req: Request, input: { name: string; email: string; role: AdminRole }) => {
  const existing = await Admin.findOne({ email: input.email }).select("status deletedAt").lean();
  if (existing && !existing.deletedAt && existing.status !== ADMIN_STATUS.invited) {
    throw new ApiError(StatusCodes.CONFLICT, "An admin with this email already exists");
  }

  // Re-inviting a pending / removed admin reuses the same document (email is unique).
  const admin = existing
    ? await Admin.findByIdAndUpdate(
        existing._id,
        {
          $set: { name: input.name, role: input.role, status: ADMIN_STATUS.invited, invitedBy: req.admin!.id },
          $unset: { deletedAt: 1, passwordHash: 1 },
        },
        { new: true },
      ).lean()
    : (
        await Admin.create({
          code: await nextCode(CODE_PREFIX.admin),
          email: input.email,
          name: input.name,
          role: input.role,
          status: ADMIN_STATUS.invited,
          invitedBy: req.admin!.id,
        })
      ).toObject();

  await sendInvite(req, admin!);
  await AuditService.record(req, {
    action: "team.invite",
    targetType: "admin",
    targetId: admin!._id,
    targetCode: admin!.code,
    after: { email: input.email, role: input.role },
  });
  return toAdminDto(admin!);
};

/** PATCH /admin/team/:id — name / email / role. Role change takes effect immediately. */
const update = async (req: Request, adminId: string, input: { name?: string; email?: string; role?: AdminRole }) => {
  const before = await Admin.findOne({ _id: adminId, ...NOT_DELETED }).select("name email role code").lean();
  if (!before) throw adminNotFound();
  if (input.role && input.role !== before.role) {
    assertNotSelf(req, adminId);
    await assertNotLastSuperAdmin(adminId);
  }
  if (input.email && input.email !== before.email && (await Admin.exists({ email: input.email, _id: { $ne: adminId } }))) {
    throw new ApiError(StatusCodes.CONFLICT, "An admin with this email already exists");
  }

  const updated = await Admin.findByIdAndUpdate(adminId, { $set: input }, { new: true, runValidators: true })
    .select(ADMIN_PUBLIC_PROJECTION)
    .lean();
  if (input.role && input.role !== before.role) await forceRelogin(adminId);
  else await SessionService.invalidateAuthState("admin", adminId);

  await AuditService.record(req, {
    action: "team.update",
    targetType: "admin",
    targetId: adminId,
    targetCode: before.code,
    ...diffFields(before, input),
  });
  return toAdminDto(updated!);
};

const setStatus = async (req: Request, adminId: string, status: "active" | "suspended") => {
  assertNotSelf(req, adminId);
  if (status === ADMIN_STATUS.suspended) await assertNotLastSuperAdmin(adminId);

  // Only toggles between active and suspended — an invited admin must accept the invite first.
  const from = status === ADMIN_STATUS.active ? ADMIN_STATUS.suspended : ADMIN_STATUS.active;
  const updated = await Admin.findOneAndUpdate({ _id: adminId, status: from, ...NOT_DELETED }, { $set: { status } }, { new: true })
    .select(ADMIN_PUBLIC_PROJECTION)
    .lean();
  if (!updated) throw new ApiError(StatusCodes.CONFLICT, `Team member is not ${from}`);

  if (status === ADMIN_STATUS.suspended) await forceRelogin(adminId);
  else await SessionService.invalidateAuthState("admin", adminId);

  await AuditService.record(req, {
    action: status === ADMIN_STATUS.suspended ? "team.suspend" : "team.activate",
    targetType: "admin",
    targetId: adminId,
    targetCode: updated.code,
    before: { status: from },
    after: { status },
  });
  return toAdminDto(updated);
};

/** DELETE /admin/team/:id — soft delete (audit logs keep referencing the admin). */
const remove = async (req: Request, adminId: string) => {
  assertNotSelf(req, adminId);
  await assertNotLastSuperAdmin(adminId);
  const removed = await Admin.findOneAndUpdate(
    { _id: adminId, ...NOT_DELETED },
    { $set: { deletedAt: new Date(), status: ADMIN_STATUS.suspended } },
  )
    .select("code email")
    .lean();
  if (!removed) throw adminNotFound();
  await forceRelogin(adminId);
  await AuditService.record(req, { action: "team.remove", targetType: "admin", targetId: adminId, targetCode: removed.code });
};

/** POST /admin/team/:id/resend-invite */
const resendInvite = async (req: Request, adminId: string) => {
  const admin = await Admin.findOne({ _id: adminId, status: ADMIN_STATUS.invited, ...NOT_DELETED })
    .select("email name role")
    .lean();
  if (!admin) throw new ApiError(StatusCodes.CONFLICT, "This member has already accepted the invite");
  await sendInvite(req, admin);
};

export const TeamService = { list, invite, update, setStatus, remove, resendInvite };
