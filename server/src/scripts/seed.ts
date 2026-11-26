/**
 * Idempotent database seed — safe to run on every deploy.
 *
 *   npm run seed            (dev, TypeScript)
 *   npm run seed:prod       (after `npm run build`)
 *
 * Everything uses upsert + `$setOnInsert`, so existing data (including admin edits) is never overwritten.
 * It also builds all Mongo indexes (autoIndex is off in production).
 */
import mongoose from "mongoose";
import config from "../config";
import { connectDB, disconnectDB } from "../config/database";
import { ADMIN_ROLE, ADMIN_STATUS } from "../app/modules/admin/admin.constant";
import { Admin } from "../app/modules/admin/admin.model";
import { CmsPage, Faq, SiteSettings } from "../app/modules/cms/cms.model";
import { PlatformSettings } from "../app/modules/settings/settings.model";
import { SettingsService } from "../app/modules/settings/settings.service";
import { CODE_PREFIX, nextCode } from "../shared/codeGenerator";
import { logger } from "../shared/logger";
import { hashPassword } from "../utils/password";
import { SEED_CMS_PAGES, SEED_FAQS, SEED_SITE_SETTINGS } from "./seed-data";

// Register every model so `syncIndexes` covers all collections.
import "../app/modules/auth/session.model";
import "../app/modules/auth/authToken.model";
import "../app/modules/audit/audit.model";
import "../app/modules/brand/brand.model";
import "../app/modules/creator/creator.model";
import "../app/modules/notification/notification.model";
import "../app/modules/package/package.model";
import "../app/modules/portfolio/portfolio.model";
import "../app/modules/system/counter.model";
import "../app/modules/upload/file.model";
import "../app/modules/user/user.model";
import "../app/modules/saved/saved.model";
import "../app/modules/verification/verification.model";
import "../app/modules/system/outbox.model";

const seedSuperAdmin = async () => {
  const { email, password } = config.superAdmin;
  if (!email || !password) {
    logger.warn("SUPER_ADMIN_EMAIL / SUPER_ADMIN_PASSWORD not set — skipping super admin");
    return;
  }
  if (await Admin.exists({ email })) {
    logger.info(`Super admin ${email} already exists`);
    return;
  }
  await Admin.create({
    code: await nextCode(CODE_PREFIX.admin),
    email,
    name: "Super Admin",
    passwordHash: await hashPassword(password),
    role: ADMIN_ROLE.superAdmin,
    status: ADMIN_STATUS.active,
  });
  logger.info(`Super admin ${email} created — change the password after first login`);
};

const seedPlatformSettings = () =>
  PlatformSettings.updateOne(
    { key: "platform" },
    { $setOnInsert: { key: "platform", ...SettingsService.DEFAULTS } },
    { upsert: true },
  );

const seedCms = async () => {
  for (const page of SEED_CMS_PAGES) {
    await CmsPage.updateOne({ slug: page.slug }, { $setOnInsert: { ...page, isPublished: true } }, { upsert: true });
  }

  // FAQs are only seeded into an empty collection (admins may have reordered / deleted them).
  if ((await Faq.estimatedDocumentCount()) === 0) {
    const orderByCategory: Record<string, number> = {};
    for (const faq of SEED_FAQS) {
      orderByCategory[faq.category] = (orderByCategory[faq.category] ?? 0) + 1;
      await Faq.create({
        ...faq,
        code: await nextCode(CODE_PREFIX.faq),
        order: orderByCategory[faq.category],
        isPublished: true,
      });
    }
  }

  await SiteSettings.updateOne(
    { key: "site" },
    { $setOnInsert: { key: "site", ...SEED_SITE_SETTINGS } },
    { upsert: true },
  );
};

async function main() {
  await connectDB();
  logger.info("Building indexes...");
  for (const model of Object.values(mongoose.models)) await model.syncIndexes();

  await seedSuperAdmin();
  await seedPlatformSettings();
  await seedCms();
  logger.info("Seed complete");
}

main()
  .catch((error) => {
    logger.error(`Seed failed: ${error.message}`);
    process.exitCode = 1;
  })
  .finally(() => disconnectDB());
