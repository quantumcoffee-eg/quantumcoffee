export const MAIL_MAX_ATTEMPTS = 5;
export const MAIL_BATCH_SIZE = 5;
export const MAIL_LEASE_MS = 60000;
export const MAIL_SEND_MS = 20000;
export const MAIL_POLL_MS = 120000;
export const MAIL_DB_MS = 5000;
export const MAIL_WRITE_OPTIONS = { maxTimeMS: MAIL_DB_MS, timeoutMS: MAIL_DB_MS, writeConcern: { w: 'majority', wtimeout: 3000 } };
export const retryDelay = attempts => Math.min(3600000, 30000 * 2 ** Math.min(16, Math.max(0, attempts - 1)));

// Never retain provider text, response strings, recipient data or arbitrary codes.
export function mailFailure(error) {
  if (error?.code === 'INVALID_NOTIFICATION' || error?.code === 'MONETARY_EVENT_MISMATCH') return { state: 'dead', code: 'INVALID_NOTIFICATION', category: 'integrity' };
  const response = error?.responseCode;
  if (Number.isInteger(response) && response >= 400 && response <= 499) return { state: 'pending', code: 'SMTP_TEMPORARY_REJECTION', category: 'temporary' };
  if (error?.code === 'EAUTH') return { state: 'dead', code: 'SMTP_AUTH_FAILED', category: 'configuration' };
  if (Number.isInteger(response) && response >= 500 && response <= 599) return { state: 'dead', code: 'SMTP_PERMANENT_REJECTION', category: 'permanent' };
  if (['EDNS', 'ECONNREFUSED'].includes(error?.code) || (['ECONNECTION', 'ETIMEDOUT', 'ESOCKET'].includes(error?.code) && error?.command === 'CONN')) return { state: 'pending', code: 'SMTP_CONNECT_FAILED', category: 'temporary' };
  return { state: 'uncertain', code: 'DELIVERY_OUTCOME_UNKNOWN', category: 'uncertain' };
}
