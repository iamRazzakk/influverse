import { StatusCodes } from "http-status-codes";
import ApiError from "../../../errors/ApiErrors";
import { randomToken, sha256 } from "../../../utils/crypto";
import { AuthTokenPurpose, SubjectType } from "./auth.constant";
import { AuthToken } from "./authToken.model";

/**
 * One-time email links (admin password reset, admin invite).
 * The raw token only lives in the email; Mongo stores its SHA-256, so a DB leak can't be used to log in.
 */

/** Creates a link token and invalidates any older unused token for the same email + purpose. */
const issueLinkToken = async (params: {
  subjectType: SubjectType;
  subjectId: unknown;
  email: string;
  purpose: AuthTokenPurpose;
  ttlMinutes: number;
  ip?: string;
}) => {
  await AuthToken.updateMany(
    { email: params.email, purpose: params.purpose, usedAt: null },
    { $set: { usedAt: new Date() } },
  );
  const rawToken = randomToken(32);
  await AuthToken.create({
    subjectType: params.subjectType,
    subjectId: params.subjectId,
    email: params.email,
    purpose: params.purpose,
    codeHash: sha256(rawToken),
    expiresAt: new Date(Date.now() + params.ttlMinutes * 60_000),
    lastSentAt: new Date(),
    ip: params.ip,
  });
  return rawToken;
};

/**
 * Marks a link token as used and returns its subject. The conditional update (`usedAt: null`,
 * not expired) makes it single-use even if the link is clicked twice at the same moment.
 */
const consumeLinkToken = async (rawToken: string, purpose: AuthTokenPurpose) => {
  const token = await AuthToken.findOneAndUpdate(
    { codeHash: sha256(rawToken), purpose, usedAt: null, expiresAt: { $gt: new Date() } },
    { $set: { usedAt: new Date() } },
  )
    .select("subjectId email")
    .lean();
  if (!token?.subjectId) throw new ApiError(StatusCodes.BAD_REQUEST, "This link is invalid or has expired");
  return { subjectId: String(token.subjectId), email: token.email };
};

export const AuthTokenService = { issueLinkToken, consumeLinkToken };
