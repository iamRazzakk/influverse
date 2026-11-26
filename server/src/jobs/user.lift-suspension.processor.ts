import { Job } from "bullmq";
import { AdminUsersService } from "../app/modules/admin/adminUsers.service";
import { logger } from "../shared/logger";

/** Queue `user` → `lift-suspension`: ends a temporary suspension on its `until` date. Idempotent. */
export const liftSuspensionProcessor = async (job: Job<{ userId: string }>) => {
  const lifted = await AdminUsersService.liftSuspension(job.data.userId);
  if (lifted) logger.info(`Temporary suspension lifted for user ${job.data.userId}`);
};
