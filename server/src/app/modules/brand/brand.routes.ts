import express, { Request, Response } from "express";
import { StatusCodes } from "http-status-codes";
import catchAsync from "../../../shared/catchAsync";
import sendResponse from "../../../shared/sendResponse";
import validateRequest from "../../middlewares/validateRequest";
import { BrandService } from "./brand.service";
import { BrandValidation } from "./brand.validation";

const router = express.Router();

router.get(
  "/:slug",
  validateRequest(BrandValidation.slugParam),
  catchAsync(async (req: Request, res: Response) => {
    res.setHeader("Cache-Control", "public, max-age=60, stale-while-revalidate=120");
    sendResponse(res, { statusCode: StatusCodes.OK, data: await BrandService.getPublic(req.params.slug) });
  }),
);

export const BrandRoutes = router;
