import { StatusCodes } from "http-status-codes";
import config from "../../../config";
import ApiError from "../../../errors/ApiErrors";
import { enqueueEmail } from "../../../shared/email";
import { emailTemplate } from "../../../shared/emailTemplates";
import { jwtHelpers } from "../../../shared/jwt";
import { errorLogger } from "../../../shared/logger";
import { hashPassword, verifyPassword } from "../../../utils/password";
import { RequestMeta } from "../../../utils/requestMeta";
import { ADMIN_RESET_LINK_TTL_MIN, AUTH_TOKEN_PURPOSE } from "../auth/auth.constant";
import { AuthTokenService } from "../auth/authToken.service";
import { SessionService, TokenSubject } from "../auth/session.service";
import { LOCK_MINUTES, MAX_FAILED_LOGINS } from "../user/user.constant";
import { ADMIN_STATUS } from "./admin.constant";
import { ADMIN_PUBLIC_PROJECTION, toAdminDto } from "./admin.dto";
import { Admin } from "./admin.model";

/**
 * Dashboard authentication (docs/00-final-plan.md §5.12).
 * Same session/refresh design as users, but separate collection, JWT secret, audience and cookie (`art`).
 */

const invalidCredentials = () => new ApiError(StatusCodes.UNAUTHORIZED, "Invalid email or password");

const loadAdmin = async (adminId: unknown) => {
  const admin = await Admin.findById(adminId).select(ADMIN_PUBLIC_PROJECTION).lean();
  return admin ? toAdminDto(admin) : null;
};

const login = async (input: { email: string; password: string; rememberMe: boolean }, meta: RequestMeta) => {
  const admin = await Admin.findOne({ email: input.email, deletedAt: null })
    .select("+passwordHash +failedLoginCount +lockedUntil role status tokenVersion")
    .lean();

  if (admin?.lockedUntil && admin.lockedUntil > new Date()) {
    throw new ApiError(StatusCodes.TOO_MANY_REQUESTS, "Too many failed attempts. Try again later.");
  }

  const passwordOk = await verifyPassword(input.password, admin?.passwordHash);
  if (!admin || !passwordOk) {
    if (admin) {
      const failed = (admin.failedLoginCount ?? 0) + 1;
      await Admin.updateOne(
        { _id: admin._id },
        failed >= MAX_FAILED_LOGINS
          ? { $set: { failedLoginCount: 0, lockedUntil: new Date(Date.now() + LOCK_MINUTES * 60_000) } }
          : { $set: { failedLoginCount: failed } },
      );
    }
    throw invalidCredentials();
  }
  if (admin.status === ADMIN_STATUS.suspended) {
    throw new ApiError(StatusCodes.FORBIDDEN, "Your admin account is suspended");
  }
  if (admin.status !== ADMIN_STATUS.active) throw invalidCredentials();

  await Admin.updateOne(
    { _id: admin._id },
    { $set: { failedLoginCount: 0, lastLoginAt: new Date() }, $unset: { lockedUntil: 1 } },
  );
  const tokens = await SessionService.createSession("admin", admin, { rememberMe: input.rememberMe, meta });
  return { ...tokens, admin: await loadAdmin(admin._id) };
};

const refresh = (rawToken: string | undefined, meta: RequestMeta) =>
  SessionService.rotate("admin", rawToken, meta, async (adminId) => {
    const admin = await Admin.findOne({ _id: adminId, deletedAt: null }).select("role status tokenVersion").lean();
    if (!admin) return null;
    return { ...admin, canLogin: admin.status === ADMIN_STATUS.active } as TokenSubject & { canLogin: boolean };
  });

const logout = (sessionId: string) => SessionService.revoke(sessionId, "logout");

/** Always the same response so the endpoint can't be used to discover admin emails. */
const forgotPassword = async (email: string, ip?: string) => {
  const admin = await Admin.findOne({ email, status: ADMIN_STATUS.active, deletedAt: null }).select("name").lean();
  if (!admin) return;

  const rawToken = await AuthTokenService.issueLinkToken({
    subjectType: "admin",
    subjectId: admin._id,
    email,
    purpose: AUTH_TOKEN_PURPOSE.passwordResetLink,
    ttlMinutes: ADMIN_RESET_LINK_TTL_MIN,
    ip,
  });
  const link = `${config.urls.dashboard}/reset-password?token=${encodeURIComponent(rawToken)}`;
  await enqueueEmail(emailTemplate.adminPasswordReset({ to: email, name: admin.name, link, minutes: ADMIN_RESET_LINK_TTL_MIN }))
    .catch((error) => errorLogger.error(`Admin reset email enqueue failed: ${error.message}`));
};

const resetPassword = async (rawToken: string, password: string) => {
  const { subjectId } = await AuthTokenService.consumeLinkToken(rawToken, AUTH_TOKEN_PURPOSE.passwordResetLink);
  await Admin.updateOne(
    { _id: subjectId },
    { $set: { passwordHash: await hashPassword(password), failedLoginCount: 0 }, $unset: { lockedUntil: 1 }, $inc: { tokenVersion: 1 } },
  );
  await SessionService.revokeAll("admin", subjectId, "password_changed");
  await SessionService.invalidateAuthState("admin", subjectId);
};

/** Invited admin sets their name + password; the account becomes active and is logged in. */
const acceptInvite = async (rawToken: string, input: { name: string; password: string }, meta: RequestMeta) => {
  const { subjectId } = await AuthTokenService.consumeLinkToken(rawToken, AUTH_TOKEN_PURPOSE.adminInvite);

  const admin = await Admin.findOneAndUpdate(
    { _id: subjectId, status: ADMIN_STATUS.invited, deletedAt: null },
    { $set: { name: input.name, passwordHash: await hashPassword(input.password), status: ADMIN_STATUS.active, lastLoginAt: new Date() } },
    { new: true },
  )
    .select("role tokenVersion")
    .lean();
  if (!admin) throw new ApiError(StatusCodes.BAD_REQUEST, "This invitation is no longer valid");

  await SessionService.invalidateAuthState("admin", subjectId);
  const tokens = await SessionService.createSession("admin", admin, { rememberMe: true, meta });
  return { ...tokens, admin: await loadAdmin(admin._id) };
};

const getMe = async (adminId: string) => {
  const admin = await loadAdmin(adminId);
  if (!admin) throw new ApiError(StatusCodes.NOT_FOUND, "Admin not found");
  return admin;
};

const updateMe = async (adminId: string, input: { name?: string; avatar?: string | null }) => {
  const $set: Record<string, unknown> = {};
  if (input.name !== undefined) $set.name = input.name;
  if (input.avatar) $set.avatar = input.avatar;
  const update = { ...(Object.keys($set).length && { $set }), ...(input.avatar === null && { $unset: { avatar: 1 } }) };

  const admin = await Admin.findByIdAndUpdate(adminId, update, { new: true, runValidators: true })
    .select(ADMIN_PUBLIC_PROJECTION)
    .lean();
  if (!admin) throw new ApiError(StatusCodes.NOT_FOUND, "Admin not found");
  await SessionService.invalidateAuthState("admin", adminId);
  return toAdminDto(admin);
};

/** Keeps the current session, signs other devices out, returns a fresh access token. */
const changePassword = async (adminId: string, sessionId: string, currentPassword: string, newPassword: string) => {
  const admin = await Admin.findById(adminId).select("+passwordHash").lean();
  if (!admin || !(await verifyPassword(currentPassword, admin.passwordHash))) {
    throw new ApiError(StatusCodes.BAD_REQUEST, "Current password is incorrect");
  }
  const updated = await Admin.findOneAndUpdate(
    { _id: adminId },
    { $set: { passwordHash: await hashPassword(newPassword) }, $inc: { tokenVersion: 1 } },
    { new: true },
  )
    .select("role tokenVersion")
    .lean();

  await SessionService.revokeAll("admin", adminId, "password_changed", sessionId);
  await SessionService.invalidateAuthState("admin", adminId);
  return {
    accessToken: jwtHelpers.signAccess("admin", { sub: adminId, role: updated!.role, sid: sessionId, ver: updated!.tokenVersion ?? 0 }),
  };
};

export const AdminAuthService = { login, refresh, logout, forgotPassword, resetPassword, acceptInvite, getMe, updateMe, changePassword };
