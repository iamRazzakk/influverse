import express, { Request, Response } from "express";
import { StatusCodes } from "http-status-codes";
import catchAsync from "../../../shared/catchAsync";
import sendResponse from "../../../shared/sendResponse";
import { idempotent } from "../../../shared/idempotency";
import { accountWriteLimiter } from "../../../shared/rateLimiter";
import { userAuth } from "../../middlewares/auth";
import validateRequest from "../../middlewares/validateRequest";
import { PackageService } from "./package.service";
import { PackageValidation } from "./package.validation";

/** `/me/packages` — creator rate card (docs/00-final-plan.md §5.5). Creators only. */
export const PackageRoutes = express.Router();
PackageRoutes.use(userAuth("creator"), accountWriteLimiter);

const ok = (res: Response, data?: unknown, message?: string, statusCode: number = StatusCodes.OK) =>
  sendResponse(res, { statusCode, message, data });

PackageRoutes.get(
  "/",
  catchAsync(async (req: Request, res: Response) => ok(res, await PackageService.listMine(req.user!.id))),
);

PackageRoutes.post(
  "/",
  idempotent(),
  validateRequest(PackageValidation.create),
  catchAsync(async (req: Request, res: Response) =>
    ok(res, await PackageService.createPackage(req.user!.id, req.body), "Package created", StatusCodes.CREATED),
  ),
);

// Declared before "/:id" so "reorder" isn't read as an id.
PackageRoutes.patch(
  "/reorder",
  validateRequest(PackageValidation.reorder),
  catchAsync(async (req: Request, res: Response) => ok(res, await PackageService.reorderPackages(req.user!.id, req.body.ids))),
);

/** Also used for the active / inactive toggle: `PATCH { isActive: false }`. */
PackageRoutes.patch(
  "/:id",
  validateRequest(PackageValidation.update),
  catchAsync(async (req: Request, res: Response) =>
    ok(res, await PackageService.updatePackage(req.user!.id, req.params.id, req.body), "Package updated"),
  ),
);

PackageRoutes.delete(
  "/:id",
  validateRequest(PackageValidation.idParam),
  catchAsync(async (req: Request, res: Response) => {
    await PackageService.archivePackage(req.user!.id, req.params.id);
    ok(res, undefined, "Package removed");
  }),
);

PackageRoutes.post(
  "/:id/duplicate",
  validateRequest(PackageValidation.idParam),
  catchAsync(async (req: Request, res: Response) =>
    ok(res, await PackageService.duplicatePackage(req.user!.id, req.params.id), "Package duplicated", StatusCodes.CREATED),
  ),
);
