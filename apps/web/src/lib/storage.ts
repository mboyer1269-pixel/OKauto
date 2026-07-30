import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { randomUUID } from 'crypto';

export interface StorageConfig {
  bucket: string;
  region: string;
  publicUrlBase: string;
}

export function getStorageConfig(): StorageConfig | null {
  const bucket = process.env.AWS_S3_BUCKET;
  const region = process.env.AWS_REGION ?? 'us-east-1';
  const publicUrlBase = process.env.AWS_S3_PUBLIC_URL;

  if (!bucket || !publicUrlBase) return null;
  return { bucket, region, publicUrlBase: publicUrlBase.replace(/\/$/, '') };
}

export function isStorageConfigured(): boolean {
  return getStorageConfig() !== null;
}

let s3Client: S3Client | null = null;

function getS3Client(): S3Client {
  if (!s3Client) {
    const config = getStorageConfig();
    if (!config) throw new Error('S3 storage is not configured');
    s3Client = new S3Client({
      region: config.region,
      credentials:
        process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY
          ? {
              accessKeyId: process.env.AWS_ACCESS_KEY_ID,
              secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
            }
          : undefined,
    });
  }
  return s3Client;
}

export async function createPresignedUpload(params: {
  organizationId: string;
  vehicleId: string;
  filename: string;
  contentType: string;
}): Promise<{ uploadUrl: string; publicUrl: string; storageKey: string }> {
  const config = getStorageConfig();
  if (!config) throw new Error('S3 storage is not configured. Set AWS_S3_BUCKET and AWS_S3_PUBLIC_URL.');

  const ext = params.filename.includes('.') ? params.filename.split('.').pop() : 'jpg';
  const storageKey = `orgs/${params.organizationId}/vehicles/${params.vehicleId}/${randomUUID()}.${ext}`;

  const command = new PutObjectCommand({
    Bucket: config.bucket,
    Key: storageKey,
    ContentType: params.contentType,
  });

  const uploadUrl = await getSignedUrl(getS3Client(), command, { expiresIn: 600 });
  const publicUrl = `${config.publicUrlBase}/${storageKey}`;

  return { uploadUrl, publicUrl, storageKey };
}

export async function deleteStoredObject(storageKey: string): Promise<void> {
  const config = getStorageConfig();
  if (!config || !storageKey) return;

  await getS3Client().send(
    new DeleteObjectCommand({ Bucket: config.bucket, Key: storageKey })
  );
}
