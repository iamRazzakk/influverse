import { z } from "zod";
import { zName, zPhone, zUrl } from "../../../shared/zod";
import { LANGUAGES } from "./user.constant";

const updateMe = z.object({
  body: z
    .object({
      name: zName.optional(),
      phone: zPhone.nullable().optional(),
      avatar: zUrl.nullable().optional(),
      preferredLanguage: z.enum(LANGUAGES).optional(),
    })
    .strict(),
});

const notificationPrefs = z.object({
  body: z
    .object({
      offers: z.boolean().optional(),
      messages: z.boolean().optional(),
      deliverables: z.boolean().optional(),
      payouts: z.boolean().optional(),
      marketing: z.boolean().optional(),
    })
    .strict(),
});

const deactivate = z.object({
  body: z.object({ password: z.string().min(1), reason: z.string().trim().max(500).optional() }),
});

export const MeValidation = { updateMe, notificationPrefs, deactivate };
