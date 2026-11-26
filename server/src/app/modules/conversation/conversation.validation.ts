import { z } from "zod";
import { zObjectId } from "../../../shared/zod";
import { CHAT_LIMITS } from "./conversation.constant";

const open = z.object({ body: z.object({ creatorId: zObjectId }) });

const list = z.object({
  query: z.object({
    cursor: z.string().max(64).optional(),
    limit: z.coerce.number().int().min(1).max(50).default(CHAT_LIMITS.conversationsPageSize),
  }),
});

const idParam = z.object({ params: z.object({ id: zObjectId }) });

const listMessages = idParam.extend({
  query: z.object({
    before: zObjectId.optional(),
    limit: z.coerce.number().int().min(1).max(100).default(CHAT_LIMITS.messagesPageSize),
  }),
});

const send = idParam.extend({
  body: z
    .object({
      text: z
        .string()
        .trim()
        .max(CHAT_LIMITS.maxTextLength, `Message is too long (max ${CHAT_LIMITS.maxTextLength} characters)`)
        .default(""),
      /** Ids of the sender's own uploaded files (context `chat_attachment`). */
      attachmentIds: z.array(zObjectId).max(CHAT_LIMITS.maxAttachments, `Up to ${CHAT_LIMITS.maxAttachments} files per message`).default([]),
      clientMsgId: z
        .string()
        .trim()
        .regex(/^[A-Za-z0-9_-]{8,64}$/, "Invalid clientMsgId")
        .optional(),
    })
    .refine((body) => body.text.length > 0 || body.attachmentIds.length > 0, {
      message: "Message can't be empty",
      path: ["text"],
    }),
});

const messageParam = z.object({ params: z.object({ id: zObjectId, messageId: zObjectId }) });

export const ConversationValidation = { open, list, idParam, listMessages, send, messageParam };
