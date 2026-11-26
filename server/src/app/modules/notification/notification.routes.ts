import express, { Request, Response } from "express";
import { StatusCodes } from "http-status-codes";
import { z } from "zod";
import catchAsync from "../../../shared/catchAsync";
import sendResponse from "../../../shared/sendResponse";
import { zIdParam, zPagination, zQueryBool } from "../../../shared/zod";
import { adminAuth, userAuth } from "../../middlewares/auth";
import validateRequest from "../../middlewares/validateRequest";
import { NotificationService } from "./notification.service";

const listSchema = z.object({ query: z.object({ unread: zQueryBool.optional(), ...zPagination }) });

/** Same handler for user and admin — kind comes from the auth middleware */
const build = (kind: "user" | "admin", auth: express.RequestHandler) => {
  const router = express.Router();
  const who = (req: Request) => (kind === "user" ? req.user!.id : req.admin!.id);

  router.get(
    "/",
    auth,
    validateRequest(listSchema),
    catchAsync(async (req: Request, res: Response) => {
      const { items, meta } = await NotificationService.list(kind, who(req), req.query as any);
      sendResponse(res, { statusCode: StatusCodes.OK, data: items, meta });
    }),
  );
  router.get(
    "/unread-count",
    auth,
    catchAsync(async (req: Request, res: Response) => {
      sendResponse(res, { statusCode: StatusCodes.OK, data: { count: await NotificationService.unreadCount(kind, who(req)) } });
    }),
  );
  router.post(
    "/read-all",
    auth,
    catchAsync(async (req: Request, res: Response) => {
      await NotificationService.markAllRead(kind, who(req));
      sendResponse(res, { statusCode: StatusCodes.OK, message: "All marked as read" });
    }),
  );
  router.post(
    "/:id/read",
    auth,
    validateRequest(zIdParam),
    catchAsync(async (req: Request, res: Response) => {
      await NotificationService.markRead(kind, who(req), req.params.id);
      sendResponse(res, { statusCode: StatusCodes.OK, message: "Marked as read" });
    }),
  );
  return router;
};

export const NotificationRoutes = build("user", userAuth());
export const AdminNotificationRoutes = build("admin", adminAuth());
