import { Types } from "mongoose";
import { StatusCodes } from "http-status-codes";
import config from "../../../config";
import { getRedis } from "../../../config/redis.config";
import ApiError from "../../../errors/ApiErrors";
import { cache } from "../../../shared/cache";
import { jwtHelpers } from "../../../shared/jwt";
import { errorLogger } from "../../../shared/logger";
import { randomToken, safeEqual, sha256 } from "../../../utils/crypto";
import { RequestMeta } from "../../../utils/requestMeta";
import { Admin } from "../admin/admin.model";
import { User } from "../user/user.model";
import { SessionRevokeReason, SubjectType } from "./auth.constant";
import { Session } from "./session.model";

/**
 * Session + token lifecycle, shared by users (brand/creator) and admins.
 *
 * - Access token: short-lived JWT (15 min) carrying the session id (`sid`) and `tokenVersion` (`ver`).
 * - Refresh token: opaque `<sessionId>.<random>` stored in an httpOnly cookie; DB keeps only its SHA-256.
 * - Every refresh rotates the token. If an already-rotated token shows up again it was stolen,
 *   so the whole rotation chain (`familyId`) is revoked.
 * - Revoked session ids are flagged in Redis so the auth middleware can reject live access tokens
 *   without a DB lookup on every request.
 */

const DAY_MS = 24 * 60 * 60 * 1000;
/** Access tokens live 15 min, so a revoked flag only needs to outlive that window. */
const REVOKED_FLAG_TTL_SEC = 60 * 60;
/** Two browser tabs refreshing at the same moment is normal — don't treat it as token theft. */
const ROTATION_GRACE_MS = 30_000;
const AUTH_STATE_TTL_SEC = 300;

const revokedFlagKey = (sessionId: string) => `sess:rev:${sessionId}`;
const authStateKey = (kind: SubjectType, subjectId: string) => `auth:${kind}:${subjectId}`;

export type IssuedTokens = {
  accessToken: string;
  refreshToken: string;
  refreshExpiresAt: Date;
  sessionId: string;
};

/** Minimal data needed to mint tokens for a user or admin. */
export type TokenSubject = { _id: Types.ObjectId | string; role: string; tokenVersion?: number | null };

const refreshLifetimeMs = (rememberMe: boolean) =>
  (rememberMe ? config.jwt.refreshTtlDays : config.jwt.refreshTtlShortDays) * DAY_MS;

/** Creates a session row and returns a fresh access + refresh token pair. */
const createSession = async (
  kind: SubjectType,
  subject: TokenSubject,
  options: { rememberMe: boolean; meta: RequestMeta; familyId?: string },
): Promise<IssuedTokens> => {
  const sessionId = new Types.ObjectId();
  const refreshToken = `${sessionId.toHexString()}.${randomToken(48)}`;
  const refreshExpiresAt = new Date(Date.now() + refreshLifetimeMs(options.rememberMe));

  await Session.create({
    _id: sessionId,
    subjectType: kind,
    subjectId: subject._id,
    refreshTokenHash: sha256(refreshToken),
    familyId: options.familyId ?? sessionId.toHexString(),
    rememberMe: options.rememberMe,
    expiresAt: refreshExpiresAt,
    lastUsedAt: new Date(),
    ip: options.meta.ip,
    userAgent: options.meta.userAgent,
    deviceLabel: options.meta.deviceLabel,
  });

  const accessToken = jwtHelpers.signAccess(kind, {
    sub: String(subject._id),
    role: subject.role,
    sid: sessionId.toHexString(),
    ver: subject.tokenVersion ?? 0,
  });

  return { accessToken, refreshToken, refreshExpiresAt, sessionId: sessionId.toHexString() };
};

/** Flags sessions as revoked in Redis. If Redis is down, `isRevoked` falls back to Mongo. */
const flagRevoked = async (sessionIds: string[]) => {
  if (!sessionIds.length) return;
  try {
    const pipeline = getRedis().multi();
    for (const id of sessionIds) pipeline.set(revokedFlagKey(id), "1", "EX", REVOKED_FLAG_TTL_SEC);
    await pipeline.exec();
  } catch (error: any) {
    errorLogger.error(`Failed to flag revoked sessions in Redis: ${error.message}`);
  }
};

const revoke = async (sessionId: string, reason: SessionRevokeReason) => {
  await Session.updateOne(
    { _id: sessionId, revokedAt: null },
    { $set: { revokedAt: new Date(), revokedReason: reason } },
  );
  await flagRevoked([sessionId]);
};

/** Revokes every active session of a subject (optionally keeping the current one). */
const revokeAll = async (
  kind: SubjectType,
  subjectId: string,
  reason: SessionRevokeReason,
  keepSessionId?: string,
) => {
  const filter: Record<string, unknown> = { subjectType: kind, subjectId, revokedAt: null };
  if (keepSessionId) filter._id = { $ne: keepSessionId };

  const activeIds = (await Session.find(filter).select("_id").lean()).map((s) => String(s._id));
  if (!activeIds.length) return;

  await Session.updateMany(
    { _id: { $in: activeIds } },
    { $set: { revokedAt: new Date(), revokedReason: reason } },
  );
  await flagRevoked(activeIds);
};

/** Called on every authenticated request — Redis first, Mongo only if Redis is unavailable. */
const isRevoked = async (sessionId: string): Promise<boolean> => {
  try {
    return (await getRedis().exists(revokedFlagKey(sessionId))) === 1;
  } catch {
    const session = await Session.findById(sessionId).select("revokedAt expiresAt").lean();
    return !session || !!session.revokedAt || session.expiresAt < new Date();
  }
};

const sessionExpired = () => new ApiError(StatusCodes.UNAUTHORIZED, "Session expired. Please log in again");

/** Revokes the whole rotation chain after a stolen refresh token is detected. */
const revokeFamily = async (familyId: string) => {
  const ids = (await Session.find({ familyId, revokedAt: null }).select("_id").lean()).map((s) => String(s._id));
  await Session.updateMany(
    { familyId, revokedAt: null },
    { $set: { revokedAt: new Date(), revokedReason: "reuse_detected" } },
  );
  await flagRevoked(ids);
};

/**
 * Exchanges a refresh token for a new token pair (rotation).
 * `loadSubject` returns the subject's current role/status so suspended accounts can't refresh.
 */
const rotate = async (
  kind: SubjectType,
  rawToken: string | undefined,
  meta: RequestMeta,
  loadSubject: (subjectId: string) => Promise<(TokenSubject & { canLogin: boolean }) | null>,
): Promise<IssuedTokens & { subjectId: string }> => {
  const [sessionId] = rawToken?.split(".") ?? [];
  if (!rawToken || !sessionId || !Types.ObjectId.isValid(sessionId)) throw sessionExpired();

  const session = await Session.findById(sessionId)
    .select("+refreshTokenHash subjectType subjectId familyId rememberMe expiresAt revokedAt revokedReason")
    .lean();
  if (!session || session.subjectType !== kind || !safeEqual(session.refreshTokenHash, sha256(rawToken))) {
    throw sessionExpired();
  }

  /**
   * A token rotated a few seconds ago is still accepted once more (grace window). This happens on a
   * hard reload while /auth/refresh is in flight (the browser never stored the new cookie) or when two
   * tabs refresh together. Without this, those users would be logged out on reload.
   * The grace path is refused if anything in the family was revoked for another reason (logout, theft…).
   */
  const rotatedRecently = (revokedAt?: Date | null) => !!revokedAt && Date.now() - revokedAt.getTime() <= ROTATION_GRACE_MS;
  const familyStillValid = async () =>
    !(await Session.exists({ familyId: session.familyId, revokedAt: { $ne: null }, revokedReason: { $ne: "rotated" } }));

  if (session.revokedAt) {
    const inGrace = session.revokedReason === "rotated" && rotatedRecently(session.revokedAt);
    if (!inGrace || !(await familyStillValid())) {
      if (session.revokedReason === "rotated" && !inGrace) {
        await revokeFamily(session.familyId);
        errorLogger.error(`Refresh token reuse detected: ${kind} ${session.subjectId}, family ${session.familyId}`);
      }
      throw sessionExpired();
    }
  }
  if (session.expiresAt < new Date()) throw sessionExpired();

  const subject = await loadSubject(String(session.subjectId));
  if (!subject || !subject.canLogin) {
    await revoke(sessionId, "admin_suspended");
    throw sessionExpired();
  }

  if (!session.revokedAt) {
    // Conditional update = atomic claim. If two refreshes race, the loser falls into the grace check below.
    const claim = await Session.updateOne(
      { _id: sessionId, revokedAt: null },
      { $set: { revokedAt: new Date(), revokedReason: "rotated" } },
    );
    if (claim.modifiedCount === 1) {
      await flagRevoked([sessionId]);
    } else {
      const current = await Session.findById(sessionId).select("revokedAt revokedReason").lean();
      const lostRace = current?.revokedReason === "rotated" && rotatedRecently(current.revokedAt);
      if (!lostRace || !(await familyStillValid())) throw sessionExpired();
    }
  }

  const issued = await createSession(kind, subject, {
    rememberMe: session.rememberMe ?? true,
    meta,
    familyId: session.familyId,
  });
  return { ...issued, subjectId: String(session.subjectId) };
};

const listActive = (kind: SubjectType, subjectId: string) =>
  Session.find({ subjectType: kind, subjectId, revokedAt: null, expiresAt: { $gt: new Date() } })
    .select("deviceLabel ip lastUsedAt createdAt rememberMe")
    .sort({ lastUsedAt: -1 })
    .lean();

// ---------------------------------------------------------------------------
// Auth state cache — lets the auth middleware skip a Mongo read on every request.
// Must be invalidated whenever role, status or tokenVersion changes.
// ---------------------------------------------------------------------------

export type AuthState = { role: string; status: string; tokenVersion: number; name: string; email: string };

const loadAuthState = async (kind: SubjectType, subjectId: string): Promise<AuthState | null> => {
  const doc =
    kind === "user"
      ? await User.findById(subjectId).select("role status tokenVersion name email").lean()
      : await Admin.findOne({ _id: subjectId, deletedAt: null }).select("role status tokenVersion name email").lean();
  if (!doc) return null;
  return { role: doc.role, status: doc.status, tokenVersion: doc.tokenVersion ?? 0, name: doc.name, email: doc.email };
};

const getAuthState = (kind: SubjectType, subjectId: string) =>
  cache.wrap(authStateKey(kind, subjectId), AUTH_STATE_TTL_SEC, () => loadAuthState(kind, subjectId));

const invalidateAuthState = (kind: SubjectType, subjectId: string) => cache.del(authStateKey(kind, subjectId));

export const SessionService = {
  createSession,
  rotate,
  revoke,
  revokeAll,
  isRevoked,
  listActive,
  getAuthState,
  invalidateAuthState,
};
