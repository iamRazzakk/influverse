import express from "express";
import { accountWriteLimiter } from "../../../shared/rateLimiter";
import { userAuth } from "../../middlewares/auth";
import validateRequest from "../../middlewares/validateRequest";
import { BrandValidation } from "../brand/brand.validation";
import { CreatorValidation } from "../creator/creator.validation";
import { MeController } from "./me.controller";
import { MeValidation } from "./me.validation";

/** `/me/*` — the logged-in brand / creator's own data (docs/00 §5.2–5.4) */
const router = express.Router();
// Every /me route needs a logged-in user; role-specific routes below add their own role check.
router.use(userAuth(), accountWriteLimiter);

router.get("/", MeController.getMe);
router.patch("/", validateRequest(MeValidation.updateMe), MeController.updateMe);
router.patch(
  "/notification-prefs",
  validateRequest(MeValidation.notificationPrefs),
  MeController.updateNotificationPrefs,
);
router.post("/deactivate", validateRequest(MeValidation.deactivate), MeController.deactivate);
router.post("/deactivate/cancel", MeController.cancelDeactivation);

// Brand
router.get("/brand-profile", userAuth("brand"), MeController.getBrandProfile);
router.patch(
  "/brand-profile",
  userAuth("brand"),
  validateRequest(BrandValidation.updateProfile),
  MeController.updateBrandProfile,
);
router.post("/brand-profile/complete-onboarding", userAuth("brand"), MeController.completeBrandOnboarding);

// Creator
router.get("/creator-profile", userAuth("creator"), MeController.getCreatorProfile);
router.patch(
  "/creator-profile",
  userAuth("creator"),
  validateRequest(CreatorValidation.updateProfile),
  MeController.updateCreatorProfile,
);
router.put(
  "/creator-profile/platforms/:platform",
  userAuth("creator"),
  validateRequest(CreatorValidation.upsertPlatform),
  MeController.upsertPlatform,
);
router.delete(
  "/creator-profile/platforms/:platform",
  userAuth("creator"),
  validateRequest(CreatorValidation.removePlatform),
  MeController.removePlatform,
);
router.post("/creator-profile/complete-onboarding", userAuth("creator"), MeController.completeCreatorOnboarding);

export const MeRoutes = router;
