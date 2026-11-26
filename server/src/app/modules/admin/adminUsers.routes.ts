import express, { Request, Response } from "express";
import { StatusCodes } from "http-status-codes";
import { z } from "zod";
import catchAsync from "../../../shared/catchAsync";
import { accountWriteLimiter } from "../../../shared/rateLimiter";
import sendResponse from "../../../shared/sendResponse";
import { zIdParam, zObjectId, zPagination } from "../../../shared/zod";
import { adminAuth } from "../../middlewares/auth";
import validateRequest from "../../middlewares/validateRequest";
import { APPROVAL_STATUS } from "../creator/creator.constant";
import { USER_STATUS } from "../user/user.constant";
import { PERMISSION } from "./admin.constant";
import { AdminUsersService } from "./adminUsers.service";

const listSchema = z.object({
  query: z.object({
    role: z.enum(["brand", "creator"]).optional(),
    status: z.enum(Object.values(USER_STATUS) as [string, ...string[]]).optional(),
    approval: z.enum(Object.values(APPROVAL_STATUS) as [string, ...string[]]).optional(),
    q: z.string().trim().min(2).max(100).optional(),
    sort: z
      .enum(["recent", "oldest", "volume_desc", "volume_asc", "deals_desc", "deals_asc", "name_asc", "name_desc"])
      .default("recent"),
    ...zPagination,
  }),
});

const suspendSchema = z.object({
  params: z.object({ id: zObjectId }),
  body: z.object({
    actionType: z.enum(["warning", "temporary", "permanent"]),
    reason: z.string().trim().min(3).max(1000),
    escrowDisposition: z.enum(["hold", "refund"]).default("hold"),
    notes: z.string().trim().max(2000).optional(),
    until: z.coerce.date().optional(),
  }),
});

const actionRequiredSchema = z.object({
  params: z.object({ id: zObjectId }),
  body: z.object({ note: z.string().trim().min(3).max(1000) }),
});

const featureSchema = z.object({ params: z.object({ id: zObjectId }), body: z.object({ isFeatured: z.boolean() }) });

const ok = (res: Response, data?: unknown, message?: string) => sendResponse(res, { statusCode: StatusCodes.OK, message, data });

/** `/admin/users` */
export const AdminUserRoutes = express.Router();

AdminUserRoutes.get(
  "/",
  adminAuth(PERMISSION.usersView),
  validateRequest(listSchema),
  catchAsync(async (req: Request, res: Response) => {
    const { items, meta } = await AdminUsersService.list(req.query as any);
    sendResponse(res, { statusCode: StatusCodes.OK, data: items, meta });
  }),
);
AdminUserRoutes.get(
  "/:id",
  adminAuth(PERMISSION.usersView),
  validateRequest(zIdParam),
  catchAsync(async (req: Request, res: Response) => ok(res, await AdminUsersService.getOne(req.params.id))),
);
AdminUserRoutes.post(
  "/:id/suspend",
  adminAuth(PERMISSION.usersSuspend),
  accountWriteLimiter,
  validateRequest(suspendSchema),
  catchAsync(async (req: Request, res: Response) =>
    ok(res, await AdminUsersService.suspend(req, req.params.id, req.body), "User action applied"),
  ),
);
AdminUserRoutes.post(
  "/:id/reactivate",
  adminAuth(PERMISSION.usersSuspend),
  accountWriteLimiter,
  validateRequest(zIdParam),
  catchAsync(async (req: Request, res: Response) => ok(res, await AdminUsersService.reactivate(req, req.params.id), "User reactivated")),
);

/** `/admin/creators` — approval queue actions */
export const AdminCreatorRoutes = express.Router();
AdminCreatorRoutes.use(adminAuth(PERMISSION.creatorsApprove), accountWriteLimiter);

AdminCreatorRoutes.post(
  "/:id/approve",
  validateRequest(zIdParam),
  catchAsync(async (req: Request, res: Response) =>
    ok(res, await AdminUsersService.reviewCreator(req, req.params.id, "approved"), "Creator approved"),
  ),
);
AdminCreatorRoutes.post(
  "/:id/action-required",
  validateRequest(actionRequiredSchema),
  catchAsync(async (req: Request, res: Response) =>
    ok(res, await AdminUsersService.reviewCreator(req, req.params.id, "action_required", req.body.note), "Creator asked for changes"),
  ),
);
AdminCreatorRoutes.post(
  "/:id/feature",
  validateRequest(featureSchema),
  catchAsync(async (req: Request, res: Response) =>
    ok(res, await AdminUsersService.setFeatured(req, req.params.id, req.body.isFeatured)),
  ),
);
