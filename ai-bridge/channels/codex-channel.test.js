import test from 'node:test';
import assert from 'node:assert/strict';

test('normalizeCodexReasoningEffort preserves max', async () => {
  const codexChannel = await import('./codex-channel.js');

  assert.equal(typeof codexChannel.normalizeCodexReasoningEffort, 'function');
  assert.equal(codexChannel.normalizeCodexReasoningEffort('max'), 'max');
  assert.equal(codexChannel.normalizeCodexReasoningEffort(null), 'medium');
  assert.equal(codexChannel.normalizeCodexReasoningEffort(undefined), 'medium');
  assert.equal(codexChannel.normalizeCodexReasoningEffort(''), 'medium');
  assert.equal(codexChannel.normalizeCodexReasoningEffort('xhigh'), 'xhigh');
});
