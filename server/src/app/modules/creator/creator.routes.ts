import express, { Request, Response } from "express";
import { StatusCodes } from "http-status-codes";
import catchAsync from "../../../shared/catchAsync";
import sendResponse from "../../../shared/sendResponse";
import { optionalUserAuth } from "../../middlewares/auth";
import validateRequest from "../../middlewares/validateRequest";
import { CreatorService } from "./creator.service";
import { CreatorSearchService } from "./creator.search.service";
import { CreatorValidation } from "./creator.validation";

/** Public creator endpoints (docs/00 §5.4). Setting Cache-Control lets the CDN / browser cache too. */
const router = express.Router();

const publicCache = (res: Response, seconds: number) =>
  res.setHeader("Cache-Control", `public, max-age=${seconds}, stale-while-revalidate=${seconds * 2}`);

router.get(
  "/",
  validateRequest(CreatorValidation.search),
  catchAsync(async (req: Request, res: Response) => {
    const { items, meta } = await CreatorSearchService.search(req.query as any);
    publicCache(res, 30);
    sendResponse(res, { statusCode: StatusCodes.OK, data: items, meta });
  }),
);

router.get(
  "/suggest",
  validateRequest(CreatorValidation.suggest),
  catchAsync(async (req: Request, res: Response) => {
    publicCache(res, 30);
    sendResponse(res, { statusCode: StatusCodes.OK, data: await CreatorSearchService.suggest(String(req.query.q)) });
  }),
);

router.get(
  "/featured",
  catchAsync(async (_req: Request, res: Response) => {
    publicCache(res, 120);
    sendResponse(res, { statusCode: StatusCodes.OK, data: await CreatorSearchService.featured() });
  }),
);

router.get(
  "/handle-available",
  optionalUserAuth,
  validateRequest(CreatorValidation.handleAvailable),
  catchAsync(async (req: Request, res: Response) => {
    sendResponse(res, {
      statusCode: StatusCodes.OK,
      data: await CreatorService.handleAvailable(String(req.query.handle), req.user?.id),
    });
  }),
);

router.get(
  "/:idOrHandle",
  optionalUserAuth,
  validateRequest(CreatorValidation.idOrHandle),
  catchAsync(async (req: Request, res: Response) => {
    const data = await CreatorSearchService.getPublic(req.params.idOrHandle, req.user?.id);
    if (!req.user) publicCache(res, 60);
    sendResponse(res, { statusCode: StatusCodes.OK, data });
  }),
);

export const CreatorRoutes = router;
