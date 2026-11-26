import express, { Request, Response } from "express";
import { StatusCodes } from "http-status-codes";
import { z } from "zod";
import catchAsync from "../../../shared/catchAsync";
import { idempotent } from "../../../shared/idempotency";
import { accountWriteLimiter } from "../../../shared/rateLimiter";
import sendResponse from "../../../shared/sendResponse";
import { zIdParam, zObjectId, zPagination, zUrl } from "../../../shared/zod";
import { adminAuth, userAuth } from "../../middlewares/auth";
import validateRequest from "../../middlewares/validateRequest";
import { PERMISSION } from "../admin/admin.constant";
import { VERIFICATION_STATUS } from "./verification.model";
import { VerificationService } from "./verification.service";

const applySchema = z.object({
  body: z
    .object({
      platforms: z
        .object({ instagram: zUrl.optional(), tiktok: zUrl.optional(), youtube: zUrl.optional() })
        .refine((p) => Object.values(p).some(Boolean), "Add at least one channel URL"),
      primaryPlatform: z.enum(["instagram", "tiktok", "youtube"]).optional(),
      followersTotal: z.number().int().min(0).optional(),
      avgViews: z.number().int().min(0).optional(),
      sampleWork: z
        .object({
          title: z.string().trim().max(120).optional(),
          url: zUrl.optional(),
          views: z.number().int().min(0).optional(),
          fileId: zObjectId.optional(),
        })
        .optional(),
      note: z.string().trim().max(1000).optional(),
    })
    .strict(),
});

const listSchema = z.object({
  query: z.object({
    status: z.enum(Object.values(VERIFICATION_STATUS) as [string, ...string[]]).optional(),
    q: z.string().trim().max(100).optional(),
    ...zPagination,
  }),
});

const rejectSchema = z.object({
  params: z.object({ id: zObjectId }),
  body: z.object({ reason: z.string().trim().min(3).max(1000) }),
});

const ok = (res: Response, data?: unknown, message?: string, statusCode: number = StatusCodes.OK) =>
  sendResponse(res, { statusCode, message, data });

/** `/me/verification-requests` — creators. */
export const CreatorVerificationRoutes = express.Router();
CreatorVerificationRoutes.use(userAuth("creator"), accountWriteLimiter);

CreatorVerificationRoutes.post(
  "/",
  idempotent(),
  validateRequest(applySchema),
  catchAsync(async (req: Request, res: Response) =>
    ok(res, await VerificationService.apply(req.user!.id, req.body), "Verification request submitted", StatusCodes.CREATED),
  ),
);
CreatorVerificationRoutes.get(
  "/latest",
  catchAsync(async (req: Request, res: Response) => ok(res, await VerificationService.latestForCreator(req.user!.id))),
);

/** `/admin/verifications` — permission `verification.manage`. */
export const AdminVerificationRoutes = express.Router();
AdminVerificationRoutes.use(adminAuth(PERMISSION.verificationManage), accountWriteLimiter);

AdminVerificationRoutes.get(
  "/",
  validateRequest(listSchema),
  catchAsync(async (req: Request, res: Response) => {
    const { items, meta } = await VerificationService.adminList(req.query as any);
    sendResponse(res, { statusCode: StatusCodes.OK, data: items, meta });
  }),
);
AdminVerificationRoutes.get(
  "/:id",
  validateRequest(zIdParam),
  catchAsync(async (req: Request, res: Response) => ok(res, await VerificationService.adminGet(req.params.id))),
);
AdminVerificationRoutes.post(
  "/:id/approve",
  validateRequest(zIdParam),
  catchAsync(async (req: Request, res: Response) =>
    ok(res, await VerificationService.review(req, req.params.id, "approved"), "Creator verified"),
  ),
);
AdminVerificationRoutes.post(
  "/:id/reject",
  validateRequest(rejectSchema),
  catchAsync(async (req: Request, res: Response) =>
    ok(res, await VerificationService.review(req, req.params.id, "rejected", req.body.reason), "Request rejected"),
  ),
);
