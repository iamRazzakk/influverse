import { cache, TTL } from "../../../shared/cache";
import { PlatformSettings } from "./settings.model";

export type PlatformConfig = {
  platformFeePercent: number;
  creatorFeePercent: number;
  autoReleaseDays: number;
  autoCompleteDays: number;
  offerExpiryDays: number;
  revisionExtendDays: number;
  minTopUpCents: number;
  maxPackagesPerCreator: number;
  deactivationGraceDays: number;
};

const DEFAULTS: PlatformConfig = {
  platformFeePercent: 15,
  creatorFeePercent: 0,
  autoReleaseDays: 5,
  autoCompleteDays: 3,
  offerExpiryDays: 7,
  revisionExtendDays: 2,
  minTopUpCents: 10_000,
  maxPackagesPerCreator: 3,
  deactivationGraceDays: 15,
};

/** All money / order logic reads settings from here — Redis 10 min cache, defaults if missing in DB */
const getPlatform = (): Promise<PlatformConfig> =>
  cache.wrap(
    "settings:platform",
    TTL.settings,
    async () => {
      const doc = await PlatformSettings.findOne({ key: "platform" }).lean();
      const out = { ...DEFAULTS };
      if (doc) for (const k of Object.keys(DEFAULTS) as (keyof PlatformConfig)[]) out[k] = doc[k] ?? DEFAULTS[k];
      return out;
    },
    ["settings"],
  );

/** GET /settings/public — website pricing calc + offer modal */
const getPublic = async () => {
  const s = await getPlatform();
  return {
    platformFeePercent: s.platformFeePercent,
    autoReleaseDays: s.autoReleaseDays,
    minTopUpCents: s.minTopUpCents,
    maxPackagesPerCreator: s.maxPackagesPerCreator,
    currency: "EUR",
  };
};

export const SettingsService = { getPlatform, getPublic, DEFAULTS };
