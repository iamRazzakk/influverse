import { withId } from "../../../utils/dto";

/**
 * Fields a user is allowed to see about their own account.
 * Used as a Mongo projection so secrets (passwordHash, tokenVersion, lockout counters, IP)
 * never leave the database — safer than deleting them after the query.
 */
export const USER_SELF_PROJECTION =
  "code email role name phone avatar status emailVerified onboardingCompleted onboardingStep " +
  "preferredLanguage notificationPrefs deactivation lastLoginAt createdAt updatedAt";

/** Shape returned by /auth/login, /auth/register and /me. Expects a lean doc loaded with USER_SELF_PROJECTION. */
export const toUserDto = (user: { _id: unknown } & Record<string, unknown>) => withId(user);
