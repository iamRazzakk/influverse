import { Job } from "bullmq";
import { UploadService } from "../app/modules/upload/upload.service";

/** Queue `cleanup` → `delete-file`: removes an S3 object that is no longer referenced. */
export const deleteFileProcessor = async (job: Job<{ fileId: string }>) => {
  await UploadService.hardDelete(job.data.fileId);
};
