import express, { Request, Response } from "express";
import { StatusCodes } from "http-status-codes";
import catchAsync from "../../../shared/catchAsync";
import sendResponse from "../../../shared/sendResponse";
import { SettingsService } from "../settings/settings.service";
import { BRAND_INDUSTRIES, CAMPAIGN_GOALS, COMPANY_SIZES, CREATOR_TIERS, MONTHLY_BUDGETS, TARGET_PLATFORMS } from "../brand/brand.constant";
import { COLLABORATION_PREFERENCES, CREATOR_CATEGORIES, FOLLOWER_RANGES, GENDERS, SOCIAL_PLATFORMS } from "../creator/creator.constant";
import { PACKAGE_PLATFORMS, PACKAGE_TYPES, USAGE_RIGHTS, USAGE_RIGHTS_LABELS } from "../package/package.constant";

/** Public, no auth: settings + frontend enum sync */
const router = express.Router();

router.get(
  "/settings/public",
  catchAsync(async (_req: Request, res: Response) => {
    res.setHeader("Cache-Control", "public, max-age=300");
    sendResponse(res, { statusCode: StatusCodes.OK, data: await SettingsService.getPublic() });
  }),
);

/** GET /meta/options — replaces hardcoded frontend constants (single source of truth) */
router.get("/meta/options", (_req: Request, res: Response) => {
  res.setHeader("Cache-Control", "public, max-age=3600");
  sendResponse(res, {
    statusCode: StatusCodes.OK,
    data: {
      creatorCategories: CREATOR_CATEGORIES,
      collaborationPreferences: COLLABORATION_PREFERENCES,
      genders: GENDERS,
      socialPlatforms: SOCIAL_PLATFORMS,
      followerRanges: Object.keys(FOLLOWER_RANGES),
      brandIndustries: BRAND_INDUSTRIES,
      companySizes: COMPANY_SIZES,
      targetPlatforms: TARGET_PLATFORMS,
      campaignGoals: CAMPAIGN_GOALS,
      monthlyBudgets: MONTHLY_BUDGETS,
      creatorTiers: CREATOR_TIERS,
      packagePlatforms: PACKAGE_PLATFORMS,
      packageTypes: PACKAGE_TYPES,
      usageRights: USAGE_RIGHTS,
      usageRightsLabels: USAGE_RIGHTS_LABELS,
    },
  });
});

export const PublicRoutes = router;
