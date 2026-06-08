import test from 'node:test';
import assert from 'node:assert/strict';

import {
  AgyPermissionMapper,
  PermissionMapperFactory
} from './permission-mapper.js';

test('AgyPermissionMapper preserves supported permission modes for Python policy builder', () => {
  assert.equal(AgyPermissionMapper.toProvider('plan').mode, 'plan');
  assert.equal(AgyPermissionMapper.toProvider('default').mode, 'default');
  assert.equal(AgyPermissionMapper.toProvider('acceptEdits').mode, 'acceptEdits');
  assert.equal(AgyPermissionMapper.toProvider('autoEdit').mode, 'acceptEdits');
  assert.equal(AgyPermissionMapper.toProvider('bypassPermissions').mode, 'bypassPermissions');
  assert.equal(AgyPermissionMapper.toProvider('yolo').mode, 'bypassPermissions');
});

test('PermissionMapperFactory resolves agy mapper', () => {
  assert.equal(PermissionMapperFactory.getMapper('agy'), AgyPermissionMapper);
  assert.deepEqual(PermissionMapperFactory.toProvider('agy', 'plan'), { mode: 'plan' });
});
