import express from "express";
import { AdminAuditRoutes, AdminAuthRoutes, AdminTeamRoutes } from "../modules/admin/admin.routes";
import { AdminCmsRoutes } from "../modules/cms/cms.routes";
import { AdminCreatorRoutes, AdminUserRoutes } from "../modules/admin/adminUsers.routes";
import { AdminVerificationRoutes } from "../modules/verification/verification.routes";
import { AdminNotificationRoutes } from "../modules/notification/notification.routes";
import { AdminFileRoutes, AdminUploadRoutes } from "../modules/upload/upload.routes";
import { AdminOrderRoutes } from "../modules/order/order.routes";
import { AdminTransactionRoutes } from "../modules/payment/payment.routes";
import { AdminSupportRoutes } from "../modules/support/support.routes";

/**
 * Dashboard API, mounted at `/api/v1/admin`.
 * Every route below is guarded by `adminAuth(permission)` inside its own router.
 */
const adminRouter = express.Router();

const adminRoutes: { path: string; route: express.Router }[] = [
  { path: "/auth", route: AdminAuthRoutes },
  { path: "/team", route: AdminTeamRoutes },
  { path: "/audit-logs", route: AdminAuditRoutes },
  { path: "/cms", route: AdminCmsRoutes },
  { path: "/users", route: AdminUserRoutes },
  { path: "/creators", route: AdminCreatorRoutes },
  { path: "/verifications", route: AdminVerificationRoutes },
  { path: "/notifications", route: AdminNotificationRoutes },
  { path: "/uploads", route: AdminUploadRoutes },
  { path: "/files", route: AdminFileRoutes },
  { path: "/orders", route: AdminOrderRoutes },
  { path: "/transactions", route: AdminTransactionRoutes },
  { path: "/support", route: AdminSupportRoutes },
];

adminRoutes.forEach(({ path, route }) => adminRouter.use(path, route));

export default adminRouter;
