import express, { Request, Response } from "express";
import { StatusCodes } from "http-status-codes";
import { z } from "zod";
import catchAsync from "../../../shared/catchAsync";
import { accountWriteLimiter } from "../../../shared/rateLimiter";
import sendResponse from "../../../shared/sendResponse";
import { zObjectId, zPagination } from "../../../shared/zod";
import { userAuth } from "../../middlewares/auth";
import validateRequest from "../../middlewares/validateRequest";
import { SavedService } from "./saved.service";

const creatorParam = z.object({ params: z.object({ creatorId: zObjectId }) });
const listQuery = z.object({ query: z.object(zPagination) });

/** `/me/saved-creators` — brands only. */
export const SavedCreatorRoutes = express.Router();
SavedCreatorRoutes.use(userAuth("brand"), accountWriteLimiter);

SavedCreatorRoutes.get(
  "/",
  validateRequest(listQuery),
  catchAsync(async (req: Request, res: Response) => {
    const { page, limit } = req.query as unknown as { page: number; limit: number };
    const { items, meta } = await SavedService.list(req.user!.id, page, limit);
    sendResponse(res, { statusCode: StatusCodes.OK, data: items, meta });
  }),
);

SavedCreatorRoutes.put(
  "/:creatorId",
  validateRequest(creatorParam),
  catchAsync(async (req: Request, res: Response) => {
    sendResponse(res, { statusCode: StatusCodes.OK, message: "Creator saved", data: await SavedService.save(req.user!.id, req.params.creatorId) });
  }),
);

SavedCreatorRoutes.delete(
  "/:creatorId",
  validateRequest(creatorParam),
  catchAsync(async (req: Request, res: Response) => {
    sendResponse(res, { statusCode: StatusCodes.OK, message: "Creator removed", data: await SavedService.unsave(req.user!.id, req.params.creatorId) });
  }),
);
