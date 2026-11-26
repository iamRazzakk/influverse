import { z } from "zod";
import { zEmail, zName, zObjectId, zPagination, zPassword, zUrl } from "../../../shared/zod";
import { AUDIT_ACTIONS } from "../audit/audit.model";
import { ADMIN_ROLES } from "./admin.constant";

const zAdminRole = z.enum(ADMIN_ROLES as [string, ...string[]]);
const zLinkToken = z.string().trim().min(20).max(200);

export const AdminValidation = {
  login: z.object({
    body: z.object({
      email: zEmail,
      password: z.string().min(1).max(128),
      rememberMe: z.boolean().default(true),
    }),
  }),
  forgotPassword: z.object({ body: z.object({ email: zEmail }) }),
  resetPassword: z.object({ body: z.object({ token: zLinkToken, password: zPassword }) }),
  acceptInvite: z.object({ body: z.object({ token: zLinkToken, name: zName, password: zPassword }) }),
  updateMe: z.object({
    body: z.object({ name: zName.optional(), avatar: zUrl.nullable().optional() }).strict(),
  }),
  changePassword: z.object({
    body: z
      .object({ currentPassword: z.string().min(1), newPassword: zPassword })
      .refine((v) => v.currentPassword !== v.newPassword, { message: "New password must be different", path: ["newPassword"] }),
  }),

  teamList: z.object({
    query: z.object({
      role: zAdminRole.optional(),
      status: z.enum(["invited", "active", "suspended"]).optional(),
      q: z.string().trim().max(100).optional(),
    }),
  }),
  teamInvite: z.object({ body: z.object({ name: zName, email: zEmail, role: zAdminRole }).strict() }),
  teamUpdate: z.object({
    params: z.object({ id: zObjectId }),
    body: z
      .object({ name: zName.optional(), email: zEmail.optional(), role: zAdminRole.optional() })
      .strict()
      .refine((v) => Object.keys(v).length > 0, "Nothing to update"),
  }),

  auditList: z.object({
    query: z.object({
      adminId: zObjectId.optional(),
      action: z.enum(AUDIT_ACTIONS).optional(),
      targetType: z.string().trim().max(40).optional(),
      targetId: zObjectId.optional(),
      ...zPagination,
    }),
  }),
};
