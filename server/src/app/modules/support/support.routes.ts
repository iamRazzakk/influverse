import express, { Request, Response } from "express";
import { StatusCodes } from "http-status-codes";
import { z } from "zod";
import catchAsync from "../../../shared/catchAsync";
import { accountWriteLimiter } from "../../../shared/rateLimiter";
import sendResponse from "../../../shared/sendResponse";
import { zIdParam, zObjectId, zPagination, zQueryBool } from "../../../shared/zod";
import { adminAuth, userAuth } from "../../middlewares/auth";
import validateRequest from "../../middlewares/validateRequest";
import { PERMISSION } from "../admin/admin.constant";
import { CHAT_LIMITS } from "../conversation/conversation.constant";
import { SupportService } from "./support.service";
import { TICKET_RESOLUTIONS, TICKET_STATUSES } from "./ticket.model";

const ok = (res: Response, data?: unknown, message?: string) => sendResponse(res, { statusCode: StatusCodes.OK, message, data });

/* ------------------------------------------------------------------ `/support` — brands & creators */

export const SupportRoutes = express.Router();
SupportRoutes.use(userAuth("brand", "creator"));

const userViewer = (req: Request) => ({ id: req.user!.id, role: req.user!.role });

SupportRoutes.get(
  "/tickets",
  validateRequest(z.object({ query: z.object({ status: z.enum(["open", "resolved"]).optional(), ...zPagination }) })),
  catchAsync(async (req: Request, res: Response) => {
    const { items, meta } = await SupportService.listForUser(userViewer(req), req.query as any);
    sendResponse(res, { statusCode: StatusCodes.OK, data: items, meta });
  }),
);

/** Brand / creator of the order: "Mark resolved" → the order continues. */
SupportRoutes.post(
  "/tickets/:id/resolve",
  accountWriteLimiter,
  validateRequest(zIdParam),
  catchAsync(async (req: Request, res: Response) => {
    ok(res, await SupportService.resolveByParty(userViewer(req), req.params.id), "Issue marked as resolved");
  }),
);

/* ------------------------------------------------------------------ `/admin/support` — dashboard support desk */

export const AdminSupportRoutes = express.Router();
AdminSupportRoutes.use(adminAuth(PERMISSION.ticketsManage));

const admin = (req: Request) => ({ id: req.admin!.id, name: req.admin!.name });

AdminSupportRoutes.get(
  "/tickets",
  validateRequest(
    z.object({ query: z.object({ status: z.enum(TICKET_STATUSES).optional(), q: z.string().trim().min(2).max(40).optional(), ...zPagination }) }),
  ),
  catchAsync(async (req: Request, res: Response) => {
    const { items, meta, stats } = await SupportService.adminList(req.query as any);
    sendResponse(res, { statusCode: StatusCodes.OK, data: { items, stats }, meta });
  }),
);

AdminSupportRoutes.get(
  "/tickets/:id",
  validateRequest(zIdParam),
  catchAsync(async (req: Request, res: Response) => ok(res, await SupportService.adminGet(req.params.id))),
);

/**
 * resume → order continues (tickets.manage).
 * release / refund move money → also need `disputes.arbitrate` (admin / super admin).
 */
AdminSupportRoutes.post(
  "/tickets/:id/resolve",
  validateRequest(
    z.object({
      params: z.object({ id: zObjectId }),
      body: z.object({ action: z.enum(TICKET_RESOLUTIONS), note: z.string().trim().max(2000).optional() }),
    }),
  ),
  (req, res, next) => (req.body.action === "resume" ? next() : adminAuth(PERMISSION.ticketsManage, PERMISSION.disputesArbitrate)(req, res, next)),
  catchAsync(async (req: Request, res: Response) => {
    ok(res, await SupportService.adminResolve(admin(req), req.params.id, req.body), "Ticket resolved");
  }),
);

AdminSupportRoutes.get(
  "/conversations",
  validateRequest(
    z.object({
      query: z.object({
        cursor: z.string().max(80).optional(),
        unread: zQueryBool.optional(),
        limit: z.coerce.number().int().min(1).max(50).default(CHAT_LIMITS.conversationsPageSize),
      }),
    }),
  ),
  catchAsync(async (req: Request, res: Response) => {
    const { items, meta } = await SupportService.adminConversations(req.query as any);
    sendResponse(res, { statusCode: StatusCodes.OK, data: items, meta });
  }),
);

AdminSupportRoutes.get(
  "/conversations/unread-count",
  catchAsync(async (_req: Request, res: Response) => ok(res, { total: await SupportService.adminUnreadCount() })),
);

AdminSupportRoutes.get(
  "/conversations/:id/messages",
  validateRequest(
    z.object({
      params: z.object({ id: zObjectId }),
      query: z.object({ before: zObjectId.optional(), limit: z.coerce.number().int().min(1).max(100).default(CHAT_LIMITS.messagesPageSize) }),
    }),
  ),
  catchAsync(async (req: Request, res: Response) => {
    const { items, meta, conversation, openTickets } = await SupportService.adminMessages(req.params.id, req.query as any);
    sendResponse(res, { statusCode: StatusCodes.OK, data: { conversation, openTickets, items }, meta });
  }),
);

AdminSupportRoutes.post(
  "/conversations/:id/messages",
  accountWriteLimiter,
  validateRequest(
    z.object({
      params: z.object({ id: zObjectId }),
      body: z.object({
        text: z.string().trim().max(CHAT_LIMITS.maxTextLength).optional(),
        attachmentIds: z.array(zObjectId).max(CHAT_LIMITS.maxAttachments).optional(),
        clientMsgId: z.string().trim().min(8).max(64).optional(),
      }),
    }),
  ),
  catchAsync(async (req: Request, res: Response) => {
    sendResponse(res, { statusCode: StatusCodes.CREATED, data: await SupportService.adminSend(admin(req), req.params.id, req.body) });
  }),
);

AdminSupportRoutes.post(
  "/conversations/:id/read",
  validateRequest(zIdParam),
  catchAsync(async (req: Request, res: Response) => ok(res, await SupportService.adminMarkRead(req.params.id))),
);
