// SDK imports are lazy: existing catalog/auth endpoints still work before R2 is configured.
export function r2Ready(env = process.env) {
  return ['R2_ACCOUNT_ID','R2_ACCESS_KEY_ID','R2_SECRET_ACCESS_KEY','R2_PUBLIC_BUCKET','R2_PUBLIC_BASE_URL'].every(key => Boolean(env[key]?.trim()));
}
async function clientAndCommands() {
  if (!r2Ready()) throw Object.assign(new Error('Quantum Coffee R2 media storage is not configured.'), { status: 503, code: 'MEDIA_UNAVAILABLE' });
  const { S3Client, PutObjectCommand, HeadObjectCommand, GetObjectCommand } = await import('@aws-sdk/client-s3');
  const client = new S3Client({
    region: 'auto',
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: process.env.R2_ACCESS_KEY_ID, secretAccessKey: process.env.R2_SECRET_ACCESS_KEY },
    forcePathStyle: true,
    requestChecksumCalculation: 'WHEN_REQUIRED',
  });
  return { client, PutObjectCommand, HeadObjectCommand, GetObjectCommand };
}
export async function makeUploadUrl(key, contentType) {
  const [{client,PutObjectCommand}, {getSignedUrl}] = await Promise.all([clientAndCommands(), import('@aws-sdk/s3-request-presigner')]);
  const command = new PutObjectCommand({ Bucket: process.env.R2_PUBLIC_BUCKET, Key: key, ContentType: contentType });
  return getSignedUrl(client, command, { expiresIn: 90, signableHeaders: new Set(['content-type']) });
}
export async function inspectImage(key) {
  const {client,HeadObjectCommand,GetObjectCommand} = await clientAndCommands();
  const bucket = process.env.R2_PUBLIC_BUCKET;
  const head = await client.send(new HeadObjectCommand({ Bucket:bucket, Key:key }));
  // Read only the signature bytes. Never proxy full images through Render.
  const obj = await client.send(new GetObjectCommand({ Bucket:bucket, Key:key, Range:'bytes=0-31' }));
  const bytes = await obj.Body.transformToByteArray();
  return { size: head.ContentLength, contentType: head.ContentType, bytes };
}
