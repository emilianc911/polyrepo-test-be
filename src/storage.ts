import {
  CreateBucketCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { config } from "./config.js";
import { logger } from "./logger.js";

export const s3 = new S3Client({
  endpoint: config.s3.endpoint,
  region: config.s3.region,
  credentials: {
    accessKeyId: config.s3.accessKey,
    secretAccessKey: config.s3.secretKey,
  },
  forcePathStyle: config.s3.forcePathStyle,
});

// Same client but pointed at the public-facing endpoint, used to generate
// presigned URLs that the browser can actually hit. Inside the docker network
// the BE calls `objects:9000`, but the browser must talk to `localhost:9000`.
const s3Public = new S3Client({
  endpoint: config.s3.publicEndpoint,
  region: config.s3.region,
  credentials: {
    accessKeyId: config.s3.accessKey,
    secretAccessKey: config.s3.secretKey,
  },
  forcePathStyle: config.s3.forcePathStyle,
});

export async function ensureBucket(): Promise<void> {
  try {
    await s3.send(new HeadBucketCommand({ Bucket: config.s3.bucket }));
    return;
  } catch {
    // fall through to create
  }
  try {
    await s3.send(new CreateBucketCommand({ Bucket: config.s3.bucket }));
    logger.info({ bucket: config.s3.bucket }, "created bucket");
  } catch (err) {
    logger.error({ err: (err as Error).message }, "failed to create bucket");
    throw err;
  }
}

export async function waitForS3(maxAttempts = 30, delayMs = 1_000): Promise<void> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      await ensureBucket();
      return;
    } catch (err) {
      logger.warn(
        { attempt, max: maxAttempts },
        `s3 not ready: ${(err as Error).message}`,
      );
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
  throw new Error("s3 did not become ready in time");
}

export async function presignUpload(
  key: string,
  contentType: string,
  ttlSeconds = 600,
): Promise<string> {
  const cmd = new PutObjectCommand({
    Bucket: config.s3.bucket,
    Key: key,
    ContentType: contentType,
  });
  return getSignedUrl(s3Public, cmd, { expiresIn: ttlSeconds });
}

export async function presignDownload(
  key: string,
  ttlSeconds = 600,
): Promise<string> {
  const cmd = new GetObjectCommand({
    Bucket: config.s3.bucket,
    Key: key,
  });
  return getSignedUrl(s3Public, cmd, { expiresIn: ttlSeconds });
}

export async function deleteObject(key: string): Promise<void> {
  await s3.send(new DeleteObjectCommand({ Bucket: config.s3.bucket, Key: key }));
}
