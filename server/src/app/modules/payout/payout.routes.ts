import express, { Request, Response } from "express";
import { StatusCodes } from "http-status-codes";
import catchAsync from "../../../shared/catchAsync";
import { accountWriteLimiter } from "../../../shared/rateLimiter";
import sendResponse from "../../../shared/sendResponse";
import { userAuth } from "../../middlewares/auth";
import { PayoutService } from "./payout.service";

/** `/payouts` — the logged-in creator's payouts and Stripe Connect payout account. */
export const PayoutRoutes = express.Router();
PayoutRoutes.use(userAuth("creator"));

const ok = (res: Response, data: unknown) => sendResponse(res, { statusCode: StatusCodes.OK, data });

/** Payouts page: totals + rows + account state. */
PayoutRoutes.get(
  "/me",
  catchAsync(async (req: Request, res: Response) => ok(res, await PayoutService.listForCreator(req.user!.id))),
);

PayoutRoutes.get(
  "/account",
  catchAsync(async (req: Request, res: Response) => ok(res, await PayoutService.accountStatus(req.user!.id))),
);

/** Start / continue Stripe onboarding → `{ url }` to redirect to. */
PayoutRoutes.post(
  "/connect",
  accountWriteLimiter,
  catchAsync(async (req: Request, res: Response) =>
    ok(res, await PayoutService.connectOnboarding({ id: req.user!.id, email: req.user!.email })),
  ),
);

/** Stripe Express dashboard (bank account, payout schedule) → `{ url }`. */
PayoutRoutes.post(
  "/dashboard",
  accountWriteLimiter,
  catchAsync(async (req: Request, res: Response) => ok(res, await PayoutService.dashboardLink(req.user!.id))),
);
