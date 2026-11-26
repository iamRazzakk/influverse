import { StatusCodes } from "http-status-codes";
import ApiError from "../../../errors/ApiErrors";
import { CODE_PREFIX, nextCode } from "../../../shared/codeGenerator";
import { withTransaction } from "../../../shared/db";
import { enqueueEmail } from "../../../shared/email";
import { emailTemplate } from "../../../shared/emailTemplates";
import { jwtHelpers } from "../../../shared/jwt";
import { errorLogger } from "../../../shared/logger";
import { safeEqual, sha256 } from "../../../utils/crypto";
import generateOTP from "../../../utils/otp";
import { hashPassword, verifyPassword } from "../../../utils/password";
import { RequestMeta } from "../../../utils/requestMeta";
import { uniqueSlug } from "../../../utils/slug";
import { BrandProfile } from "../brand/brand.model";
import { CreatorProfile } from "../creator/creator.model";
import { LOCK_MINUTES, LOGIN_ALLOWED_STATUSES, MAX_FAILED_LOGINS, USER_ROLE, USER_STATUS, UserRole } from "../user/user.constant";
import { toUserDto, USER_SELF_PROJECTION } from "../user/user.dto";
import { User } from "../user/user.model";
import { AUTH_TOKEN_PURPOSE, OTP_MAX_ATTEMPTS, OTP_RESEND_COOLDOWN_SEC, OTP_TTL_MIN, SOCKET_TICKET_TTL_SEC } from "./auth.constant";
import type { AuthUser } from "../../../types";
import { AuthToken } from "./authToken.model";
import { SessionService, TokenSubject } from "./session.service";

/**
 * Brand / creator authentication (docs/00-final-plan.md §5.1).
 * Admin authentication lives in the admin module and reuses SessionService.
 */

const invalidCredentials = () => new ApiError(StatusCodes.UNAUTHORIZED, "Invalid email or password");
const invalidCode = () => new ApiError(StatusCodes.BAD_REQUEST, "Invalid or expired code");
const resetExpired = () => new ApiError(StatusCodes.BAD_REQUEST, "Reset link expired. Please request a new code.");

const loadSelf = async (userId: unknown) => {
  const user = await User.findById(userId).select(USER_SELF_PROJECTION).lean();
  return user ? toUserDto(user) : null;
};

/** Creates the account and its empty role profile in one transaction, then logs the user in. */
const register = async (
  input: { role: UserRole; name: string; email: string; password: string; phone?: string; rememberMe: boolean },
  meta: RequestMeta,
) => {
  // D1: one email = one role. The unique index also guards this; the early check gives a clean message.
  if (await User.exists({ email: input.email })) {
    throw new ApiError(StatusCodes.CONFLICT, "An account with this email already exists");
  }
  const passwordHash = await hashPassword(input.password); // hash outside the transaction (CPU heavy)

  const createdUser = await withTransaction(async (session) => {
    const [user] = await User.create(
      [
        {
          code: await nextCode(CODE_PREFIX.user, session),
          email: input.email,
          passwordHash,
          role: input.role,
          name: input.name,
          phone: input.phone,
          lastLoginAt: new Date(),
          lastLoginIp: meta.ip,
        },
      ],
      { session },
    );

    if (input.role === USER_ROLE.brand) {
      const slug = await uniqueSlug(input.name, async (candidate) =>
        Boolean(await BrandProfile.exists({ slug: candidate }).session(session)),
      );
      await BrandProfile.create([{ userId: user._id, slug }], { session });
    } else {
      await CreatorProfile.create([{ userId: user._id, name: input.name }], { session });
    }
    return { _id: user._id, role: user.role, tokenVersion: user.tokenVersion };
  });

  const tokens = await SessionService.createSession("user", createdUser, { rememberMe: input.rememberMe, meta });

  // Email verification code. A failure here must not break signup — the user can press "resend".
  await issueOtp(AUTH_TOKEN_PURPOSE.emailVerify, { _id: createdUser._id, name: input.name }, input.email, meta.ip).catch(
    (error) => errorLogger.error(`Verification email failed: ${error.message}`),
  );
  return { ...tokens, user: await loadSelf(createdUser._id) };
};

/** Records a failed attempt; after MAX_FAILED_LOGINS the account is locked for LOCK_MINUTES. */
const recordFailedLogin = (userId: unknown, failedSoFar: number) => {
  const failed = failedSoFar + 1;
  return User.updateOne(
    { _id: userId },
    failed >= MAX_FAILED_LOGINS
      ? { $set: { failedLoginCount: 0, lockedUntil: new Date(Date.now() + LOCK_MINUTES * 60_000) } }
      : { $set: { failedLoginCount: failed } },
  );
};

const login = async (input: { email: string; password: string; rememberMe: boolean }, meta: RequestMeta) => {
  const user = await User.findOne({ email: input.email })
    .select("+passwordHash +failedLoginCount +lockedUntil role status tokenVersion")
    .lean();

  if (user?.lockedUntil && user.lockedUntil > new Date()) {
    throw new ApiError(StatusCodes.TOO_MANY_REQUESTS, "Too many failed attempts. Try again later.");
  }

  // verifyPassword runs a dummy bcrypt when the user doesn't exist, so timing doesn't reveal valid emails.
  const passwordOk = await verifyPassword(input.password, user?.passwordHash);
  if (!user || !passwordOk) {
    if (user) await recordFailedLogin(user._id, user.failedLoginCount ?? 0);
    throw invalidCredentials();
  }

  if (user.status === USER_STATUS.suspended) {
    throw new ApiError(StatusCodes.FORBIDDEN, "Your account is suspended. Please contact support.");
  }
  if (!LOGIN_ALLOWED_STATUSES.includes(user.status)) throw invalidCredentials();

  await User.updateOne(
    { _id: user._id },
    { $set: { failedLoginCount: 0, lastLoginAt: new Date(), lastLoginIp: meta.ip }, $unset: { lockedUntil: 1 } },
  );

  const tokens = await SessionService.createSession("user", user, { rememberMe: input.rememberMe, meta });
  return { ...tokens, user: await loadSelf(user._id) };
};

const refresh = (rawToken: string | undefined, meta: RequestMeta) =>
  SessionService.rotate("user", rawToken, meta, async (userId) => {
    const user = await User.findById(userId).select("role status tokenVersion").lean();
    if (!user) return null;
    return { ...user, canLogin: LOGIN_ALLOWED_STATUSES.includes(user.status) } as TokenSubject & { canLogin: boolean };
  });

const logout = (sessionId: string) => SessionService.revoke(sessionId, "logout");

/** Bumping tokenVersion invalidates every access token immediately, on all devices. */
const logoutAll = async (userId: string) => {
  await User.updateOne({ _id: userId }, { $inc: { tokenVersion: 1 } });
  await SessionService.revokeAll("user", userId, "logout_all");
  await SessionService.invalidateAuthState("user", userId);
};

type OtpPurpose = typeof AUTH_TOKEN_PURPOSE.passwordResetOtp | typeof AUTH_TOKEN_PURPOSE.emailVerify;

/**
 * Creates a new 6-digit code for `purpose` and queues the email. Older unused codes are cancelled,
 * so only the newest one works. Returns false (and sends nothing) during the resend cooldown.
 */
const issueOtp = async (purpose: OtpPurpose, user: { _id: unknown; name: string }, email: string, ip?: string) => {
  const activeCode = await AuthToken.findOne({ email, purpose, usedAt: null, expiresAt: { $gt: new Date() } })
    .select("lastSentAt")
    .lean();
  const inCooldown =
    activeCode?.lastSentAt && Date.now() - activeCode.lastSentAt.getTime() < OTP_RESEND_COOLDOWN_SEC * 1000;
  if (inCooldown) return false;

  await AuthToken.updateMany({ email, purpose, usedAt: null }, { $set: { usedAt: new Date() } });

  const otp = generateOTP();
  const token = await AuthToken.create({
    subjectType: "user",
    subjectId: user._id,
    email,
    purpose,
    codeHash: sha256(otp), // the plain code only exists in the email
    expiresAt: new Date(Date.now() + OTP_TTL_MIN * 60_000),
    lastSentAt: new Date(),
    ip,
  });

  const template = purpose === AUTH_TOKEN_PURPOSE.emailVerify ? emailTemplate.emailVerifyOtp : emailTemplate.passwordResetOtp;
  await enqueueEmail(template({ to: email, name: user.name, otp, minutes: OTP_TTL_MIN }), `otp:${token._id}`).catch(
    (error) => errorLogger.error(`OTP email enqueue failed: ${error.message}`),
  );
  return true;
};

/**
 * Sends a 6-digit OTP. Always returns silently (same API response) so callers
 * can't discover which emails are registered.
 */
const forgotPassword = async (email: string, ip?: string) => {
  const user = await User.findOne({ email }).select("name status").lean();
  if (!user || !LOGIN_ALLOWED_STATUSES.includes(user.status)) return;
  await issueOtp(AUTH_TOKEN_PURPOSE.passwordResetOtp, user, email, ip);
};

/** POST /auth/resend-verification — new email-verification code for the logged-in user. */
const sendEmailVerification = async (userId: string, ip?: string) => {
  const user = await User.findById(userId).select("name email emailVerified").lean();
  if (!user) throw new ApiError(StatusCodes.NOT_FOUND, "Account not found");
  if (user.emailVerified) throw new ApiError(StatusCodes.BAD_REQUEST, "Your email is already verified");
  const sent = await issueOtp(AUTH_TOKEN_PURPOSE.emailVerify, user, user.email, ip);
  if (!sent) {
    throw new ApiError(StatusCodes.TOO_MANY_REQUESTS, `Please wait ${OTP_RESEND_COOLDOWN_SEC} seconds before asking for a new code`);
  }
};

/** POST /auth/verify-email — checks the code (max 5 attempts) and marks the email as verified. */
const verifyEmail = async (userId: string, otp: string) => {
  const user = await User.findById(userId).select("email emailVerified").lean();
  if (!user) throw new ApiError(StatusCodes.NOT_FOUND, "Account not found");
  if (user.emailVerified) return loadSelf(userId);

  const token = await AuthToken.findOne({
    subjectId: userId,
    purpose: AUTH_TOKEN_PURPOSE.emailVerify,
    usedAt: null,
    expiresAt: { $gt: new Date() },
  })
    .sort({ createdAt: -1 })
    .select("+codeHash attempts")
    .lean();
  if (!token || token.attempts >= OTP_MAX_ATTEMPTS) throw invalidCode();

  if (!safeEqual(token.codeHash, sha256(otp))) {
    await AuthToken.updateOne({ _id: token._id }, { $inc: { attempts: 1 } });
    throw invalidCode();
  }

  // Conditional update: the code can be used only once, even if two requests race.
  const consumed = await AuthToken.updateOne({ _id: token._id, usedAt: null }, { $set: { usedAt: new Date() } });
  if (!consumed.modifiedCount) throw invalidCode();
  await User.updateOne({ _id: userId }, { $set: { emailVerified: true } });
  return loadSelf(userId);
};

/** Checks the OTP (max 5 attempts) and returns a 10-minute single-use reset token. */
const verifyOtp = async (email: string, otp: string) => {
  const token = await AuthToken.findOne({
    email,
    purpose: AUTH_TOKEN_PURPOSE.passwordResetOtp,
    usedAt: null,
    expiresAt: { $gt: new Date() },
  })
    .sort({ createdAt: -1 })
    .select("+codeHash attempts subjectId")
    .lean();

  if (!token || token.attempts >= OTP_MAX_ATTEMPTS) throw invalidCode();

  if (!safeEqual(token.codeHash, sha256(otp))) {
    // $inc is atomic, so parallel guesses still count toward the limit.
    await AuthToken.updateOne({ _id: token._id }, { $inc: { attempts: 1 } });
    throw invalidCode();
  }

  return { resetToken: jwtHelpers.signReset("user", { sub: String(token.subjectId), jti: String(token._id) }) };
};

const resetPassword = async (resetToken: string, password: string) => {
  let claims;
  try {
    claims = jwtHelpers.verifyReset("user", resetToken);
  } catch {
    throw resetExpired();
  }

  // Conditional update marks the code as used exactly once (single-use even under races).
  const consumed = await AuthToken.findOneAndUpdate(
    { _id: claims.jti, subjectId: claims.sub, usedAt: null, purpose: AUTH_TOKEN_PURPOSE.passwordResetOtp },
    { $set: { usedAt: new Date() } },
  )
    .select("_id")
    .lean();
  if (!consumed) throw resetExpired();

  await User.updateOne(
    { _id: claims.sub },
    {
      $set: { passwordHash: await hashPassword(password), failedLoginCount: 0 },
      $unset: { lockedUntil: 1 },
      $inc: { tokenVersion: 1 },
    },
  );
  await SessionService.revokeAll("user", claims.sub, "password_changed");
  await SessionService.invalidateAuthState("user", claims.sub);
};

/**
 * Keeps the current device logged in and signs every other device out.
 * Returns a new access token because the old one carries the previous tokenVersion.
 */
const changePassword = async (userId: string, sessionId: string, currentPassword: string, newPassword: string) => {
  const user = await User.findById(userId).select("+passwordHash").lean();
  if (!user || !(await verifyPassword(currentPassword, user.passwordHash))) {
    throw new ApiError(StatusCodes.BAD_REQUEST, "Current password is incorrect");
  }

  const updated = await User.findOneAndUpdate(
    { _id: userId },
    { $set: { passwordHash: await hashPassword(newPassword) }, $inc: { tokenVersion: 1 } },
    { new: true },
  )
    .select("tokenVersion role")
    .lean();

  await SessionService.revokeAll("user", userId, "password_changed", sessionId);
  await SessionService.invalidateAuthState("user", userId);

  return {
    accessToken: jwtHelpers.signAccess("user", {
      sub: userId,
      role: updated!.role,
      sid: sessionId,
      ver: updated!.tokenVersion ?? 0,
    }),
  };
};

/** Short-lived socket.io handshake ticket for the logged-in user (tokenVersion comes from the cached auth state). */
const issueSocketTicket = async (user: AuthUser) => {
  const state = await SessionService.getAuthState("user", user.id);
  if (!state) throw new ApiError(StatusCodes.UNAUTHORIZED, "Session expired. Please log in again");
  const ticket = jwtHelpers.signSocketTicket(
    { sub: user.id, role: user.role, sid: user.sid, ver: state.tokenVersion },
    SOCKET_TICKET_TTL_SEC,
  );
  return { ticket, expiresIn: SOCKET_TICKET_TTL_SEC };
};

const listSessions = async (userId: string, currentSessionId: string) => {
  const sessions = await SessionService.listActive("user", userId);
  return sessions.map((s) => ({
    id: String(s._id),
    deviceLabel: s.deviceLabel,
    ip: s.ip,
    lastUsedAt: s.lastUsedAt,
    createdAt: s.createdAt,
    current: String(s._id) === currentSessionId,
  }));
};

const revokeSession = async (userId: string, sessionId: string) => {
  const sessions = await SessionService.listActive("user", userId);
  if (!sessions.some((s) => String(s._id) === sessionId)) throw new ApiError(StatusCodes.NOT_FOUND, "Session not found");
  await SessionService.revoke(sessionId, "logout");
};

export const AuthService = {
  issueSocketTicket,
  register,
  login,
  refresh,
  logout,
  logoutAll,
  forgotPassword,
  verifyOtp,
  sendEmailVerification,
  verifyEmail,
  resetPassword,
  changePassword,
  listSessions,
  revokeSession,
};
