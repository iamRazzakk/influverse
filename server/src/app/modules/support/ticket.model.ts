import { InferSchemaType, model, Schema } from "mongoose";

/**
 * Support ticket (D24: replaces disputes). Today tickets are opened by "Report an issue" on an order;
 * `type: general` is reserved for tickets an admin opens from a support chat.
 *
 * The conversation itself happens in each user's "Influverse Support" chat thread — the ticket is the
 * case record: what was reported, the order it holds, and how it was resolved.
 */
export const TICKET_TYPES = ["order_issue", "general"] as const;
export const TICKET_STATUSES = ["open", "in_progress", "resolved"] as const;
export type TicketStatus = (typeof TICKET_STATUSES)[number];

/**
 * resume  — order continues where it stopped (no money moves)
 * release — escrow released to the creator (order approved)
 * refund  — brand refunded in full (order cancelled)
 */
export const TICKET_RESOLUTIONS = ["resume", "release", "refund"] as const;
export type TicketResolution = (typeof TICKET_RESOLUTIONS)[number];

const ticketSchema = new Schema(
  {
    code: { type: String, required: true, unique: true },
    type: { type: String, enum: TICKET_TYPES, default: "order_issue" },
    orderId: { type: Schema.Types.ObjectId, ref: "Order" },
    orderCode: String,
    brandId: { type: Schema.Types.ObjectId, ref: "User" },
    creatorId: { type: Schema.Types.ObjectId, ref: "User" },
    reporterId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    reporterRole: { type: String, enum: ["brand", "creator"], required: true },
    category: { type: String, required: true, maxlength: 120 },
    reason: { type: String, required: true, maxlength: 4000 },

    status: { type: String, enum: TICKET_STATUSES, default: "open" },
    /** true while open / in progress — the partial unique index allows one active ticket per order. */
    active: { type: Boolean, default: true },
    /** Admin who picked the ticket up (status → in_progress). */
    assigneeId: { type: Schema.Types.ObjectId, ref: "Admin" },
    resolution: {
      type: new Schema(
        {
          action: { type: String, enum: TICKET_RESOLUTIONS },
          note: String,
          by: { type: String, enum: ["brand", "creator", "admin"] },
          byId: Schema.Types.ObjectId,
          at: Date,
        },
        { _id: false },
      ),
      default: undefined,
    },
  },
  { timestamps: true, versionKey: false },
);

ticketSchema.index({ orderId: 1 }, { unique: true, partialFilterExpression: { active: true }, name: "one_active_ticket_per_order" });
// Admin queue (status tabs, newest first) and each user's own tickets.
ticketSchema.index({ status: 1, createdAt: -1 });
ticketSchema.index({ brandId: 1, createdAt: -1 });
ticketSchema.index({ creatorId: 1, createdAt: -1 });

export type ITicket = InferSchemaType<typeof ticketSchema>;
export const SupportTicket = model("SupportTicket", ticketSchema, "support_tickets");
