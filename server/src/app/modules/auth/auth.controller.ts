import { Request, Response } from "express";
import { StatusCodes } from "http-status-codes";
import catchAsync from "../../../shared/catchAsync";
import sendResponse from "../../../shared/sendResponse";
import { clearUserSessionCookies, readRefreshCookie, setAccessCookie, setUserSessionCookies } from "../../../shared/cookie";
import { requestMeta } from "../../../utils/requestMeta";
import { AuthService } from "./auth.service";

/**
 * Response: `{ accessToken, user }` in the body, plus two httpOnly cookies:
 *   `rt` (refresh) and `at` (access, used by the website's server-side rendering).
 * Clients that keep the token in memory (Bearer header) keep working; the body is unchanged.
 */

const register = catchAsync(async (req: Request, res: Response) => {
  const { accessToken, refreshToken, refreshExpiresAt, user } = await AuthService.register(req.body, requestMeta(req));
  setUserSessionCookies(res, { accessToken, refreshToken, refreshExpiresAt });
  sendResponse(res, { statusCode: StatusCodes.CREATED, message: "Account created", data: { accessToken, user } });
});

const login = catchAsync(async (req: Request, res: Response) => {
  const { accessToken, refreshToken, refreshExpiresAt, user } = await AuthService.login(req.body, requestMeta(req));
  setUserSessionCookies(res, { accessToken, refreshToken, refreshExpiresAt });
  sendResponse(res, { statusCode: StatusCodes.OK, message: "Logged in", data: { accessToken, user } });
});

const refresh = catchAsync(async (req: Request, res: Response) => {
  try {
    const { accessToken, refreshToken, refreshExpiresAt } = await AuthService.refresh(
      readRefreshCookie(req, "user"),
      requestMeta(req),
    );
    setUserSessionCookies(res, { accessToken, refreshToken, refreshExpiresAt });
    sendResponse(res, { statusCode: StatusCodes.OK, message: "Token refreshed", data: { accessToken } });
  } catch (error) {
    clearUserSessionCookies(res);
    throw error;
  }
});

const logout = catchAsync(async (req: Request, res: Response) => {
  await AuthService.logout(req.user!.sid);
  clearUserSessionCookies(res);
  sendResponse(res, { statusCode: StatusCodes.OK, message: "Logged out" });
});

const logoutAll = catchAsync(async (req: Request, res: Response) => {
  await AuthService.logoutAll(req.user!.id);
  clearUserSessionCookies(res);
  sendResponse(res, { statusCode: StatusCodes.OK, message: "Logged out from all devices" });
});

const forgotPassword = catchAsync(async (req: Request, res: Response) => {
  await AuthService.forgotPassword(req.body.email, req.ip);
  sendResponse(res, {
    statusCode: StatusCodes.OK,
    message: "If an account exists for this email, we've sent a 6-digit code.",
  });
});

const verifyOtp = catchAsync(async (req: Request, res: Response) => {
  const data = await AuthService.verifyOtp(req.body.email, req.body.otp);
  sendResponse(res, { statusCode: StatusCodes.OK, message: "Code verified", data });
});

const sendEmailVerification = catchAsync(async (req: Request, res: Response) => {
  await AuthService.sendEmailVerification(req.user!.id, req.ip);
  sendResponse(res, { statusCode: StatusCodes.OK, message: "We've sent a new 6-digit code to your email." });
});

const verifyEmail = catchAsync(async (req: Request, res: Response) => {
  const user = await AuthService.verifyEmail(req.user!.id, req.body.otp);
  sendResponse(res, { statusCode: StatusCodes.OK, message: "Email verified", data: { user } });
});

const resetPassword = catchAsync(async (req: Request, res: Response) => {
  await AuthService.resetPassword(req.body.resetToken, req.body.password);
  clearUserSessionCookies(res);
  sendResponse(res, { statusCode: StatusCodes.OK, message: "Password updated. Please log in." });
});

const changePassword = catchAsync(async (req: Request, res: Response) => {
  const data = await AuthService.changePassword(
    req.user!.id,
    req.user!.sid,
    req.body.currentPassword,
    req.body.newPassword,
  );
  // The old access token carries the previous tokenVersion, so the cookie must be replaced too.
  setAccessCookie(res, data.accessToken);
  sendResponse(res, { statusCode: StatusCodes.OK, message: "Password changed", data });
});

/**
 * Socket.io handshake ticket. The website can't read the httpOnly `at` cookie, so it asks for a
 * 60-second ticket (cookie-authenticated) and passes it as `io(url, { auth: { ticket } })`.
 */
const socketTicket = catchAsync(async (req: Request, res: Response) => {
  const data = await AuthService.issueSocketTicket(req.user!);
  sendResponse(res, { statusCode: StatusCodes.OK, data });
});

const listSessions = catchAsync(async (req: Request, res: Response) => {
  const data = await AuthService.listSessions(req.user!.id, req.user!.sid);
  sendResponse(res, { statusCode: StatusCodes.OK, data });
});

const revokeSession = catchAsync(async (req: Request, res: Response) => {
  await AuthService.revokeSession(req.user!.id, req.params.id);
  sendResponse(res, { statusCode: StatusCodes.OK, message: "Session logged out" });
});

export const AuthController = {
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
  socketTicket,
  listSessions,
  revokeSession,
};
