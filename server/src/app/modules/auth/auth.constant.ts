export const SUBJECT_TYPE = { user: "user", admin: "admin" } as const;
export type SubjectType = (typeof SUBJECT_TYPE)[keyof typeof SUBJECT_TYPE];

export const SESSION_REVOKE_REASONS = [
  "logout",
  "logout_all",
  "rotated",
  "reuse_detected",
  "password_changed",
  "admin_suspended",
  "deactivated",
] as const;
export type SessionRevokeReason = (typeof SESSION_REVOKE_REASONS)[number];

export const AUTH_TOKEN_PURPOSE = {
  passwordResetOtp: "password_reset_otp",
  passwordResetLink: "password_reset_link",
  adminInvite: "admin_invite",
  emailVerify: "email_verify",
} as const;
export type AuthTokenPurpose = (typeof AUTH_TOKEN_PURPOSE)[keyof typeof AUTH_TOKEN_PURPOSE];

export const OTP_TTL_MIN = 10;
export const OTP_MAX_ATTEMPTS = 5;
export const OTP_RESEND_COOLDOWN_SEC = 60;
export const ADMIN_RESET_LINK_TTL_MIN = 30;
export const ADMIN_INVITE_TTL_HOURS = 48;

/**
 * Refresh cookie names + path (docs/03 §1.5c).
 * The user cookie is on `/` so the website's Next.js middleware can refresh the session before
 * rendering a page. The admin cookie stays limited to the admin auth routes.
 */
export const REFRESH_COOKIE = {
  user: { name: "rt", path: "/" },
  admin: { name: "art", path: "/api/v1/admin/auth" },
} as const;

/** Old user refresh-cookie path, still cleared so browsers don't keep two `rt` cookies. */
export const LEGACY_USER_REFRESH_PATH = "/api/v1/auth";

/** Website access-token cookie (httpOnly). Read by the Next.js server and by `userAuth`. */
export const ACCESS_COOKIE = { name: "at", path: "/" } as const;

/**
 * Cookie-authenticated requests that change data must carry this header (or a whitelisted Origin).
 * A cross-site form can't set custom headers, so this blocks CSRF.
 */
export const CSRF_HEADER = "x-requested-with";

/** Short-lived ticket the website trades for a socket.io connection (the access cookie is unreadable by JS). */
export const SOCKET_TICKET_TTL_SEC = 60;
