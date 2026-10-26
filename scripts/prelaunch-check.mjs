#!/usr/bin/env node
// Deliberately offline/read-only. This is a PRELAUNCH safety check, not a go-live sign-off.
import { readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const issues = [];
const checks = [];
const verify = (name, ok, reason) => {
  checks.push({ name, ok });
  if (!ok) issues.push(`${name}: ${reason}`);
};
const read = (path) => {
  const full = resolve(root, path);
  if (!existsSync(full)) return '';
  return readFileSync(full, 'utf8');
};

const html = read('client/index.html');
const blueprint = read('render.yaml');
const pageHeaders = read('client/public/_headers');
const gitignore = read('.gitignore');
const checkout = read('server/src/commerce/checkout.js');
const prod = read('server/src/config/production.js');
const redirect = read('client/public/_redirects');

verify('Frontend build inputs', existsSync(resolve(root, 'client/package-lock.json')) && existsSync(resolve(root, 'server/package-lock.json')), 'Both npm lockfiles are needed for reproducible deploys.');
verify('Prelaunch search exclusion', /<meta\s+name=["']robots["']\s+content=["']noindex,nofollow["']\s*\/>/i.test(html), 'Keep noindex,nofollow until final SEO approval.');
verify('Static route fallback', redirect.includes('/* /index.html 200'), 'Cloudflare Pages needs SPA fallback for routes.');
verify('Private environment excluded', /^\.env\s*$/m.test(gitignore) && /^\.env\.\*\s*$/m.test(gitignore), 'Keep actual .env files out of Git.');
verify('Source checkout launch lock', /export\s+const\s+ORDERING_IMPLEMENTED\s*=\s*false\s*;/.test(checkout), 'Do not remove the checkout code lock before checkout security review.');
verify('Production bootstrap guard', /ALLOW_ADMIN_BOOTSTRAP/.test(prod) && /CHECKOUT_ENABLED/.test(prod), 'Production configuration guard must enforce bootstrap and checkout restrictions.');
verify('Owner GitHub repository', blueprint.includes('repo: https://github.com/quantumcoffee-eg/quantumcoffee'), 'Render must use the owner repository.');
verify('Manual deployment mode', /autoDeployTrigger:\s*['"]?off['"]?/.test(blueprint), 'Keep automatic deploys disabled until launch review.');
verify('Render service setup', /rootDir:\s*server/.test(blueprint) && /healthCheckPath:\s*\/api\/ready/.test(blueprint) && /plan:\s*starter/.test(blueprint), 'Confirm Render root, readiness endpoint, and approved plan.');
for (const key of ['REGISTRATION_ENABLED', 'CHECKOUT_ENABLED', 'ORDER_EMAILS_ENABLED', 'ALLOW_ADMIN_BOOTSTRAP']) {
  verify(`${key} disabled in blueprint`, new RegExp(`- key: ${key}\\s+value: ['"]false['"]`).test(blueprint), 'Must start disabled.');
}
verify('Pages protection headers', pageHeaders.includes('X-Frame-Options: DENY') && pageHeaders.includes('Referrer-Policy:'), 'Add the Cloudflare Pages security header file.');
verify('Pages prelaunch robot header', /X-Robots-Tag:\s*noindex,\s*nofollow/i.test(pageHeaders), 'Prelaunch requests must not be indexed.');
verify('Hero media files', existsSync(resolve(root,'client/public/media/hero/quantum-hero.webp')) && existsSync(resolve(root,'client/public/media/hero/quantum-hero-mobile.webp')), 'Preserve the approved desktop/mobile hero assets.');
try {
  const tracked = execFileSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8' }).split('\0').filter(Boolean);
  const secrets = tracked.filter(p => /(^|\/)\.env(?:\.|$)/.test(p) && !p.endsWith('.env.example'));
  verify('No tracked .env secrets', secrets.length === 0, `Tracked secret-like files: ${secrets.join(', ')}`);
} catch {
  console.warn('NOTE: Git unavailable; skipped tracked-file check.');
}

for (const check of checks) console.log(`${check.ok ? 'PASS' : 'FAIL'}  ${check.name}`);
if (issues.length) {
  console.error(`\nPRELAUNCH CHECK FAILED (${issues.length} issue(s)).`);
  for (const issue of issues) console.error(`- ${issue}`);
  process.exitCode = 1;
} else {
  console.log(`\nPRELAUNCH SOURCE CHECK PASSED (${checks.length} checks).`);
  console.log('NOT a deployment approval: custom domain, R2, SMTP, policies, live payments, and transaction tests are still pending.');
}
