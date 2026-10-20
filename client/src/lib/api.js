// Same-origin API requests through Vite's /api proxy locally. In production,
// set VITE_API_BASE_URL to https://api.yourdomain.com before building.
const BASE_URL = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '');
export async function api(path, { method = 'GET', body, signal } = {}) {
  const response = await fetch(`${BASE_URL}/api${path}`, {
    method,
    headers: body === undefined ? { Accept: 'application/json' } : { Accept: 'application/json', 'Content-Type': 'application/json' },
    credentials: 'include',
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    ...(signal ? { signal } : {}),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.error || `Request failed (${response.status}).`);
    error.code = data.code;
    error.status = response.status;
    throw error;
  }
  return data;
}
