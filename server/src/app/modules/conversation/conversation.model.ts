import { InferSchemaType, model, Schema } from "mongoose";
import { MESSAGE_KINDS } from "./conversation.constant";

/**
 * One conversation per brand ↔ creator pair (docs/messaging-and-offer-plan.md §3).
 * Both "Message" and "Send Offer" reuse it, so the whole history lives in one thread.
 *
 * The inbox preview (`lastMessage`) and the per-side unread counters are denormalised here,
 * so listing an inbox is one indexed query — no aggregation over `messages`.
 */
const lastMessageSchema = new Schema(
  {
    text: { type: String, maxlength: 200 },
    kind: { type: String, enum: MESSAGE_KINDS },
    senderId: { type: Schema.Types.ObjectId, ref: "User" },
    at: Date,
  },
  { _id: false },
);

/**
 * `direct`  — brand ↔ creator (both ids set).
 * `support` — one user ↔ Influverse Support (admins). Exactly one of brandId / creatorId is set, the
 *             other is null, so the unique (brandId, creatorId) index also means "one support thread per user".
 *             The admin side has its own unread counter / read time (`supportUnread`, `supportLastReadAt`).
 */
export const CONVERSATION_KINDS = ["direct", "support"] as const;
export type ConversationKind = (typeof CONVERSATION_KINDS)[number];

const isDirect = function (this: { kind?: string }) {
  return this.kind !== "support";
};

const conversationSchema = new Schema(
  {
    kind: { type: String, enum: CONVERSATION_KINDS, default: "direct" },
    brandId: { type: Schema.Types.ObjectId, ref: "User", required: isDirect, default: null },
    creatorId: { type: Schema.Types.ObjectId, ref: "User", required: isDirect, default: null },
    /** Support threads only: admin-side unread count and when an admin last read the thread. */
    supportUnread: { type: Number, default: undefined, min: 0 },
    supportLastReadAt: { type: Date, default: undefined },

    lastMessage: { type: lastMessageSchema, default: undefined },
    /** null until the first message — empty conversations are hidden from both inboxes. */
    lastMessageAt: { type: Date, default: null },

    // Unread counters: `$inc` on send, `$set: 0` on read — atomic, no counting queries.
    brandUnread: { type: Number, default: 0, min: 0 },
    creatorUnread: { type: Number, default: 0, min: 0 },

    // When each side last opened the thread — lets the other side show "Seen".
    brandLastReadAt: { type: Date, default: null },
    creatorLastReadAt: { type: Date, default: null },

    // "Delete thread" is per side: that side stops seeing messages older than `clearedAt`, and the
    // thread leaves their inbox until a new message arrives (`hidden` is reset on every new message).
    brandClearedAt: { type: Date, default: null },
    creatorClearedAt: { type: Date, default: null },
    brandHidden: { type: Boolean, default: false },
    creatorHidden: { type: Boolean, default: false },
  },
  { timestamps: true, versionKey: false },
);

// One thread per pair, even if two "Message" clicks race each other.
conversationSchema.index({ brandId: 1, creatorId: 1 }, { unique: true });
// Inbox lists, newest activity first, with `_id` as a tie-breaker for the cursor.
conversationSchema.index({ brandId: 1, lastMessageAt: -1, _id: -1 });
conversationSchema.index({ creatorId: 1, lastMessageAt: -1, _id: -1 });
// Admin support inbox: support threads only, newest activity first.
conversationSchema.index({ lastMessageAt: -1, _id: -1 }, { partialFilterExpression: { kind: "support" }, name: "support_inbox" });

export type IConversation = InferSchemaType<typeof conversationSchema>;
export const Conversation = model("Conversation", conversationSchema, "conversations");
