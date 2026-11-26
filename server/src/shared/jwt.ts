import jwt, { JwtPayload } from "jsonwebtoken";
import config from "../config";
import type { SubjectType } from "../app/modules/auth/auth.constant";

/**
 * docs/03-data-models.md §1.5
 * Access: `{ sub, typ: 'access', aud, role, sid, ver }` — 15 min.
 * User and admin use separate secrets + audiences → a user token never works on the admin API.
 */
export const AUDIENCE: Record<SubjectType, string> = {
  user: "influverse:user",
  admin: "influverse:admin",
};

const secretFor = (kind: SubjectType) => (kind === "user" ? config.jwt.userSecret : config.jwt.adminSecret);

export type AccessClaims = JwtPayload & {
  sub: string;
  typ: "access";
  role: string;
  sid: string;
  ver: number;
};

export type ResetClaims = JwtPayload & { sub: string; typ: "pwd_reset"; jti: string };

const signAccess = (kind: SubjectType, claims: { sub: string; role: string; sid: string; ver: number }) =>
  jwt.sign({ typ: "access", role: claims.role, sid: claims.sid, ver: claims.ver }, secretFor(kind), {
    algorithm: "HS256",
    subject: claims.sub,
    audience: AUDIENCE[kind],
    issuer: config.jwt.issuer,
    expiresIn: config.jwt.accessTtl as jwt.SignOptions["expiresIn"],
  });

const verifyAccess = (kind: SubjectType, token: string): AccessClaims => {
  const payload = jwt.verify(token, secretFor(kind), {
    algorithms: ["HS256"],
    audience: AUDIENCE[kind],
    issuer: config.jwt.issuer,
  }) as AccessClaims;
  if (payload.typ !== "access" || !payload.sub || !payload.sid) throw new jwt.JsonWebTokenError("Invalid token type");
  return payload;
};

/** 10 min token for setting a password after OTP verification. `jti` = auth_tokens._id (single use) */
const signReset = (kind: SubjectType, claims: { sub: string; jti: string }) =>
  jwt.sign({ typ: "pwd_reset" }, config.jwt.resetSecret, {
    algorithm: "HS256",
    subject: claims.sub,
    jwtid: claims.jti,
    audience: AUDIENCE[kind],
    issuer: config.jwt.issuer,
    expiresIn: "10m",
  });

const verifyReset = (kind: SubjectType, token: string): ResetClaims => {
  const payload = jwt.verify(token, config.jwt.resetSecret, {
    algorithms: ["HS256"],
    audience: AUDIENCE[kind],
    issuer: config.jwt.issuer,
  }) as ResetClaims;
  if (payload.typ !== "pwd_reset" || !payload.jti) throw new jwt.JsonWebTokenError("Invalid token type");
  return payload;
};

export type SocketTicketClaims = JwtPayload & { sub: string; typ: "socket"; role: string; sid: string; ver: number };

const SOCKET_AUDIENCE = "influverse:socket";

/**
 * 60-second ticket for the socket.io handshake (website users). Separate audience + `typ`,
 * so a ticket is never accepted as an API access token and vice versa.
 */
const signSocketTicket = (claims: { sub: string; role: string; sid: string; ver: number }, ttlSec: number) =>
  jwt.sign({ typ: "socket", role: claims.role, sid: claims.sid, ver: claims.ver }, config.jwt.userSecret, {
    algorithm: "HS256",
    subject: claims.sub,
    audience: SOCKET_AUDIENCE,
    issuer: config.jwt.issuer,
    expiresIn: ttlSec,
  });

const verifySocketTicket = (token: string): SocketTicketClaims => {
  const payload = jwt.verify(token, config.jwt.userSecret, {
    algorithms: ["HS256"],
    audience: SOCKET_AUDIENCE,
    issuer: config.jwt.issuer,
  }) as SocketTicketClaims;
  if (payload.typ !== "socket" || !payload.sub || !payload.sid) throw new jwt.JsonWebTokenError("Invalid token type");
  return payload;
};

export const jwtHelpers = { signAccess, verifyAccess, signReset, verifyReset, signSocketTicket, verifySocketTicket };
