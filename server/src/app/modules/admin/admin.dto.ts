/**
 * Admin fields safe to return to the dashboard (matches dashboard `AdminUser` type).
 * Used as a projection so secrets never leave the database.
 */
export const ADMIN_PUBLIC_PROJECTION = "code email name avatar role status twoFactorEnabled lastLoginAt invitedBy createdAt";

export const toAdminDto = (admin: Record<string, any>) => ({
  id: String(admin._id),
  code: admin.code,
  name: admin.name,
  email: admin.email,
  avatar: admin.avatar ?? null,
  role: admin.role,
  status: admin.status,
  twoFactorEnabled: Boolean(admin.twoFactorEnabled),
  lastLogin: admin.lastLoginAt ?? null,
  createdAt: admin.createdAt,
});
