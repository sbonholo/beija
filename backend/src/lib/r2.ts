import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';

function configured() {
  return !!(
    process.env.R2_ACCOUNT_ID &&
    process.env.R2_ACCESS_KEY_ID &&
    process.env.R2_SECRET_ACCESS_KEY &&
    process.env.R2_BUCKET &&
    process.env.R2_PUBLIC_URL
  );
}

let _client: S3Client | null = null;

function client(): S3Client {
  if (!_client) {
    _client = new S3Client({
      region: 'auto',
      endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID!,
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
      },
    });
  }
  return _client;
}

export const r2 = {
  get enabled() {
    return configured();
  },

  async upload(key: string, body: Buffer, contentType: string): Promise<string> {
    await client().send(
      new PutObjectCommand({
        Bucket: process.env.R2_BUCKET!,
        Key: key,
        Body: body,
        ContentType: contentType,
      })
    );
    return `${process.env.R2_PUBLIC_URL}/${key}`;
  },

  async delete(url: string): Promise<void> {
    const base = process.env.R2_PUBLIC_URL;
    if (!base || !url.startsWith(base + '/')) return;
    const key = url.slice(base.length + 1);
    try {
      await client().send(
        new DeleteObjectCommand({ Bucket: process.env.R2_BUCKET!, Key: key })
      );
    } catch (err: any) {
      if (err?.Code !== 'NoSuchKey') console.error('[r2] delete failed:', err?.Code);
    }
  },
};
