import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getEnv } from '../../../shared/config.js';
import { logger } from '../../../shared/utils/index.js';

let _s3: S3Client | null = null;

function getS3(): S3Client {
  if (_s3) return _s3;
  _s3 = new S3Client({ region: getEnv().AWS_REGION });
  return _s3;
}

/**
 * Save a raw JSON snapshot to S3 for audit/debugging.
 * Key format: snapshots/<source>/<YYYY-MM-DD>/<timestamp>.json
 */
export async function saveSnapshot(source: string, data: unknown): Promise<void> {
  const bucket = getEnv().S3_BUCKET_SNAPSHOTS;
  if (!bucket) return;

  const now = new Date();
  const dateDir = now.toISOString().split('T')[0];
  const key = `snapshots/${source}/${dateDir}/${now.toISOString()}.json`;

  try {
    await getS3().send(new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: JSON.stringify(data),
      ContentType: 'application/json',
    }));
    logger.debug({ key }, 'Snapshot saved to S3');
  } catch (err) {
    logger.warn({ err, key }, 'S3 snapshot write failed (non-critical)');
  }
}
