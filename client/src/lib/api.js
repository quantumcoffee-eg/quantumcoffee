// Same-origin API requests through Vite's /api proxy locally. In production,
// set VITE_API_BASE_URL to https://api.yourdomain.com before building.
const BASE_URL = (import.meta.env?.VITE_API_BASE_URL || '').replace(/\/$/, '');
export async function api(path, { method = 'GET', body, signal, publicRead = false } = {}) {
  if (publicRead && (method !== 'GET' || !['/catalog/categories', '/store/settings'].includes(path))) throw new Error('This response is not eligible for public reads.');
  const response = await fetch(`${BASE_URL}/api${path}`, {
    method,
    headers: body === undefined ? { Accept: 'application/json' } : { Accept: 'application/json', 'Content-Type': 'application/json' },
    credentials: publicRead ? 'omit' : 'include', cache: 'no-store',
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    ...(signal ? { signal } : {}),
  });
  let data;
  try { data = response.status === 204 ? {} : await response.json(); }
  catch { data = null; }
  if (response.ok && (!data || typeof data !== 'object' || Array.isArray(data))) throw Object.assign(new Error('The server returned an unreadable response. Please retry.'), { code: 'INVALID_RESPONSE' });
  if (!response.ok) {
    const error = new Error(typeof data?.error === 'string' ? data.error : `Request failed (${response.status}).`);
    error.code = data?.code;
    error.status = response.status;
    throw error;
  }
  return data;
}
