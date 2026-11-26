import express from "express";
import { AuthRoutes } from "../modules/auth/auth.routes";
import { MeRoutes } from "../modules/user/me.routes";
import { CreatorRoutes } from "../modules/creator/creator.routes";
import { BrandRoutes } from "../modules/brand/brand.routes";
import { ConversationRoutes } from "../modules/conversation/conversation.routes";
import { NotificationRoutes } from "../modules/notification/notification.routes";
import { OfferRoutes } from "../modules/offer/offer.routes";
import { OrderRoutes } from "../modules/order/order.routes";
import { PaymentRoutes } from "../modules/payment/payment.routes";
import { PayoutRoutes } from "../modules/payout/payout.routes";
import { SupportRoutes } from "../modules/support/support.routes";
import { PublicRoutes } from "../modules/public/public.routes";
import { FileRoutes, UploadRoutes } from "../modules/upload/upload.routes";
import { CmsPublicRoutes } from "../modules/cms/cms.routes";
import { PackageRoutes } from "../modules/package/package.routes";
import { GalleryRoutes, PortfolioRoutes } from "../modules/portfolio/portfolio.routes";
import { SavedCreatorRoutes } from "../modules/saved/saved.routes";
import { CreatorVerificationRoutes } from "../modules/verification/verification.routes";
import adminRouter from "./admin";

/**
 * Website API, mounted at `/api/v1`. The dashboard API lives under `/api/v1/admin` (see ./admin.ts).
 * Order matters only for `/` (public routes) which must come last.
 */
const router = express.Router();

const apiRoutes: { path: string; route: express.Router }[] = [
  { path: "/admin", route: adminRouter },
  { path: "/auth", route: AuthRoutes },
  { path: "/me/packages", route: PackageRoutes },
  { path: "/me/portfolio", route: PortfolioRoutes },
  { path: "/me/gallery", route: GalleryRoutes },
  { path: "/me/saved-creators", route: SavedCreatorRoutes },
  { path: "/me/verification-requests", route: CreatorVerificationRoutes },
  { path: "/me", route: MeRoutes },
  { path: "/creators", route: CreatorRoutes },
  { path: "/brands", route: BrandRoutes },
  { path: "/conversations", route: ConversationRoutes },
  { path: "/offers", route: OfferRoutes },
  { path: "/orders", route: OrderRoutes },
  { path: "/payments", route: PaymentRoutes },
  { path: "/payouts", route: PayoutRoutes },
  { path: "/support", route: SupportRoutes },
  { path: "/notifications", route: NotificationRoutes },
  { path: "/uploads", route: UploadRoutes },
  { path: "/files", route: FileRoutes },
  { path: "/cms", route: CmsPublicRoutes },
  { path: "/", route: PublicRoutes },
];

apiRoutes.forEach(({ path, route }) => router.use(path, route));

export default router;
