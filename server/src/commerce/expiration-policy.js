export class ExpirationPolicyError extends Error {
  constructor(message) { super(message); this.code = 'INVALID_EXPIRATION_POLICY'; }
}
export function expirationPolicy(env = process.env) {
  const flag = env.UNPAID_ORDER_EXPIRATION_ENABLED;
  if (flag !== undefined && !['true', 'false'].includes(flag)) throw new ExpirationPolicyError('UNPAID_ORDER_EXPIRATION_ENABLED must be true or false.');
  const enabled = flag === 'true', raw = env.UNPAID_ORDER_EXPIRATION_MINUTES;
  let windowMs = null;
  if (raw !== undefined) {
    if (typeof raw !== 'string' || !/^[1-9]\d{0,8}$/.test(raw) || !Number.isSafeInteger(Number(raw) * 60000)) throw new ExpirationPolicyError('UNPAID_ORDER_EXPIRATION_MINUTES must be a positive whole number within the supported integer range.');
    windowMs = Number(raw) * 60000;
  }
  if (enabled && windowMs === null) throw new ExpirationPolicyError('An owner-approved payment window is required before enabling unpaid-order expiration.');
  return Object.freeze({ enabled, windowMs });
}
