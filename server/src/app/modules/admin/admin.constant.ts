export const ADMIN_ROLE = {
  superAdmin: "super_admin",
  admin: "admin",
  moderator: "moderator",
} as const;
export type AdminRole = (typeof ADMIN_ROLE)[keyof typeof ADMIN_ROLE];
export const ADMIN_ROLES = Object.values(ADMIN_ROLE);

export const ADMIN_STATUS = { invited: "invited", active: "active", suspended: "suspended" } as const;
export type AdminStatus = (typeof ADMIN_STATUS)[keyof typeof ADMIN_STATUS];

/** docs/00-final-plan.md §3.6 */
export const PERMISSION = {
  dashboardView: "dashboard.view",
  usersView: "users.view",
  usersSuspend: "users.suspend",
  verificationManage: "verification.manage",
  ticketsManage: "tickets.manage",
  ordersView: "orders.view",
  ordersNudge: "orders.nudge",
  ordersForceRelease: "orders.force_release",
  ordersExtend: "orders.extend",
  ordersEscalate: "orders.escalate",
  disputesArbitrate: "disputes.arbitrate",
  transactionsView: "transactions.view",
  transactionsExport: "transactions.export",
  transactionsRetryPayout: "transactions.retry_payout",
  cmsManage: "cms.manage",
  creatorsApprove: "creators.approve",
  settingsManage: "settings.manage",
  teamManage: "team.manage",
} as const;
export type Permission = (typeof PERMISSION)[keyof typeof PERMISSION];

const MODERATOR: Permission[] = [
  PERMISSION.dashboardView,
  PERMISSION.usersView,
  PERMISSION.usersSuspend,
  PERMISSION.verificationManage,
  PERMISSION.ticketsManage,
  PERMISSION.ordersView,
  PERMISSION.ordersNudge,
];

const ADMIN: Permission[] = [
  ...MODERATOR,
  PERMISSION.ordersForceRelease,
  PERMISSION.ordersExtend,
  PERMISSION.ordersEscalate,
  PERMISSION.disputesArbitrate,
  PERMISSION.transactionsView,
  PERMISSION.transactionsRetryPayout,
  PERMISSION.transactionsExport,
  PERMISSION.cmsManage,
  PERMISSION.creatorsApprove,
];

/** Permissions are not stored in the token — derived server-side from the role (so role changes apply immediately) */
export const ROLE_PERMISSIONS: Record<AdminRole, ReadonlySet<Permission>> = {
  moderator: new Set(MODERATOR),
  admin: new Set(ADMIN),
  super_admin: new Set(Object.values(PERMISSION)),
};

export const hasPermission = (role: AdminRole, permission: Permission) =>
  ROLE_PERMISSIONS[role]?.has(permission) ?? false;
