import express, { Request, Response } from "express";
import { StatusCodes } from "http-status-codes";
import catchAsync from "../../../shared/catchAsync";
import { accountWriteLimiter, messageLimiter } from "../../../shared/rateLimiter";
import sendResponse from "../../../shared/sendResponse";
import { userAuth } from "../../middlewares/auth";
import validateRequest from "../../middlewares/validateRequest";
import { ConversationService } from "./conversation.service";
import { ConversationValidation } from "./conversation.validation";

/**
 * `/conversations` — brand ↔ creator chat (docs/messaging-and-offer-plan.md §4.3).
 * Every handler scopes queries to the logged-in user's side, so nobody can read another pair's thread.
 */
export const ConversationRoutes = express.Router();
ConversationRoutes.use(userAuth("brand", "creator"));

const viewer = (req: Request) => ({ id: req.user!.id, role: req.user!.role, name: req.user!.name });

/** Only brands start a thread (from a creator's profile). Creators reply inside existing ones. */
ConversationRoutes.post(
  "/",
  userAuth("brand"),
  accountWriteLimiter,
  validateRequest(ConversationValidation.open),
  catchAsync(async (req: Request, res: Response) => {
    sendResponse(res, { statusCode: StatusCodes.OK, data: await ConversationService.openWithCreator(viewer(req), req.body.creatorId) });
  }),
);

ConversationRoutes.get(
  "/",
  validateRequest(ConversationValidation.list),
  catchAsync(async (req: Request, res: Response) => {
    const { items, meta } = await ConversationService.listForUser(viewer(req), req.query as any);
    sendResponse(res, { statusCode: StatusCodes.OK, data: items, meta });
  }),
);

/** The viewer's "Influverse Support" thread (created on first use). Declared before "/:id". */
ConversationRoutes.get(
  "/support",
  catchAsync(async (req: Request, res: Response) => {
    sendResponse(res, { statusCode: StatusCodes.OK, data: await ConversationService.openSupport(viewer(req)) });
  }),
);

// Declared before "/:id" so "unread-count" isn't read as an id.
ConversationRoutes.get(
  "/unread-count",
  catchAsync(async (req: Request, res: Response) => {
    sendResponse(res, { statusCode: StatusCodes.OK, data: { total: await ConversationService.unreadTotal(viewer(req)) } });
  }),
);

ConversationRoutes.get(
  "/:id",
  validateRequest(ConversationValidation.idParam),
  catchAsync(async (req: Request, res: Response) => {
    sendResponse(res, { statusCode: StatusCodes.OK, data: await ConversationService.getForUser(viewer(req), req.params.id) });
  }),
);

ConversationRoutes.get(
  "/:id/messages",
  validateRequest(ConversationValidation.listMessages),
  catchAsync(async (req: Request, res: Response) => {
    const { items, meta } = await ConversationService.listMessages(viewer(req), req.params.id, req.query as any);
    sendResponse(res, { statusCode: StatusCodes.OK, data: items, meta });
  }),
);

ConversationRoutes.post(
  "/:id/messages",
  messageLimiter,
  validateRequest(ConversationValidation.send),
  catchAsync(async (req: Request, res: Response) => {
    sendResponse(res, {
      statusCode: StatusCodes.CREATED,
      data: await ConversationService.sendMessage(viewer(req), req.params.id, req.body),
    });
  }),
);

/** Own message → deleted for everyone; any other message → hidden for me. */
ConversationRoutes.delete(
  "/:id/messages/:messageId",
  accountWriteLimiter,
  validateRequest(ConversationValidation.messageParam),
  catchAsync(async (req: Request, res: Response) => {
    sendResponse(res, {
      statusCode: StatusCodes.OK,
      message: "Message deleted",
      data: await ConversationService.deleteMessage(viewer(req), req.params.id, req.params.messageId),
    });
  }),
);

/** "Delete thread" — clears the history for the caller only; the other side keeps it. */
ConversationRoutes.delete(
  "/:id",
  accountWriteLimiter,
  validateRequest(ConversationValidation.idParam),
  catchAsync(async (req: Request, res: Response) => {
    sendResponse(res, {
      statusCode: StatusCodes.OK,
      message: "Conversation deleted",
      data: await ConversationService.clearConversation(viewer(req), req.params.id),
    });
  }),
);

ConversationRoutes.post(
  "/:id/read",
  validateRequest(ConversationValidation.idParam),
  catchAsync(async (req: Request, res: Response) => {
    sendResponse(res, { statusCode: StatusCodes.OK, data: await ConversationService.markRead(viewer(req), req.params.id) });
  }),
);
