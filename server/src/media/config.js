import { randomBytes } from 'node:crypto';

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const MAX_PRODUCT_IMAGES = 24;
const TYPES = Object.freeze({ 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' });
export const ALLOWED_IMAGE_TYPES = Object.keys(TYPES);

export function validateImageIntent(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some(key => !['contentType','size'].includes(key)))
    throw new Error('Invalid image upload request.');
  if (!Object.hasOwn(TYPES, body.contentType) || !Number.isSafeInteger(body.size) || body.size < 1 || body.size > MAX_IMAGE_BYTES)
    throw new Error('Only JPEG, PNG or WebP images up to 5 MB are allowed.');
  return { contentType: body.contentType, size: body.size, extension: TYPES[body.contentType] };
}
export function makeImageKey(extension) {
  if (!Object.values(TYPES).includes(extension)) throw new Error('Invalid image extension.');
  return `catalog/${randomBytes(20).toString('hex')}.${extension}`;
}
export function hasCorrectImageSignature(type, bytes) {
  const b = Buffer.from(bytes);
  if (type === 'image/jpeg') return b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
  if (type === 'image/png') return b.length >= 8 && b.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
  if (type === 'image/webp') return b.length >= 12 && b.toString('ascii',0,4) === 'RIFF' && b.toString('ascii',8,12) === 'WEBP';
  return false;
}
export function imageUrl(key, env = process.env) {
  const origin = env.R2_PUBLIC_BASE_URL?.trim();
  if (!origin || !/^https:\/\//.test(origin) || !/^catalog\/[a-f0-9]{40}\.(?:jpg|png|webp)$/.test(key || '')) return null;
  return `${origin.replace(/\/$/,'')}/${key}`;
}
export async function checkVerifiedKeys(keys, MediaAsset) {
  if (!Array.isArray(keys) || keys.length > MAX_PRODUCT_IMAGES || keys.some(key => typeof key !== 'string' || !/^catalog\/[a-f0-9]{40}\.(?:jpg|png|webp)$/.test(key)) || new Set(keys).size !== keys.length)
    throw new Error('Invalid gallery images.');
  if (!keys.length) return;
  const count = await MediaAsset.countDocuments({ key: { $in: keys }, state: 'verified' });
  if (count !== keys.length) throw new Error('An image has not been verified in Quantum Coffee storage.');
}
