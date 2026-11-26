import { S3Client } from "@aws-sdk/client-s3";
import config from ".";

let client: S3Client | null = null;

export const isS3Configured = () =>
  !!(config.s3.accessKeyId && config.s3.secretAccessKey && config.s3.bucketPublic && config.s3.bucketPrivate);

/** AWS S3 or Cloudflare R2 / MinIO (path-style when S3_ENDPOINT is set) */
export const getS3 = (): S3Client => {
  if (!isS3Configured()) throw new Error("Storage is not configured (S3_* env)");
  if (!client) {
    client = new S3Client({
      region: config.s3.region,
      endpoint: config.s3.endpoint || undefined,
      forcePathStyle: !!config.s3.endpoint,
      credentials: { accessKeyId: config.s3.accessKeyId!, secretAccessKey: config.s3.secretAccessKey! },
    });
  }
  return client;
};
