import express, { Request, Response } from "express";
import { StatusCodes } from "http-status-codes";
import catchAsync from "../../../shared/catchAsync";
import sendResponse from "../../../shared/sendResponse";
import { adminAuth } from "../../middlewares/auth";
import validateRequest from "../../middlewares/validateRequest";
import { PERMISSION } from "../admin/admin.constant";
import { CmsService } from "./cms.service";
import { CmsValidation } from "./cms.validation";

const ok = (res: Response, data?: unknown, message?: string, statusCode: number = StatusCodes.OK) =>
  sendResponse(res, { statusCode, message, data });

/** Lets browsers / CDN reuse public CMS responses for a minute (Redis caches longer server-side). */
const publicCache = (res: Response) => res.setHeader("Cache-Control", "public, max-age=60, stale-while-revalidate=300");

// ---------------------------------------------------------------------------
// Public: /cms/*
// ---------------------------------------------------------------------------
export const CmsPublicRoutes = express.Router();

CmsPublicRoutes.get(
  "/pages/:slug",
  validateRequest(CmsValidation.publicPage),
  catchAsync(async (req: Request, res: Response) => {
    publicCache(res);
    ok(res, await CmsService.getPublishedPage(req.params.slug));
  }),
);
CmsPublicRoutes.get(
  "/faqs",
  validateRequest(CmsValidation.publicFaqs),
  catchAsync(async (req: Request, res: Response) => {
    publicCache(res);
    ok(res, await CmsService.listPublishedFaqs(req.query.category as string | undefined));
  }),
);
CmsPublicRoutes.get(
  "/partner-brands",
  catchAsync(async (_req: Request, res: Response) => {
    publicCache(res);
    ok(res, await CmsService.listActivePartnerBrands());
  }),
);
CmsPublicRoutes.get(
  "/site",
  catchAsync(async (_req: Request, res: Response) => {
    publicCache(res);
    ok(res, await CmsService.getSite());
  }),
);

// ---------------------------------------------------------------------------
// Admin: /admin/cms/* (permission `cms.manage`)
// ---------------------------------------------------------------------------
export const AdminCmsRoutes = express.Router();
AdminCmsRoutes.use(adminAuth(PERMISSION.cmsManage));

AdminCmsRoutes.get(
  "/pages/:slug",
  validateRequest(CmsValidation.publicPage),
  catchAsync(async (req: Request, res: Response) => ok(res, await CmsService.adminGetPage(req.params.slug))),
);
AdminCmsRoutes.put(
  "/pages/:slug",
  validateRequest(CmsValidation.savePage),
  catchAsync(async (req: Request, res: Response) =>
    ok(res, await CmsService.adminSavePage(req, req.params.slug, req.body), "Page saved"),
  ),
);

AdminCmsRoutes.get(
  "/faqs",
  validateRequest(CmsValidation.adminFaqs),
  catchAsync(async (req: Request, res: Response) => ok(res, await CmsService.adminListFaqs(req.query.category as string | undefined))),
);
AdminCmsRoutes.post(
  "/faqs",
  validateRequest(CmsValidation.createFaq),
  catchAsync(async (req: Request, res: Response) => ok(res, await CmsService.adminCreateFaq(req, req.body), "FAQ added", StatusCodes.CREATED)),
);
AdminCmsRoutes.patch(
  "/faqs/:id",
  validateRequest(CmsValidation.updateFaq),
  catchAsync(async (req: Request, res: Response) => ok(res, await CmsService.adminUpdateFaq(req, req.params.id, req.body), "FAQ updated")),
);
AdminCmsRoutes.delete(
  "/faqs/:id",
  validateRequest(CmsValidation.idParam),
  catchAsync(async (req: Request, res: Response) => {
    await CmsService.adminDeleteFaq(req, req.params.id);
    ok(res, undefined, "FAQ deleted");
  }),
);
AdminCmsRoutes.post(
  "/faqs/:id/move",
  validateRequest(CmsValidation.moveItem),
  catchAsync(async (req: Request, res: Response) => ok(res, await CmsService.adminMoveFaq(req, req.params.id, req.body.direction))),
);

AdminCmsRoutes.get(
  "/partner-brands",
  catchAsync(async (_req: Request, res: Response) => ok(res, await CmsService.adminListPartnerBrands())),
);
AdminCmsRoutes.post(
  "/partner-brands",
  validateRequest(CmsValidation.createPartnerBrand),
  catchAsync(async (req: Request, res: Response) =>
    ok(res, await CmsService.adminCreatePartnerBrand(req, req.body), "Partner brand added", StatusCodes.CREATED),
  ),
);
AdminCmsRoutes.patch(
  "/partner-brands/:id",
  validateRequest(CmsValidation.updatePartnerBrand),
  catchAsync(async (req: Request, res: Response) =>
    ok(res, await CmsService.adminUpdatePartnerBrand(req, req.params.id, req.body), "Partner brand updated"),
  ),
);
AdminCmsRoutes.delete(
  "/partner-brands/:id",
  validateRequest(CmsValidation.idParam),
  catchAsync(async (req: Request, res: Response) => {
    await CmsService.adminDeletePartnerBrand(req, req.params.id);
    ok(res, undefined, "Partner brand removed");
  }),
);
AdminCmsRoutes.post(
  "/partner-brands/:id/move",
  validateRequest(CmsValidation.moveItem),
  catchAsync(async (req: Request, res: Response) =>
    ok(res, await CmsService.adminMovePartnerBrand(req, req.params.id, req.body.direction)),
  ),
);

AdminCmsRoutes.get(
  "/site",
  catchAsync(async (_req: Request, res: Response) => ok(res, await CmsService.adminGetSite())),
);
AdminCmsRoutes.patch(
  "/site",
  validateRequest(CmsValidation.updateSite),
  catchAsync(async (req: Request, res: Response) => ok(res, await CmsService.adminUpdateSite(req, req.body), "Site settings saved")),
);
