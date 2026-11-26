import { NextFunction, Request, Response } from "express";
import { StatusCodes } from "http-status-codes";
import ApiError from "../../errors/ApiErrors";
import { jwtHelpers } from "../../shared/jwt";
import { CSRF_HEADER, SubjectType } from "../modules/auth/auth.constant";
import { readAccessCookie } from "../../shared/cookie";
import { isAllowedOrigin } from "../../shared/corsOrigin";
import { SessionService } from "../modules/auth/session.service";
import { AdminRole, hasPermission, Permission } from "../modules/admin/admin.constant";
import { UserRole, USER_STATUS } from "../modules/user/user.constant";
import { ADMIN_STATUS } from "../modules/admin/admin.constant";

/**
 * Where the access token comes from:
 *   1. `Authorization: Bearer` header (dashboard, Next.js server, any API client) — always wins.
 *   2. httpOnly `at` cookie — website users only (browser calls through the same-origin proxy).
 * Cookie-authenticated requests that change data must pass the CSRF check below.
 *
 * Check (docs/03 §1.5f): signature + exp + aud + typ → status active → `ver === tokenVersion` → `sid` not revoked.
 * Subject state is cached in Redis for 5 min (SessionService.getAuthState) — no Mongo hit on every request.
 */
const bearer = (req: Request): string | undefined => {
  const header = req.headers.authorization;
  return header?.startsWith("Bearer ") ? header.slice(7).trim() || undefined : undefined;
};

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * CSRF guard for cookie auth: a cross-site page can make the browser send the cookie, but it can't
 * add a custom header and its Origin is not on our whitelist. The website's axios sends the header.
 */
const passesCsrfCheck = (req: Request) => {
  if (SAFE_METHODS.has(req.method)) return true;
  if (req.headers[CSRF_HEADER]) return true;
  const origin = req.headers.origin;
  return typeof origin === "string" && isAllowedOrigin(origin);
};

const unauthorized = (message = "You are not authorized") => new ApiError(StatusCodes.UNAUTHORIZED, message);

const readToken = (kind: SubjectType, req: Request): string | undefined => {
  const fromHeader = bearer(req);
  if (fromHeader) return fromHeader;
  if (kind !== "user") return undefined;
  const fromCookie = readAccessCookie(req);
  if (fromCookie && !passesCsrfCheck(req)) {
    throw new ApiError(StatusCodes.FORBIDDEN, "Request blocked (missing CSRF header)");
  }
  return fromCookie;
};

/** True when the request carries any user credential (header or cookie). */
const hasUserCredential = (req: Request) => Boolean(bearer(req) || readAccessCookie(req));

const authenticate = async (kind: SubjectType, req: Request) => {
  const token = readToken(kind, req);
  if (!token) throw unauthorized();

  let claims;
  try {
    claims = jwtHelpers.verifyAccess(kind, token);
  } catch (error: any) {
    throw unauthorized(error?.name === "TokenExpiredError" ? "Access token expired" : "Invalid token");
  }

  const [state, revoked] = await Promise.all([
    SessionService.getAuthState(kind, claims.sub),
    SessionService.isRevoked(claims.sid),
  ]);
  if (!state || revoked || state.tokenVersion !== claims.ver) {
    throw unauthorized("Session expired. Please log in again");
  }
  return { claims, state };
};

/** Brand / creator. Without `roles`, any logged-in user is allowed. */
export const userAuth =
  (...roles: UserRole[]) =>
  async (req: Request, _res: Response, next: NextFunction) => {
    try {
      const { claims, state } = await authenticate("user", req);
      if (state.status === USER_STATUS.suspended) throw new ApiError(StatusCodes.FORBIDDEN, "Account is suspended");
      if (state.status === USER_STATUS.deactivated) throw unauthorized("Account is deactivated");
      if (roles.length && !roles.includes(state.role as UserRole)) {
        throw new ApiError(StatusCodes.FORBIDDEN, "You don't have permission to access this resource");
      }
      req.user = { kind: "user", id: claims.sub, role: state.role as UserRole, sid: claims.sid, email: state.email, name: state.name };
      next();
    } catch (error) {
      next(error);
    }
  };

/** Dashboard admin. Permissions are resolved server-side from the role (not stored in the token). */
export const adminAuth =
  (...permissions: Permission[]) =>
  async (req: Request, _res: Response, next: NextFunction) => {
    try {
      const { claims, state } = await authenticate("admin", req);
      if (state.status !== ADMIN_STATUS.active) throw new ApiError(StatusCodes.FORBIDDEN, "Admin account is not active");
      const role = state.role as AdminRole;
      const missing = permissions.find((p) => !hasPermission(role, p));
      if (missing) throw new ApiError(StatusCodes.FORBIDDEN, `Missing permission: ${missing}`);
      req.admin = { kind: "admin", id: claims.sub, role, sid: claims.sid, email: state.email, name: state.name };
      next();
    } catch (error) {
      next(error);
    }
  };

/** On public routes: attach the user if logged in (e.g. saved state), otherwise silently continue */
export const optionalUserAuth = async (req: Request, _res: Response, next: NextFunction) => {
  if (!hasUserCredential(req)) return next();
  try {
    const { claims, state } = await authenticate("user", req);
    if (state.status === USER_STATUS.active || state.status === USER_STATUS.deactivationScheduled) {
      req.user = { kind: "user", id: claims.sub, role: state.role as UserRole, sid: claims.sid, email: state.email, name: state.name };
    }
  } catch {
    /* public route — invalid token ignore */
  }
  next();
};
