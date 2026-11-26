import { StatusCodes } from "http-status-codes";
import config from "../../../config";
import ApiError from "../../../errors/ApiErrors";
import { enqueueEmail } from "../../../shared/email";
import { emailTemplate } from "../../../shared/emailTemplates";
import { errorLogger } from "../../../shared/logger";
import { socketEmit } from "../../../socket/emitter";
import { ADMIN_STATUS, hasPermission, Permission } from "../admin/admin.constant";
import { Admin } from "../admin/admin.model";
import { User } from "../user/user.model";
import { Notification, NotificationType } from "./notification.model";

type Payload = {
  type: NotificationType;
  title: string;
  body?: string;
  link?: string;
  data?: Record<string, unknown>;
};

/** User preference key — if given and the pref is on, an email is sent too */
type EmailPref = "offers" | "messages" | "deliverables" | "payouts";

/**
 * docs/00-final-plan.md §3.7 — `notify()` → DB + socket + (if preferred) email job.
 * A notification failure never fails the main business action (it is logged and swallowed).
 */
const notifyUser = async (userId: string, payload: Payload, opts: { email?: EmailPref } = {}) => {
  try {
    let sendEmail = false;
    let user: { email: string; name: string } | null = null;
    if (opts.email) {
      const u = await User.findById(userId).select("email name notificationPrefs status").lean();
      sendEmail = !!u && u.status === "active" && u.notificationPrefs?.[opts.email] !== false;
      user = u;
    }

    const doc = await Notification.create({
      recipientType: "user",
      recipientId: userId,
      ...payload,
      channels: { inApp: true, email: sendEmail },
    });

    socketEmit.toUser(userId, "notification:new", doc.toJSON());
    socketEmit.toUser(userId, "unread:counts", { notifications: await unreadCount("user", userId) });

    if (sendEmail && user) {
      await enqueueEmail(
        emailTemplate.notification({
          to: user.email,
          name: user.name,
          title: payload.title,
          body: payload.body,
          link: payload.link ? `${config.urls.website}${payload.link}` : undefined,
        }),
        `notif:${doc._id}`,
      );
    }
    return doc;
  } catch (error: any) {
    errorLogger.error(`notifyUser(${userId}, ${payload.type}) failed: ${error.message}`);
    return null;
  }
};

/** All active admins (only those with the permission, if given) — one row per admin */
const notifyAdmins = async (payload: Payload, opts: { permission?: Permission } = {}) => {
  try {
    const admins = await Admin.find({ status: ADMIN_STATUS.active, deletedAt: null }).select("_id role").lean();
    const targets = opts.permission ? admins.filter((a) => hasPermission(a.role, opts.permission!)) : admins;
    if (!targets.length) return;

    const docs = await Notification.insertMany(
      targets.map((a) => ({ recipientType: "admin", recipientId: a._id, ...payload })),
    );
    for (const doc of docs) socketEmit.toAdmin(String(doc.recipientId), "admin:notification", doc.toJSON());
  } catch (error: any) {
    errorLogger.error(`notifyAdmins(${payload.type}) failed: ${error.message}`);
  }
};

const unreadCount = (recipientType: "user" | "admin", recipientId: string) =>
  Notification.countDocuments({ recipientType, recipientId, readAt: null });

const list = async (
  recipientType: "user" | "admin",
  recipientId: string,
  q: { unread?: boolean; page: number; limit: number },
) => {
  const filter: Record<string, unknown> = { recipientType, recipientId };
  if (q.unread) filter.readAt = null;
  const [items, total, unread] = await Promise.all([
    Notification.find(filter)
      .sort({ createdAt: -1 })
      .skip((q.page - 1) * q.limit)
      .limit(q.limit)
      .lean(),
    Notification.countDocuments(filter),
    unreadCount(recipientType, recipientId),
  ]);
  return {
    items: items.map((n) => ({ ...n, id: String(n._id) })),
    meta: { page: q.page, limit: q.limit, total, totalPages: Math.ceil(total / q.limit), unread },
  };
};

const markRead = async (recipientType: "user" | "admin", recipientId: string, id: string) => {
  const res = await Notification.updateOne(
    { _id: id, recipientType, recipientId },
    { $set: { readAt: new Date() } },
  );
  if (!res.matchedCount) throw new ApiError(StatusCodes.NOT_FOUND, "Notification not found");
};

const markAllRead = async (recipientType: "user" | "admin", recipientId: string) => {
  await Notification.updateMany({ recipientType, recipientId, readAt: null }, { $set: { readAt: new Date() } });
};

export const NotificationService = { notifyUser, notifyAdmins, list, unreadCount, markRead, markAllRead };
