import type { Request } from "express";
import { errorLogger } from "../../../shared/logger";
import { withIds } from "../../../utils/dto";
import { AuditAction, AuditLog } from "./audit.model";

type AuditEntry = {
  action: AuditAction;
  targetType: string;
  targetId?: unknown;
  targetCode?: string;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
  reason?: string;
};

/**
 * Records an admin action. Takes the Express request so the admin identity, IP and
 * user agent are captured consistently. Never throws — an audit failure must not undo
 * the action the admin already performed, but it is logged loudly.
 */
const record = async (req: Request, entry: AuditEntry) => {
  const admin = req.admin;
  if (!admin) {
    errorLogger.error(`Audit "${entry.action}" called without an authenticated admin`);
    return;
  }
  try {
    await AuditLog.create({
      adminId: admin.id,
      adminSnapshot: { name: admin.name, email: admin.email, role: admin.role },
      ...entry,
      ip: req.ip,
      userAgent: req.get("user-agent")?.slice(0, 300),
    });
  } catch (error: any) {
    errorLogger.error(`Audit log write failed (${entry.action} ${entry.targetType}): ${error.message}`);
  }
};

/** Returns only the keys whose values differ — keeps audit rows small and readable. */
export const diffFields = (before: Record<string, any>, after: Record<string, any>) => {
  const changedBefore: Record<string, unknown> = {};
  const changedAfter: Record<string, unknown> = {};
  for (const key of Object.keys(after)) {
    if (JSON.stringify(before?.[key]) !== JSON.stringify(after[key])) {
      changedBefore[key] = before?.[key];
      changedAfter[key] = after[key];
    }
  }
  return { before: changedBefore, after: changedAfter };
};

/** GET /admin/audit-logs */
const list = async (query: {
  adminId?: string;
  action?: string;
  targetType?: string;
  targetId?: string;
  page: number;
  limit: number;
}) => {
  const filter: Record<string, unknown> = {};
  if (query.adminId) filter.adminId = query.adminId;
  if (query.action) filter.action = query.action;
  if (query.targetType) filter.targetType = query.targetType;
  if (query.targetId) filter.targetId = query.targetId;

  const [items, total] = await Promise.all([
    AuditLog.find(filter)
      .sort({ createdAt: -1 })
      .skip((query.page - 1) * query.limit)
      .limit(query.limit)
      .lean(),
    AuditLog.countDocuments(filter),
  ]);
  return {
    items: withIds(items),
    meta: { page: query.page, limit: query.limit, total, totalPages: Math.ceil(total / query.limit) },
  };
};

export const AuditService = { record, list };
