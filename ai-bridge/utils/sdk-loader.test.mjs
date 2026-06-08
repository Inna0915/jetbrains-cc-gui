import test from 'node:test';
import assert from 'node:assert/strict';

import { getSdkStatus } from './sdk-loader.js';

test('getSdkStatus includes Java-managed Agy Python SDK status', () => {
  const status = getSdkStatus();

  assert.ok(status.agy);
  assert.equal(typeof status.agy.installed, 'boolean');
  assert.match(status.agy.path, /agy-sdk/);
  assert.match(status.agy.path, /\.venv/);
});
