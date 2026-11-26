import express, { Request, Response } from "express";
import { StatusCodes } from "http-status-codes";
import { z } from "zod";
import catchAsync from "../../../shared/catchAsync";
import sendResponse from "../../../shared/sendResponse";
import { zPagination } from "../../../shared/zod";
import { adminAuth, userAuth } from "../../middlewares/auth";
import validateRequest from "../../middlewares/validateRequest";
import { PERMISSION } from "../admin/admin.constant";
import { PayoutService } from "../payout/payout.service";
import { PaymentService } from "./payment.service";
import { PaymentHistoryService } from "./payment.history.service";

/** `/payments` — the logged-in brand's payment history. */
export const PaymentRoutes = express.Router();

PaymentRoutes.get(
  "/me",
  userAuth("brand"),
  catchAsync(async (req: Request, res: Response) => {
    sendResponse(res, { statusCode: StatusCodes.OK, data: await PaymentHistoryService.listForBrand(req.user!.id) });
  }),
);

PaymentRoutes.get(
  "/:paymentId/stripe-document",
  userAuth("brand"),
  validateRequest(z.object({ params: z.object({ paymentId: z.string().regex(/^[a-f0-9]{24}$/i) }) })),
  catchAsync(async (req: Request, res: Response) => {
    sendResponse(res, { statusCode: StatusCodes.OK, data: await PaymentService.stripeDocument(req.user!.id, req.params.paymentId) });
  }),
);

/** `/admin/transactions` — brand payments or creator payouts, with platform totals. */
export const AdminTransactionRoutes = express.Router();

AdminTransactionRoutes.post(
  "/payouts/:payoutId/retry",
  adminAuth(PERMISSION.transactionsRetryPayout),
  validateRequest(z.object({ params: z.object({ payoutId: z.string().regex(/^[a-f0-9]{24}$/i) }) })),
  catchAsync(async (req: Request, res: Response) => {
    const data = await PayoutService.retryFailedPayout(req.params.payoutId);
    sendResponse(res, { statusCode: StatusCodes.OK, message: "Payout retry submitted", data });
  }),
);

AdminTransactionRoutes.get(
  "/",
  adminAuth(PERMISSION.transactionsView),
  validateRequest(
    z.object({ query: z.object({ tab: z.enum(["payments", "payouts"]).default("payments"), q: z.string().trim().min(2).max(40).optional(), ...zPagination }) }),
  ),
  catchAsync(async (req: Request, res: Response) => {
    const { items, meta, stats } = await PaymentHistoryService.adminList(req.query as any);
    sendResponse(res, { statusCode: StatusCodes.OK, data: { items, stats }, meta });
  }),
);
