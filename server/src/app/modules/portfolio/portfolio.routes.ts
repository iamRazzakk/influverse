import express, { Request, Response } from "express";
import { StatusCodes } from "http-status-codes";
import catchAsync from "../../../shared/catchAsync";
import sendResponse from "../../../shared/sendResponse";
import { idempotent } from "../../../shared/idempotency";
import { accountWriteLimiter } from "../../../shared/rateLimiter";
import { userAuth } from "../../middlewares/auth";
import validateRequest from "../../middlewares/validateRequest";
import { PortfolioService } from "./portfolio.service";
import { PortfolioValidation as V } from "./portfolio.validation";

const ok = (res: Response, data?: unknown, message?: string, statusCode: number = StatusCodes.OK) =>
  sendResponse(res, { statusCode, message, data });

/** `/me/portfolio` — creator's past / demo work. */
export const PortfolioRoutes = express.Router();
PortfolioRoutes.use(userAuth("creator"), accountWriteLimiter);

PortfolioRoutes.get("/", catchAsync(async (req: Request, res: Response) => ok(res, await PortfolioService.listPortfolio(req.user!.id))));
PortfolioRoutes.post(
  "/",
  idempotent(),
  validateRequest(V.createPortfolio),
  catchAsync(async (req: Request, res: Response) =>
    ok(res, await PortfolioService.createPortfolioItem(req.user!.id, req.body), "Portfolio item added", StatusCodes.CREATED),
  ),
);
PortfolioRoutes.patch(
  "/reorder",
  validateRequest(V.reorder),
  catchAsync(async (req: Request, res: Response) => ok(res, await PortfolioService.reorderPortfolio(req.user!.id, req.body.ids))),
);
PortfolioRoutes.patch(
  "/:id",
  validateRequest(V.updatePortfolio),
  catchAsync(async (req: Request, res: Response) =>
    ok(res, await PortfolioService.updatePortfolioItem(req.user!.id, req.params.id, req.body), "Portfolio item updated"),
  ),
);
PortfolioRoutes.delete(
  "/:id",
  validateRequest(V.idParam),
  catchAsync(async (req: Request, res: Response) => {
    await PortfolioService.deletePortfolioItem(req.user!.id, req.params.id);
    ok(res, undefined, "Portfolio item removed");
  }),
);

/** `/me/gallery` — lookbook photos. */
export const GalleryRoutes = express.Router();
GalleryRoutes.use(userAuth("creator"), accountWriteLimiter);

GalleryRoutes.get("/", catchAsync(async (req: Request, res: Response) => ok(res, await PortfolioService.listGallery(req.user!.id))));
GalleryRoutes.post(
  "/",
  idempotent(),
  validateRequest(V.createGallery),
  catchAsync(async (req: Request, res: Response) =>
    ok(res, await PortfolioService.createGalleryPhoto(req.user!.id, req.body), "Photo added", StatusCodes.CREATED),
  ),
);
GalleryRoutes.patch(
  "/reorder",
  validateRequest(V.reorder),
  catchAsync(async (req: Request, res: Response) => ok(res, await PortfolioService.reorderGallery(req.user!.id, req.body.ids))),
);
GalleryRoutes.patch(
  "/:id",
  validateRequest(V.updateGallery),
  catchAsync(async (req: Request, res: Response) =>
    ok(res, await PortfolioService.updateGalleryPhoto(req.user!.id, req.params.id, req.body), "Photo updated"),
  ),
);
GalleryRoutes.delete(
  "/:id",
  validateRequest(V.idParam),
  catchAsync(async (req: Request, res: Response) => {
    await PortfolioService.deleteGalleryPhoto(req.user!.id, req.params.id);
    ok(res, undefined, "Photo removed");
  }),
);
