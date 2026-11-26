import type { CookieOptions, Request, Response } from "express";
import jwt from "jsonwebtoken";
import config from "../config";
import { ACCESS_COOKIE, LEGACY_USER_REFRESH_PATH, REFRESH_COOKIE, SubjectType } from "../app/modules/auth/auth.constant";

/**
 * Session cookies. Both are httpOnly, so JS can never read them (an XSS attack can't steal them).
 *
 * - Refresh token (`rt` / `art`): rotated on every /auth/refresh.
 * - Access token `at` (website users only): lets the Next.js server render logged-in pages.
 *   The browser reaches the API through the website's same-origin `/api/v1` proxy, so the cookie
 *   is first-party and gets sent with every API call.
 *
 * The admin dashboard still keeps its access token in memory and sends it as a Bearer header.
 */
const baseOptions = (path: string, maxAgeMs?: number): CookieOptions => ({
  httpOnly: true,
  secure: config.cookie.secure || config.cookie.sameSite === "none",
  sameSite: config.cookie.sameSite,
  domain: config.cookie.domain,
  path,
  ...(maxAgeMs !== undefined ? { maxAge: Math.max(0, maxAgeMs) } : {}),
});

export const setRefreshCookie = (res: Response, kind: SubjectType, token: string, expiresAt: Date) => {
  // Before this change the user cookie lived on /api/v1/auth. If both exist, the browser sends the
  // old one first and a rotated token would later look like reuse, so remove the old one here.
  if (kind === "user") res.clearCookie(REFRESH_COOKIE.user.name, baseOptions(LEGACY_USER_REFRESH_PATH));
  res.cookie(REFRESH_COOKIE[kind].name, token, baseOptions(REFRESH_COOKIE[kind].path, expiresAt.getTime() - Date.now()));
};

export const clearRefreshCookie = (res: Response, kind: SubjectType) => {
  if (kind === "user") res.clearCookie(REFRESH_COOKIE.user.name, baseOptions(LEGACY_USER_REFRESH_PATH));
  res.clearCookie(REFRESH_COOKIE[kind].name, baseOptions(REFRESH_COOKIE[kind].path));
};

export const readRefreshCookie = (req: Request, kind: SubjectType): string | undefined => {
  const value = req.cookies?.[REFRESH_COOKIE[kind].name];
  return typeof value === "string" && value ? value : undefined;
};

/** Access cookie lives exactly as long as the JWT inside it. */
export const setAccessCookie = (res: Response, token: string) => {
  const exp = (jwt.decode(token) as { exp?: number } | null)?.exp;
  const maxAgeMs = exp ? exp * 1000 - Date.now() : undefined;
  res.cookie(ACCESS_COOKIE.name, token, baseOptions(ACCESS_COOKIE.path, maxAgeMs));
};

export const clearAccessCookie = (res: Response) => {
  res.clearCookie(ACCESS_COOKIE.name, baseOptions(ACCESS_COOKIE.path));
};

export const readAccessCookie = (req: Request): string | undefined => {
  const value = req.cookies?.[ACCESS_COOKIE.name];
  return typeof value === "string" && value ? value : undefined;
};

/** Sets both website session cookies after login / register / refresh. */
export const setUserSessionCookies = (res: Response, tokens: { accessToken: string; refreshToken: string; refreshExpiresAt: Date }) => {
  setRefreshCookie(res, "user", tokens.refreshToken, tokens.refreshExpiresAt);
  setAccessCookie(res, tokens.accessToken);
};

export const clearUserSessionCookies = (res: Response) => {
  clearRefreshCookie(res, "user");
  clearAccessCookie(res);
};
