import { orderEmailIssues } from '../notifications/order-mail-values.js';

// Production safety checks. This project must never silently attach to an
// existing client's database or accept cross-site auth on an unapproved origin.
const EXPECTED_DATABASE = 'quantumcoffee_production';

function isHttpsOrigin(value) {
  if (typeof value !== 'string' || !value.trim()) return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password &&
      url.pathname === '/' && !url.search && !url.hash &&
      value === url.origin;
  } catch { return false; }
}

export function productionConfigIssues(env = process.env) {
  if (env.NODE_ENV !== 'production') return [];
  const issues = [];
  if (env.MONGODB_DB_NAME !== EXPECTED_DATABASE) {
    issues.push(`MONGODB_DB_NAME must be ${EXPECTED_DATABASE} (separate Quantum Coffee database).`);
  }
  if (typeof env.MONGODB_URI !== 'string' || !/^mongodb(?:\+srv)?:\/\//.test(env.MONGODB_URI)) {
    issues.push('MONGODB_URI must be a MongoDB connection URI.');
  }
  if (!isHttpsOrigin(env.PUBLIC_SITE_ORIGIN)) {
    issues.push('PUBLIC_SITE_ORIGIN must be an HTTPS origin, without a trailing slash.');
  }
  const origins = (env.CLIENT_ORIGIN || '').split(',').map(s => s.trim()).filter(Boolean);
  if (!origins.length || origins.some(origin => !isHttpsOrigin(origin))) {
    issues.push('CLIENT_ORIGIN must contain explicit HTTPS origins (comma-separated).');
  }
  if (env.PUBLIC_SITE_ORIGIN && !origins.includes(env.PUBLIC_SITE_ORIGIN)) {
    issues.push('CLIENT_ORIGIN must include PUBLIC_SITE_ORIGIN exactly.');
  }
  if (env.CHECKOUT_ENABLED === 'true') {
    issues.push('CHECKOUT_ENABLED must stay false until payment-proof verification and launch checks are complete.');
  }
  if (env.REGISTRATION_ENABLED === 'true' &&
      !(env.SMTP_HOST && env.SMTP_USER && env.SMTP_PASSWORD && env.MAIL_FROM)) {
    issues.push('REGISTRATION_ENABLED requires configured verified-domain SMTP credentials.');
  }
  issues.push(...orderEmailIssues(env));
  if (env.ALLOW_ADMIN_BOOTSTRAP === 'true') {
    issues.push('ALLOW_ADMIN_BOOTSTRAP must never be enabled on the Render service.');
  }
  return issues;
}

export function assertProductionConfig(env = process.env) {
  const issues = productionConfigIssues(env);
  if (issues.length) throw new Error(`Unsafe production configuration:\n- ${issues.join('\n- ')}`);
}
