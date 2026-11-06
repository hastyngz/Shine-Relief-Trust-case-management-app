import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

let client: S3Client | undefined;

function getR2Config() {
  const accessKeyId = process.env.CLOUDFLARE_R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY;
  const endpoint = process.env.CLOUDFLARE_R2_ENDPOINT;
  const bucket = process.env.CLOUDFLARE_R2_BUCKET_NAME;
  if (!accessKeyId || !secretAccessKey || !endpoint || !bucket) {
    throw new Error('Cloudflare R2 is not configured. Set its access key, secret, endpoint, and bucket name.');
  }
  return { accessKeyId, secretAccessKey, endpoint, bucket };
}

function getClient(): S3Client {
  if (client) return client;
  const config = getR2Config();
  client = new S3Client({
    region: 'auto',
    endpoint: config.endpoint,
    forcePathStyle: true,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
  });
  return client;
}

export async function putR2Object(
  key: string,
  body: Uint8Array,
  contentType: string,
  metadata: Record<string, string> = {}
): Promise<void> {
  const { bucket } = getR2Config();
  await getClient().send(new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    Body: body,
    ContentType: contentType,
    CacheControl: 'private, no-store',
    Metadata: metadata,
  }));
}

export async function getR2Object(key: string): Promise<{ body: Uint8Array; contentType: string }> {
  const { bucket } = getR2Config();
  const response = await getClient().send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  if (!response.Body) throw new Error('The requested file is empty or unavailable.');
  return {
    body: await response.Body.transformToByteArray(),
    contentType: response.ContentType || 'application/octet-stream',
  };
}

export async function deleteR2Object(key: string): Promise<void> {
  const { bucket } = getR2Config();
  await getClient().send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
}

export async function getR2DownloadUrl(key: string, downloadFileName?: string): Promise<string> {
  const { bucket } = getR2Config();
  const safeFileName = downloadFileName?.replace(/[\r\n"]/g, '_');
  return getSignedUrl(getClient(), new GetObjectCommand({
    Bucket: bucket,
    Key: key,
    ...(safeFileName ? { ResponseContentDisposition: `attachment; filename*=UTF-8''${encodeURIComponent(safeFileName)}` } : {}),
  }), { expiresIn: 20 * 60 });
}
