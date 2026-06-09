import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { test } from 'node:test';

import { getAgyCommandList } from '../../channels/agy-channel.js';
import {
  buildAgyRunnerInvocation,
  buildAgyStdinPayload,
  sendMessage
} from './message-service.js';

test('agy channel exposes send command', () => {
  assert.deepEqual(getAgyCommandList(), ['send']);
});

test('buildAgyStdinPayload normalizes permission mode and conversation id', () => {
  const payload = buildAgyStdinPayload({
    message: 'hello',
    threadId: 'thread-1',
    cwd: 'C:/work',
    permissionMode: '',
    model: 'gemini-3-pro',
    reasoningEffort: 'medium'
  });

  assert.equal(payload.message, 'hello');
  assert.equal(payload.conversationId, 'thread-1');
  assert.equal(payload.permissionMode, 'default');
  assert.equal(payload.model, 'gemini-3-pro');
  assert.equal(payload.reasoningEffort, 'medium');
});

test('buildAgyRunnerInvocation points at agy_sdk_runner.py', () => {
  const invocation = buildAgyRunnerInvocation({ pythonPath: 'C:/Python/python.exe' });

  assert.equal(invocation.command, 'C:/Python/python.exe');
  assert.equal(invocation.args.length, 1);
  assert.match(invocation.args[0], /agy_sdk_runner\.py$/);
});

test('sendMessage writes stdin JSON and forwards stdout', async () => {
  const child = new EventEmitter();
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  let stdin = '';
  child.stdin = {
    write(chunk) {
      stdin += chunk;
    },
    end() {}
  };

  let capturedCommand = null;
  let capturedArgs = null;
  const output = [];
  const spawnImpl = (command, args) => {
    capturedCommand = command;
    capturedArgs = args;
    setImmediate(() => {
      child.stdout.emit('data', Buffer.from('[MESSAGE_START]\n'));
      child.emit('close', 0);
    });
    return child;
  };

  await sendMessage('hello', 'thread-1', 'C:/work', 'default', 'gemini-3-pro', '', [], {
    pythonPath: 'python',
    env: { GEMINI_API_KEY: 'gemini-env-key' },
    spawnImpl,
    stdoutWrite: (chunk) => output.push(chunk)
  });

  assert.equal(capturedCommand, 'python');
  assert.match(capturedArgs[0], /agy_sdk_runner\.py$/);
  assert.equal(JSON.parse(stdin).permissionMode, 'default');
  assert.equal(JSON.parse(stdin).conversationId, 'thread-1');
  assert.deepEqual(output, ['[MESSAGE_START]\n']);
});

test('sendMessage returns a clear error without spawning when no Gemini key is configured', async () => {
  const output = [];
  let spawnCalled = false;

  const exitCode = await sendMessage('hello', 'thread-1', 'C:/work', 'default', 'gemini-3-pro', '', [], {
    env: {},
    spawnImpl: () => {
      spawnCalled = true;
      throw new Error('should not spawn');
    },
    stdoutWrite: (chunk) => output.push(chunk)
  });

  assert.equal(exitCode, 1);
  assert.equal(spawnCalled, false);
  assert.equal(output.length, 1);
  assert.match(output[0], /^\[SEND_ERROR\] /);
  assert.match(output[0], /Gemini API key is not configured/);
  assert.match(output[0], /Settings > Providers > Agy/);
});

test('sendMessage maps GOOGLE_API_KEY to GEMINI_API_KEY for the SDK runner', async () => {
  const child = new EventEmitter();
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  let stdin = '';
  child.stdin = {
    write(chunk) {
      stdin += chunk;
    },
    end() {}
  };

  let capturedEnv = null;
  const spawnImpl = (_command, _args, options) => {
    capturedEnv = options.env;
    setImmediate(() => {
      child.emit('close', 0);
    });
    return child;
  };

  await sendMessage('hello', 'thread-1', 'C:/work', 'default', 'gemini-3-pro', '', [], {
    pythonPath: 'python',
    env: { GOOGLE_API_KEY: 'google-env-key' },
    spawnImpl,
    stdoutWrite: () => {}
  });

  assert.equal(capturedEnv.GEMINI_API_KEY, 'google-env-key');
  assert.equal(JSON.parse(stdin).apiKey, 'google-env-key');
});

test('sendMessage forwards fake runner line protocol unchanged', async () => {
  const child = new EventEmitter();
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.stdin = {
    write() {},
    end() {}
  };

  const fakeOutput = [
    '[MESSAGE_START]\n',
    '[STREAM_START]\n',
    '[THREAD_ID] fake-conversation\n',
    '[CONTENT_DELTA] "hello"\n',
    '[STREAM_END]\n',
    '[MESSAGE_END]\n',
    '{"success":true,"threadId":"fake-conversation","result":"hello"}\n'
  ];
  const output = [];
  const spawnImpl = () => {
    setImmediate(() => {
      for (const line of fakeOutput) {
        child.stdout.emit('data', Buffer.from(line));
      }
      child.emit('close', 0);
    });
    return child;
  };

  await sendMessage('hello', 'fake-conversation', 'C:/work', 'default', 'gemini-3-pro', '', [], {
    pythonPath: 'python',
    env: { GEMINI_API_KEY: 'gemini-env-key' },
    spawnImpl,
    stdoutWrite: (chunk) => output.push(chunk)
  });

  assert.deepEqual(output, fakeOutput);
});
