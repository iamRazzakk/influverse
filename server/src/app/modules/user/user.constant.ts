export const USER_ROLE = { brand: "brand", creator: "creator" } as const;
export type UserRole = (typeof USER_ROLE)[keyof typeof USER_ROLE];
export const USER_ROLES = Object.values(USER_ROLE);

export const USER_STATUS = {
  active: "active",
  suspended: "suspended",
  deactivationScheduled: "deactivation_scheduled",
  deactivated: "deactivated",
} as const;
export type UserStatus = (typeof USER_STATUS)[keyof typeof USER_STATUS];

/** Statuses that can log in / use the API (deactivation_scheduled → logging in offers a cancel option) */
export const LOGIN_ALLOWED_STATUSES: UserStatus[] = [USER_STATUS.active, USER_STATUS.deactivationScheduled];

export const BAN_TYPES = ["warning", "temporary", "permanent"] as const;
export const ESCROW_DISPOSITIONS = ["hold", "refund"] as const;
export const LANGUAGES = ["en", "de"] as const;

export const NOTIFICATION_PREF_KEYS = ["offers", "messages", "deliverables", "payouts", "marketing"] as const;

/** Login fail lockout */
export const MAX_FAILED_LOGINS = 5;
export const LOCK_MINUTES = 15;
