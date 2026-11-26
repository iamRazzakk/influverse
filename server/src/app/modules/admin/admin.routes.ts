import express, { Request, Response } from "express";
import { StatusCodes } from "http-status-codes";
import catchAsync from "../../../shared/catchAsync";
import { clearRefreshCookie, readRefreshCookie, setRefreshCookie } from "../../../shared/cookie";
import { authLimiter, otpLimiter } from "../../../shared/rateLimiter";
import sendResponse from "../../../shared/sendResponse";
import { zIdParam } from "../../../shared/zod";
import { requestMeta } from "../../../utils/requestMeta";
import { adminAuth } from "../../middlewares/auth";
import validateRequest from "../../middlewares/validateRequest";
import { AuditService } from "../audit/audit.service";
import { PERMISSION } from "./admin.constant";
import { AdminValidation } from "./admin.validation";
import { AdminAuthService } from "./adminAuth.service";
import { TeamService } from "./team.service";

const ok = (res: Response, data?: unknown, message?: string, statusCode: number = StatusCodes.OK) =>
  sendResponse(res, { statusCode, message, data });

// ---------------------------------------------------------------------------
// /admin/auth — login, refresh (httpOnly `art` cookie), password reset, invite acceptance
// ---------------------------------------------------------------------------
export const AdminAuthRoutes = express.Router();

AdminAuthRoutes.post(
  "/login",
  authLimiter,
  validateRequest(AdminValidation.login),
  catchAsync(async (req: Request, res: Response) => {
    const { accessToken, refreshToken, refreshExpiresAt, admin } = await AdminAuthService.login(req.body, requestMeta(req));
    setRefreshCookie(res, "admin", refreshToken, refreshExpiresAt);
    ok(res, { accessToken, admin }, "Logged in");
  }),
);

AdminAuthRoutes.post(
  "/refresh",
  authLimiter,
  catchAsync(async (req: Request, res: Response) => {
    try {
      const { accessToken, refreshToken, refreshExpiresAt } = await AdminAuthService.refresh(
        readRefreshCookie(req, "admin"),
        requestMeta(req),
      );
      setRefreshCookie(res, "admin", refreshToken, refreshExpiresAt);
      ok(res, { accessToken });
    } catch (error) {
      clearRefreshCookie(res, "admin");
      throw error;
    }
  }),
);

AdminAuthRoutes.post(
  "/logout",
  adminAuth(),
  catchAsync(async (req: Request, res: Response) => {
    await AdminAuthService.logout(req.admin!.sid);
    clearRefreshCookie(res, "admin");
    ok(res, undefined, "Logged out");
  }),
);

AdminAuthRoutes.post(
  "/forgot-password",
  otpLimiter,
  validateRequest(AdminValidation.forgotPassword),
  catchAsync(async (req: Request, res: Response) => {
    await AdminAuthService.forgotPassword(req.body.email, req.ip);
    ok(res, undefined, "If this email belongs to an admin, a reset link has been sent.");
  }),
);

AdminAuthRoutes.post(
  "/reset-password",
  authLimiter,
  validateRequest(AdminValidation.resetPassword),
  catchAsync(async (req: Request, res: Response) => {
    await AdminAuthService.resetPassword(req.body.token, req.body.password);
    clearRefreshCookie(res, "admin");
    ok(res, undefined, "Password updated. Please log in.");
  }),
);

AdminAuthRoutes.post(
  "/accept-invite",
  authLimiter,
  validateRequest(AdminValidation.acceptInvite),
  catchAsync(async (req: Request, res: Response) => {
    const { accessToken, refreshToken, refreshExpiresAt, admin } = await AdminAuthService.acceptInvite(
      req.body.token,
      req.body,
      requestMeta(req),
    );
    setRefreshCookie(res, "admin", refreshToken, refreshExpiresAt);
    ok(res, { accessToken, admin }, "Welcome to INFLUVERSE admin");
  }),
);

AdminAuthRoutes.get(
  "/me",
  adminAuth(),
  catchAsync(async (req: Request, res: Response) => ok(res, await AdminAuthService.getMe(req.admin!.id))),
);

AdminAuthRoutes.patch(
  "/me",
  adminAuth(),
  validateRequest(AdminValidation.updateMe),
  catchAsync(async (req: Request, res: Response) =>
    ok(res, await AdminAuthService.updateMe(req.admin!.id, req.body), "Profile updated"),
  ),
);

AdminAuthRoutes.post(
  "/change-password",
  authLimiter,
  adminAuth(),
  validateRequest(AdminValidation.changePassword),
  catchAsync(async (req: Request, res: Response) =>
    ok(
      res,
      await AdminAuthService.changePassword(req.admin!.id, req.admin!.sid, req.body.currentPassword, req.body.newPassword),
      "Password changed",
    ),
  ),
);

// ---------------------------------------------------------------------------
// /admin/team — super admin only (`team.manage`)
// ---------------------------------------------------------------------------
export const AdminTeamRoutes = express.Router();
const teamManage = adminAuth(PERMISSION.teamManage);

AdminTeamRoutes.get(
  "/",
  teamManage,
  validateRequest(AdminValidation.teamList),
  catchAsync(async (req: Request, res: Response) => ok(res, await TeamService.list(req.query as any))),
);
AdminTeamRoutes.post(
  "/invite",
  teamManage,
  validateRequest(AdminValidation.teamInvite),
  catchAsync(async (req: Request, res: Response) =>
    ok(res, await TeamService.invite(req, req.body), "Invitation sent", StatusCodes.CREATED),
  ),
);
AdminTeamRoutes.patch(
  "/:id",
  teamManage,
  validateRequest(AdminValidation.teamUpdate),
  catchAsync(async (req: Request, res: Response) =>
    ok(res, await TeamService.update(req, req.params.id, req.body), "Team member updated"),
  ),
);
AdminTeamRoutes.post(
  "/:id/suspend",
  teamManage,
  validateRequest(zIdParam),
  catchAsync(async (req: Request, res: Response) =>
    ok(res, await TeamService.setStatus(req, req.params.id, "suspended"), "Team member suspended"),
  ),
);
AdminTeamRoutes.post(
  "/:id/activate",
  teamManage,
  validateRequest(zIdParam),
  catchAsync(async (req: Request, res: Response) =>
    ok(res, await TeamService.setStatus(req, req.params.id, "active"), "Team member activated"),
  ),
);
AdminTeamRoutes.post(
  "/:id/resend-invite",
  teamManage,
  validateRequest(zIdParam),
  catchAsync(async (req: Request, res: Response) => {
    await TeamService.resendInvite(req, req.params.id);
    ok(res, undefined, "Invitation re-sent");
  }),
);
AdminTeamRoutes.delete(
  "/:id",
  teamManage,
  validateRequest(zIdParam),
  catchAsync(async (req: Request, res: Response) => {
    await TeamService.remove(req, req.params.id);
    ok(res, undefined, "Team member removed");
  }),
);

// ---------------------------------------------------------------------------
// /admin/audit-logs
// ---------------------------------------------------------------------------
export const AdminAuditRoutes = express.Router();

AdminAuditRoutes.get(
  "/",
  adminAuth(PERMISSION.settingsManage),
  validateRequest(AdminValidation.auditList),
  catchAsync(async (req: Request, res: Response) => {
    const { items, meta } = await AuditService.list(req.query as any);
    sendResponse(res, { statusCode: StatusCodes.OK, data: items, meta });
  }),
);
