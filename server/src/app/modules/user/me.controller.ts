import { Request, Response } from "express";
import { StatusCodes } from "http-status-codes";
import catchAsync from "../../../shared/catchAsync";
import sendResponse from "../../../shared/sendResponse";
import { BrandService } from "../brand/brand.service";
import { CreatorService } from "../creator/creator.service";
import { MeService } from "./me.service";

const ok = (res: Response, data?: unknown, message?: string) =>
  sendResponse(res, { statusCode: StatusCodes.OK, message, data });

export const MeController = {
  getMe: catchAsync(async (req: Request, res: Response) => ok(res, await MeService.getMe(req.user!.id))),
  updateMe: catchAsync(async (req: Request, res: Response) =>
    ok(res, await MeService.updateMe(req.user!.id, req.body), "Profile updated"),
  ),
  updateNotificationPrefs: catchAsync(async (req: Request, res: Response) =>
    ok(res, await MeService.updateNotificationPrefs(req.user!.id, req.body), "Preferences saved"),
  ),
  deactivate: catchAsync(async (req: Request, res: Response) =>
    ok(res, await MeService.deactivate(req.user!.id, req.body.password, req.body.reason), "Account deactivation scheduled"),
  ),
  cancelDeactivation: catchAsync(async (req: Request, res: Response) =>
    ok(res, await MeService.cancelDeactivation(req.user!.id), "Deactivation cancelled"),
  ),

  // brand
  getBrandProfile: catchAsync(async (req: Request, res: Response) => ok(res, await BrandService.getMine(req.user!.id))),
  updateBrandProfile: catchAsync(async (req: Request, res: Response) =>
    ok(res, await BrandService.updateMine(req.user!.id, req.body), "Brand profile saved"),
  ),
  completeBrandOnboarding: catchAsync(async (req: Request, res: Response) =>
    ok(res, await BrandService.completeOnboarding(req.user!.id), "Onboarding completed"),
  ),

  // creator
  getCreatorProfile: catchAsync(async (req: Request, res: Response) =>
    ok(res, await CreatorService.getMine(req.user!.id)),
  ),
  updateCreatorProfile: catchAsync(async (req: Request, res: Response) =>
    ok(res, await CreatorService.updateMine(req.user!.id, req.body), "Creator profile saved"),
  ),
  upsertPlatform: catchAsync(async (req: Request, res: Response) =>
    ok(res, await CreatorService.upsertPlatform(req.user!.id, req.params.platform as any, req.body), "Channel saved"),
  ),
  removePlatform: catchAsync(async (req: Request, res: Response) =>
    ok(res, await CreatorService.removePlatform(req.user!.id, req.params.platform as any), "Channel removed"),
  ),
  completeCreatorOnboarding: catchAsync(async (req: Request, res: Response) =>
    ok(res, await CreatorService.completeOnboarding(req.user!.id), "Submitted for review"),
  ),
};
