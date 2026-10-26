// Preparation only. Not imported into app startup or emitted into _headers.
// Test with final origins in Report-Only before any owner-approved enforcement.
export function buildCandidateCsp({ apiOrigin = '', mediaOrigin = '', privateStorageOrigin = '' } = {}) {
  for (const value of [apiOrigin, mediaOrigin, privateStorageOrigin]) {
    if (!value) continue;
    let url; try { url = new URL(value); } catch { throw new Error('Invalid CSP origin.'); }
    if (url.protocol !== 'https:' || url.origin !== value || url.username || url.password) throw new Error('CSP needs exact HTTPS origins.');
  }
  return ["default-src 'none'", "script-src 'self'", "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com", "font-src https://fonts.gstatic.com",
    `img-src 'self' blob: data: ${[mediaOrigin, privateStorageOrigin].filter(Boolean).join(' ')}`.trim(),
    `connect-src 'self' ${[apiOrigin, privateStorageOrigin, mediaOrigin].filter(Boolean).join(' ')}`.trim(),
    "object-src 'none'", "base-uri 'none'", "frame-ancestors 'none'", "form-action 'self'"].join('; ');
}
