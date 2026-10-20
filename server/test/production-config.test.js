import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assertProductionConfig, productionConfigIssues } from '../src/config/production.js';

const valid = {
  NODE_ENV: 'production',
  MONGODB_DB_NAME: 'quantumcoffee_production',
  MONGODB_URI: 'mongodb+srv://test.example.invalid/?retryWrites=true',
  PUBLIC_SITE_ORIGIN: 'https://quantumcoffee.example',
  CLIENT_ORIGIN: 'https://quantumcoffee.example,https://www.quantumcoffee.example',
  REGISTRATION_ENABLED: 'false',
  ALLOW_ADMIN_BOOTSTRAP: 'false',
};

test('allows deliberate production configuration', () => {
  assert.deepEqual(productionConfigIssues(valid), []);
  assert.doesNotThrow(() => assertProductionConfig(valid));
});

test('rejects missing URI and mismatched database name', () => {
  const issues = productionConfigIssues({ ...valid, MONGODB_URI: '', MONGODB_DB_NAME: 'tapandwrap_production' });
  assert.ok(issues.some(issue => issue.includes('MONGODB_URI')));
  assert.ok(issues.some(issue => issue.includes('MONGODB_DB_NAME')));
});

test('rejects cross-site origins or accidentally enabled admin bootstrap', () => {
  const issues = productionConfigIssues({ ...valid, PUBLIC_SITE_ORIGIN: 'http://localhost:5173', ALLOW_ADMIN_BOOTSTRAP: 'true' });
  assert.ok(issues.some(issue => issue.includes('PUBLIC_SITE_ORIGIN')));
  assert.ok(issues.some(issue => issue.includes('ALLOW_ADMIN_BOOTSTRAP')));
});

test('does not constrain local development', () => {
  assert.deepEqual(productionConfigIssues({ NODE_ENV: 'development' }), []);
});
