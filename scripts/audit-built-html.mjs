#!/usr/bin/env node
// Inspect the actual Vite/Cloudflare Pages output, without changing any files.
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { auditBuiltHtml } from './seo/audit-built-values.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dir = resolve(root, 'client/dist');
const report = auditBuiltHtml(dir, process.env.VITE_PUBLIC_SITE_ORIGIN || '');
if (report.problems.length) {
  console.error(`BUILT HTML AUDIT FAILED (${report.problems.length} finding(s)).`);
  for (const problem of report.problems) console.error(`- ${problem}`);
  process.exitCode = 1;
} else {
  console.log(`BUILT HTML AUDIT PASSED (${report.routesChecked} public HTML routes).`);
  console.log('Prelaunch noindex protection verified in built HTML and _headers.');
  console.log('NOT a launch approval: this does not render product HTML or verify deployed HTTP responses.');
}
