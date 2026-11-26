import express, { Request, Response } from "express";
import { StatusCodes } from "http-status-codes";
import { z } from "zod";
import catchAsync from "../../../shared/catchAsync";
import sendResponse from "../../../shared/sendResponse";
import { accountWriteLimiter } from "../../../shared/rateLimiter";
import { zIdParam, zObjectId, zPagination } from "../../../shared/zod";
import { adminAuth, userAuth } from "../../middlewares/auth";
import validateRequest from "../../middlewares/validateRequest";
import { PERMISSION } from "../admin/admin.constant";
import { SupportService } from "../support/support.service";
import { ORDER_LIMITS, ORDER_STATUSES } from "./order.constant";
import { OrderLifecycleService } from "./order.lifecycle.service";
import { OrderService } from "./order.service";
import { OrderStatsService } from "./order.stats.service";

/** `/orders` — campaigns of the logged-in brand / creator. */
export const OrderRoutes = express.Router();
OrderRoutes.use(userAuth("brand", "creator"));

const viewer = (req: Request) => ({ id: req.user!.id, role: req.user!.role, email: req.user!.email });

/** Brand funds the escrow of an order still `awaiting_payment` → Stripe Checkout URL. */
OrderRoutes.post(
  "/:id/pay",
  userAuth("brand"),
  accountWriteLimiter,
  validateRequest(zIdParam),
  catchAsync(async (req: Request, res: Response) => {
    sendResponse(res, { statusCode: StatusCodes.OK, data: await OrderService.startPayment(viewer(req), req.params.id) });
  }),
);
const idParams = z.object({ id: zObjectId });

const deliverableSchema = z.object({
  params: idParams,
  body: z
    .object({
      title: z.string().trim().min(1, "Give the deliverable a name").max(200),
      notes: z.string().trim().max(2000).optional(),
      fileIds: z.array(zObjectId).max(ORDER_LIMITS.maxFilesPerSubmission).default([]),
      links: z
        .array(z.string().trim().url("Enter a valid link (https://…)").max(2048).refine((u) => /^https?:\/\//i.test(u), "Links must start with http(s)://"))
        .max(ORDER_LIMITS.maxLinksPerSubmission)
        .default([]),
    })
    .refine((b) => b.fileIds.length > 0 || b.links.length > 0, { message: "Upload at least one file or add a cloud link", path: ["fileIds"] }),
});
const revisionSchema = z.object({ params: idParams, body: z.object({ notes: z.string().trim().min(3, "Describe the revisions needed").max(2000) }) });
const reviewSchema = z.object({
  params: idParams,
  body: z.object({ rating: z.coerce.number().int().min(1).max(5), comment: z.string().trim().min(3, "Write a short review").max(2000) }),
});
const reportSchema = z.object({
  params: idParams,
  body: z.object({
    category: z.string().trim().min(3).max(120),
    reason: z.string().trim().min(10, "Describe the issue (at least 10 characters)").max(4000),
  }),
});

const ok = (res: Response, data: unknown, message?: string) => sendResponse(res, { statusCode: StatusCodes.OK, message, data });

/** Creator submits files / links → `deliverable_submitted`, the brand has 7 days to review. */
OrderRoutes.post(
  "/:id/deliverables",
  userAuth("creator"),
  accountWriteLimiter,
  validateRequest(deliverableSchema),
  catchAsync(async (req: Request, res: Response) => {
    await OrderLifecycleService.submitDeliverable(viewer(req), req.params.id, req.body);
    ok(res, await OrderService.getOne(viewer(req), req.params.id), "Deliverables submitted for review");
  }),
);

/** Brand sends the work back with notes (also posted in the chat thread). */
OrderRoutes.post(
  "/:id/revision",
  userAuth("brand"),
  accountWriteLimiter,
  validateRequest(revisionSchema),
  catchAsync(async (req: Request, res: Response) => {
    await OrderLifecycleService.requestRevision(viewer(req), req.params.id, req.body.notes);
    ok(res, await OrderService.getOne(viewer(req), req.params.id), "Revision request sent");
  }),
);

/** Brand approves → escrow released to the creator (payout). */
OrderRoutes.post(
  "/:id/approve",
  userAuth("brand"),
  accountWriteLimiter,
  validateRequest(zIdParam),
  catchAsync(async (req: Request, res: Response) => {
    await OrderLifecycleService.approve(viewer(req), req.params.id);
    ok(res, await OrderService.getOne(viewer(req), req.params.id), "Deliverables approved — payment released");
  }),
);

/** Brand reviews the creator → campaign completed. */
OrderRoutes.post(
  "/:id/review",
  userAuth("brand"),
  accountWriteLimiter,
  validateRequest(reviewSchema),
  catchAsync(async (req: Request, res: Response) => {
    await OrderLifecycleService.review(viewer(req), req.params.id, req.body);
    ok(res, await OrderService.getOne(viewer(req), req.params.id), "Review submitted — campaign completed");
  }),
);

/** Brand or creator reports an issue → support ticket, order on hold. */
OrderRoutes.post(
  "/:id/report-issue",
  accountWriteLimiter,
  validateRequest(reportSchema),
  catchAsync(async (req: Request, res: Response) => {
    await SupportService.openOrderIssue(viewer(req), req.params.id, req.body);
    ok(res, await OrderService.getOne(viewer(req), req.params.id), "Support ticket opened");
  }),
);

/** Dashboard overview: totals + 12-month chart for `year` (default: this year). Declared before "/:id". */
OrderRoutes.get(
  "/stats",
  validateRequest(z.object({ query: z.object({ year: z.coerce.number().int().min(2020).max(2100).optional() }) })),
  catchAsync(async (req: Request, res: Response) => {
    const year = Number(req.query.year) || new Date().getUTCFullYear();
    ok(res, await OrderStatsService.dashboard(viewer(req), year));
  }),
);

const listQuery = z.object({ query: z.object({ status: z.enum(ORDER_STATUSES).optional(), ...zPagination }) });

OrderRoutes.get(
  "/",
  validateRequest(listQuery),
  catchAsync(async (req: Request, res: Response) => {
    const { items, meta } = await OrderService.list(viewer(req), req.query as any);
    sendResponse(res, { statusCode: StatusCodes.OK, data: items, meta });
  }),
);

OrderRoutes.get(
  "/:id",
  validateRequest(zIdParam),
  catchAsync(async (req: Request, res: Response) => {
    sendResponse(res, { statusCode: StatusCodes.OK, data: await OrderService.getOne(viewer(req), req.params.id) });
  }),
);

/** `/admin/orders` — every order with status counts (dashboard). */
export const AdminOrderRoutes = express.Router();

AdminOrderRoutes.get(
  "/",
  adminAuth(PERMISSION.ordersView),
  validateRequest(
    z.object({ query: z.object({ status: z.enum(ORDER_STATUSES).optional(), q: z.string().trim().min(2).max(40).optional(), ...zPagination }) }),
  ),
  catchAsync(async (req: Request, res: Response) => {
    const { items, meta, stats } = await OrderService.adminList(req.query as any);
    sendResponse(res, { statusCode: StatusCodes.OK, data: { items, stats }, meta });
  }),
);
