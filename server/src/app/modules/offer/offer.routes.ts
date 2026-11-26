import express, { Request, Response } from "express";
import { StatusCodes } from "http-status-codes";
import catchAsync from "../../../shared/catchAsync";
import { accountWriteLimiter } from "../../../shared/rateLimiter";
import sendResponse from "../../../shared/sendResponse";
import { zIdParam } from "../../../shared/zod";
import { userAuth } from "../../middlewares/auth";
import validateRequest from "../../middlewares/validateRequest";
import { OfferService } from "./offer.service";
import { OfferValidation } from "./offer.validation";

/** `/offers` — see offer.service.ts for the two directions. */
export const OfferRoutes = express.Router();
OfferRoutes.use(userAuth("brand", "creator"), accountWriteLimiter);

const viewer = (req: Request) => ({ id: req.user!.id, role: req.user!.role, name: req.user!.name, email: req.user!.email });

/** Brand reopens Stripe Checkout for an offer whose payment was not completed. */
OfferRoutes.post(
  "/:id/checkout",
  userAuth("brand"),
  validateRequest(zIdParam),
  catchAsync(async (req: Request, res: Response) => {
    sendResponse(res, { statusCode: StatusCodes.OK, data: await OfferService.resumeCheckout(viewer(req), req.params.id) });
  }),
);

/** Brand → creator. */
OfferRoutes.post(
  "/",
  userAuth("brand"),
  validateRequest(OfferValidation.createBrandOffer),
  catchAsync(async (req: Request, res: Response) => {
    sendResponse(res, {
      statusCode: StatusCodes.CREATED,
      message: "Complete the payment to send the offer",
      data: await OfferService.createBrandOffer(viewer(req), req.body),
    });
  }),
);

/** Creator → brand, inside a chat thread. Returns the chat message (with the offer embedded). */
OfferRoutes.post(
  "/custom",
  userAuth("creator"),
  validateRequest(OfferValidation.createCreatorOffer),
  catchAsync(async (req: Request, res: Response) => {
    sendResponse(res, {
      statusCode: StatusCodes.CREATED,
      message: "Custom offer sent",
      data: await OfferService.createCreatorOffer(viewer(req), req.body),
    });
  }),
);

OfferRoutes.get(
  "/",
  validateRequest(OfferValidation.list),
  catchAsync(async (req: Request, res: Response) => {
    const { items, meta } = await OfferService.list(viewer(req), req.query as any);
    sendResponse(res, { statusCode: StatusCodes.OK, data: items, meta });
  }),
);

// Declared before "/:id" so it isn't read as an id.
OfferRoutes.get(
  "/pending-count",
  catchAsync(async (req: Request, res: Response) => {
    sendResponse(res, { statusCode: StatusCodes.OK, data: { total: await OfferService.pendingReceivedCount(viewer(req)) } });
  }),
);

OfferRoutes.get(
  "/:id",
  validateRequest(zIdParam),
  catchAsync(async (req: Request, res: Response) => {
    sendResponse(res, { statusCode: StatusCodes.OK, data: await OfferService.getOne(viewer(req), req.params.id) });
  }),
);

OfferRoutes.post(
  "/:id/accept",
  validateRequest(zIdParam),
  catchAsync(async (req: Request, res: Response) => {
    sendResponse(res, { statusCode: StatusCodes.OK, data: await OfferService.changeStatus(viewer(req), req.params.id, "accept") });
  }),
);

OfferRoutes.post(
  "/:id/decline",
  validateRequest(OfferValidation.decline),
  catchAsync(async (req: Request, res: Response) => {
    sendResponse(res, {
      statusCode: StatusCodes.OK,
      message: "Offer declined",
      data: await OfferService.changeStatus(viewer(req), req.params.id, "decline", req.body.reason),
    });
  }),
);

OfferRoutes.post(
  "/:id/withdraw",
  validateRequest(zIdParam),
  catchAsync(async (req: Request, res: Response) => {
    sendResponse(res, { statusCode: StatusCodes.OK, message: "Offer withdrawn", data: await OfferService.changeStatus(viewer(req), req.params.id, "withdraw") });
  }),
);
