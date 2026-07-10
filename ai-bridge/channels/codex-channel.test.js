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

test('handleCodexCommand forwards max reasoning effort to sendMessage', async () => {
  const { handleCodexCommand } = await import('./codex-channel.js');
  assert.equal(handleCodexCommand.length, 4);

  let capturedArgs;
  const sendMessage = async (...args) => {
    capturedArgs = args;
  };

  await handleCodexCommand('send', [], {
    message: 'hello',
    threadId: 'thread-1',
    cwd: 'C:\\workspace',
    permissionMode: 'default',
    model: 'gpt-5.6',
    baseUrl: 'https://example.test',
    apiKey: 'test-key',
    reasoningEffort: 'max',
    serviceTier: 'default',
    attachments: []
  }, { sendMessage });

  assert.equal(capturedArgs[7], 'max');
});
