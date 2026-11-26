import express, { Request, Response } from "express";
import { StatusCodes } from "http-status-codes";
import { z } from "zod";
import catchAsync from "../../../shared/catchAsync";
import sendResponse from "../../../shared/sendResponse";
import { zIdParam, zObjectId } from "../../../shared/zod";
import { uploadLimiter } from "../../../shared/rateLimiter";
import { idempotent } from "../../../shared/idempotency";
import { adminAuth, userAuth } from "../../middlewares/auth";
import validateRequest from "../../middlewares/validateRequest";
import { UPLOADABLE_CONTEXTS } from "./upload.constant";
import { UploadService } from "./upload.service";
import ApiError from "../../../errors/ApiErrors";
import { verifyLocalSignature } from "../../../shared/localStorage";

const presignSchema = z.object({
  body: z.object({
    context: z.enum(UPLOADABLE_CONTEXTS as [string, ...string[]]),
    fileName: z.string().trim().min(1).max(255),
    mime: z.string().trim().toLowerCase().max(120),
    sizeBytes: z.number().int().positive(),
  }),
});

const completeSchema = z.object({
  params: z.object({ id: zObjectId }),
  body: z
    .object({
      width: z.number().int().positive().optional(),
      height: z.number().int().positive().optional(),
      durationSec: z.number().positive().optional(),
    })
    .default({}),
});

/** Users (`/uploads`, `/files`) and admins (`/admin/uploads`, `/admin/files`) share the same handlers. */
const build = (kind: "user" | "admin") => {
  const auth = kind === "user" ? userAuth() : adminAuth();
  const owner = (req: Request) => ({ type: kind, id: kind === "user" ? req.user!.id : req.admin!.id });

  const uploads = express.Router();
  uploads.post(
    "/presign",
    uploadLimiter,
    auth,
    idempotent(),
    validateRequest(presignSchema),
    catchAsync(async (req: Request, res: Response) => {
      const data = await UploadService.presign(owner(req), req.body);
      sendResponse(res, { statusCode: StatusCodes.CREATED, data });
    }),
  );
  uploads.post(
    "/:id/complete",
    auth,
    validateRequest(completeSchema),
    catchAsync(async (req: Request, res: Response) => {
      const data = await UploadService.complete(owner(req), req.params.id, req.body);
      sendResponse(res, { statusCode: StatusCodes.OK, data });
    }),
  );

  const files = express.Router();
  files.get(
    "/:id/url",
    auth,
    validateRequest(zIdParam),
    catchAsync(async (req: Request, res: Response) => {
      res.setHeader("Cache-Control", "private, no-store");
      sendResponse(res, { statusCode: StatusCodes.OK, data: await UploadService.signedUrl(owner(req), req.params.id) });
    }),
  );
  return { uploads, files };
};

const userRoutes = build("user");

// ---------------------------------------------------------------------------
// Local disk storage targets (the default when S3 is not configured).
// No bearer token: like S3 presigned URLs, the HMAC signature in the query string is the permission.
// ---------------------------------------------------------------------------
const localSigned = (action: "put" | "get") => (req: Request, _res: Response, next: express.NextFunction) => {
  if (!verifyLocalSignature(action, req.params.id, req.query.exp, req.query.sig)) {
    return next(new ApiError(StatusCodes.FORBIDDEN, "Upload link is invalid or has expired"));
  }
  next();
};

userRoutes.uploads.put(
  "/:id/local",
  validateRequest(zIdParam),
  localSigned("put"),
  catchAsync(async (req: Request, res: Response) => {
    await UploadService.receiveLocalUpload(req.params.id, req.headers["content-type"], req);
    sendResponse(res, { statusCode: StatusCodes.OK, message: "Uploaded" });
  }),
);

userRoutes.files.get(
  "/:id/local",
  validateRequest(zIdParam),
  localSigned("get"),
  catchAsync(async (req: Request, res: Response) => {
    const file = await UploadService.localFileForDownload(req.params.id);
    res.setHeader("Cache-Control", "private, no-store");
    res.setHeader("Content-Disposition", `inline; filename="${file.name}"`);
    res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
    res.type(file.mime).sendFile(file.path);
  }),
);
const adminRoutes = build("admin");

export const UploadRoutes = userRoutes.uploads;
export const FileRoutes = userRoutes.files;
export const AdminUploadRoutes = adminRoutes.uploads;
export const AdminFileRoutes = adminRoutes.files;
