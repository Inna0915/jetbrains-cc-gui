import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { test } from 'node:test';

import { getAgyCommandList } from '../../channels/agy-channel.js';
import {
  buildAgyRunnerInvocation,
  buildAgyStdinPayload,
  extractAgyAssistantTextFromPayload,
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
    reasoningEffort: 'medium',
    authMode: 'localCli'
  });

  assert.equal(payload.message, 'hello');
  assert.equal(payload.conversationId, 'thread-1');
  assert.equal(payload.permissionMode, 'default');
  assert.equal(payload.model, 'gemini-3-pro');
  assert.equal(payload.reasoningEffort, 'medium');
  assert.equal(payload.authMode, 'localCli');
});

test('buildAgyRunnerInvocation points at agy_sdk_runner.py', () => {
  const invocation = buildAgyRunnerInvocation({ pythonPath: 'C:/Python/python.exe' });

  assert.equal(invocation.command, 'C:/Python/python.exe');
  assert.equal(invocation.args.length, 1);
  assert.match(invocation.args[0], /agy_sdk_runner\.py$/);
});

test('extractAgyAssistantTextFromPayload skips protobuf metadata before assistant text', () => {
  const payload = Buffer.concat([
    Buffer.from('B!\nsessionID\n'),
    Buffer.from('c8fab3fa-6309-4ce0-bf70-8ba44d0873f0\n'),
    Buffer.from('I have a useful answer.\n'),
    Buffer.from('### Details\n'),
    Buffer.from('* one\n')
  ]);

  assert.equal(
    extractAgyAssistantTextFromPayload(payload),
    'I have a useful answer.\n### Details\n* one'
  );
});

test('extractAgyAssistantTextFromPayload handles short token answers with protobuf suffixes', () => {
  const payload = Buffer.concat([
    Buffer.from('sessionID\n'),
    Buffer.from('LOCAL_AUTH_OK2(bot-5d4bed43-4f6a-4eee-8f9e-44012fec8937B\n'),
    Buffer.from('LOCAL_AUTH_OK`\n'),
    Buffer.from('Z/T\n'),
    Buffer.from(':hC\n')
  ]);

  assert.equal(extractAgyAssistantTextFromPayload(payload), 'LOCAL_AUTH_OK');
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
    authMode: 'apiKey',
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

test('sendMessage uses local agy CLI auth without Gemini key when requested', async () => {
  const child = new EventEmitter();
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.stdin = {
    write() {},
    end() {}
  };

  let capturedCommand = null;
  let capturedArgs = null;
  let capturedOptions = null;
  const output = [];
  const spawnImpl = (command, args, options) => {
    capturedCommand = command;
    capturedArgs = args;
    capturedOptions = options;
    setImmediate(() => {
      child.stdout.emit('data', Buffer.from('CLI answer\n'));
      child.emit('close', 0);
    });
    return child;
  };

  const exitCode = await sendMessage('hello', 'thread-1', 'C:/work', 'bypassPermissions', 'gemini-3.5-flash', '', [], {
    authMode: 'localCli',
    cliPath: 'agy',
    env: {},
    spawnImpl,
    stdoutWrite: (chunk) => output.push(chunk)
  });

  assert.equal(exitCode, 0);
  assert.equal(capturedCommand, 'agy');
  assert.deepEqual(capturedOptions.stdio, ['ignore', 'pipe', 'pipe']);
  assert.equal(capturedOptions.cwd, 'C:/work');
  assert.ok(capturedArgs.includes('--dangerously-skip-permissions'));
  assert.deepEqual(
    capturedArgs.slice(capturedArgs.indexOf('--conversation'), capturedArgs.indexOf('--conversation') + 2),
    ['--conversation', 'thread-1']
  );
  assert.deepEqual(
    capturedArgs.slice(capturedArgs.indexOf('--model'), capturedArgs.indexOf('--model') + 2),
    ['--model', 'gemini-3.5-flash']
  );
  assert.deepEqual(
    capturedArgs.slice(capturedArgs.indexOf('--print'), capturedArgs.indexOf('--print') + 2),
    ['--print', 'hello']
  );
  assert.deepEqual(output, [
    '[MESSAGE_START]\n',
    '[STREAM_START]\n',
    '[THREAD_ID] thread-1\n',
    '[CONTENT_DELTA] "CLI answer"\n',
    '[STREAM_END]\n',
    '[MESSAGE_END]\n',
    '{"success":true,"threadId":"thread-1","result":"CLI answer"}\n'
  ]);
});

test('sendMessage auto mode prefers local agy CLI auth over SDK credentials', async () => {
  const child = new EventEmitter();
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.stdin = {
    write() {},
    end() {}
  };

  let capturedCommand = null;
  const spawnImpl = (command) => {
    capturedCommand = command;
    setImmediate(() => {
      child.stdout.emit('data', Buffer.from('local auth answer'));
      child.emit('close', 0);
    });
    return child;
  };

  await sendMessage('hello', '', 'C:/work', 'default', '', '', [], {
    authMode: 'auto',
    cliPath: 'agy',
    env: { GEMINI_API_KEY: 'gemini-env-key' },
    spawnImpl,
    stdoutWrite: () => {}
  });

  assert.equal(capturedCommand, 'agy');
});

test('sendMessage returns a clear error without spawning when no Gemini key is configured', async () => {
  const output = [];
  let spawnCalled = false;

  const exitCode = await sendMessage('hello', 'thread-1', 'C:/work', 'default', 'gemini-3-pro', '', [], {
    authMode: 'apiKey',
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
    authMode: 'apiKey',
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
    authMode: 'apiKey',
    pythonPath: 'python',
    env: { GEMINI_API_KEY: 'gemini-env-key' },
    spawnImpl,
    stdoutWrite: (chunk) => output.push(chunk)
  });

  assert.deepEqual(output, fakeOutput);
});
