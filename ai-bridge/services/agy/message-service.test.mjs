import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { test } from 'node:test';

import { getAgyCommandList } from '../../channels/agy-channel.js';
import {
  buildAgyCliInvocation,
  buildAgyRunnerInvocation,
  buildAgyStdinPayload,
  extractAgyAssistantTextFromPayload,
  resolveAgyModelSelection,
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

test('resolveAgyModelSelection maps built-in thinking variants to SDK model and high effort', () => {
  assert.deepEqual(
    resolveAgyModelSelection('gemini-3.5-flash@high', 'medium'),
    { model: 'gemini-3.5-flash', reasoningEffort: 'high' }
  );
  assert.deepEqual(
    resolveAgyModelSelection('claude-sonnet-4-6@thinking', ''),
    { model: 'claude-sonnet-4-6', reasoningEffort: 'high' }
  );
});

test('buildAgyCliInvocation strips Agy thinking variant before passing --model', () => {
  const invocation = buildAgyCliInvocation({
    message: 'hello',
    model: 'gemini-3.5-flash@high',
    reasoningEffort: 'high'
  }, { cliPath: 'agy' });

  assert.deepEqual(
    invocation.args.slice(invocation.args.indexOf('--model'), invocation.args.indexOf('--model') + 2),
    ['--model', 'gemini-3.5-flash']
  );
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

test('extractAgyAssistantTextFromPayload keeps the final user-facing answer only', () => {
  const finalAnswer = [
    '在文件 P266ErpFormTypeConstants.java 的第 22 行，定义了以下常量：',
    '```java',
    'public static final String ERP_ASN = "erpAsn";',
    '```',
    '### 含义解析',
    '1. **这是什么**：它是一个表示 ERP 入库单的 WMS 单据类型常量。',
    '* **出库类（桶物料）**：专门针对库存单位为 `tong`（桶）的物料对应的 3 种出库来源。'
  ].join('\n');
  const payload = Buffer.concat([
    Buffer.from('B!\nsessionID\n'),
    Buffer.from(`${finalAnswer}\n`),
    Buffer.from('**Defining ERP ASN Constant**\n'),
    Buffer.from('I am identifying the Java constant before answering the user.\n'),
    Buffer.from('2(bot-a343ba70-7bfa-4ab6-94b2-b2f54d635510B\n'),
    Buffer.from(`${finalAnswer}Z\n`),
    Buffer.from('ZE\nI_\n<k\nDa\n`C\n۵I蟸=\n')
  ]);

  assert.equal(extractAgyAssistantTextFromPayload(payload), finalAnswer);
});

test('extractAgyAssistantTextFromPayload removes duplicated local greeting blocks', () => {
  const greeting = [
    '你好！我是 Antigravity，你的 AI 编程助手。',
    '我看到你的工作区里有一个 WMS（仓库管理系统）项目，包含以下目录：',
    '- `wms`',
    '- `wms-front`',
    '- `wms-p266`',
    '- `ykeey-wms-standard`',
    '请问今天有什么我可以帮你的吗？例如：',
    '- 查找/修改特定功能的代码',
    '- 调试或解决报错信息',
    '- 编写新模块或接口',
    '- 优化前端/后端代码',
    '你可以随时告诉我你的具体需求！'
  ].join('\n');
  const payload = Buffer.concat([
    Buffer.from('sessionID\n'),
    Buffer.from(`${greeting}2(bot-fc7b3607-c661-4994-8af2-e428b18a7f54B\n`),
    Buffer.from(`${greeting}\`\n`),
    Buffer.from('r\n9\nŊ7\n')
  ]);

  assert.equal(extractAgyAssistantTextFromPayload(payload), greeting);
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

test('sendMessage returns a clear error for image attachments in explicit local agy CLI auth', async () => {
  const output = [];
  let spawnCalled = false;

  const exitCode = await sendMessage('read this image', 'thread-1', 'C:/work', 'default', 'gemini-3.5-flash@high', '', [
    { fileName: 'screenshot.png', mediaType: 'image/png', data: 'iVBORw0KGgo=' }
  ], {
    authMode: 'localCli',
    cliPath: 'agy',
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
  assert.match(output[0], /image attachments require Agy SDK API-key mode/i);
});

test('sendMessage auto mode routes image attachments to SDK when a Gemini key is available', async () => {
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
  const spawnImpl = (command) => {
    capturedCommand = command;
    setImmediate(() => {
      child.emit('close', 0);
    });
    return child;
  };

  const exitCode = await sendMessage('read this image', 'thread-1', 'C:/work', 'default', 'gemini-3.5-flash@high', '', [
    { fileName: 'screenshot.png', mediaType: 'image/png', data: 'iVBORw0KGgo=' }
  ], {
    authMode: 'auto',
    pythonPath: 'python',
    cliPath: 'agy',
    env: { GEMINI_API_KEY: 'gemini-env-key' },
    spawnImpl,
    stdoutWrite: () => {}
  });

  assert.equal(exitCode, 0);
  assert.equal(capturedCommand, 'python');
  const payload = JSON.parse(stdin);
  assert.equal(payload.model, 'gemini-3.5-flash');
  assert.equal(payload.reasoningEffort, 'high');
  assert.equal(payload.attachments[0].mediaType, 'image/png');
  assert.equal(payload.attachments[0].data, 'iVBORw0KGgo=');
});

test('sendMessage emits local agy CLI stream start before print process finishes', async () => {
  const child = new EventEmitter();
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.stdin = {
    write() {},
    end() {}
  };

  const output = [];
  const spawnImpl = () => child;

  const pending = sendMessage('hello', 'thread-1', 'C:/work', 'default', 'gemini-3.5-flash@high', '', [], {
    authMode: 'localCli',
    cliPath: 'agy',
    env: {},
    spawnImpl,
    stdoutWrite: (chunk) => output.push(chunk)
  });

  assert.deepEqual(output.slice(0, 2), [
    '[MESSAGE_START]\n',
    '[STREAM_START]\n'
  ]);

  child.stdout.emit('data', Buffer.from('CLI answer\n'));
  child.emit('close', 0);
  await pending;
});

test('sendMessage sanitizes protobuf-like local agy CLI stdout before emitting', async () => {
  const child = new EventEmitter();
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.stdin = {
    write() {},
    end() {}
  };

  const cleanAnswer = [
    '在文件 P266ErpFormTypeConstants.java 的第 22 行，定义了以下常量：',
    '```java',
    'public static final String ERP_ASN = "erpAsn";',
    '```',
    '### 含义解析'
  ].join('\n');
  const output = [];
  const spawnImpl = () => {
    setImmediate(() => {
      child.stdout.emit('data', Buffer.concat([
        Buffer.from('sessionID\n'),
        Buffer.from(`${cleanAnswer}\n`),
        Buffer.from('**Defining ERP ASN Constant**\nI am thinking about the constant.\n'),
        Buffer.from('2(bot-a343ba70-7bfa-4ab6-94b2-b2f54d635510B\n'),
        Buffer.from(`${cleanAnswer}Z\nZE\nI_\n`)
      ]));
      child.emit('close', 0);
    });
    return child;
  };

  const exitCode = await sendMessage('hello', 'thread-1', 'C:/work', 'default', '', '', [], {
    authMode: 'localCli',
    cliPath: 'agy',
    env: {},
    spawnImpl,
    stdoutWrite: (chunk) => output.push(chunk)
  });

  assert.equal(exitCode, 0);
  assert.equal(output[3], `[CONTENT_DELTA] ${JSON.stringify(cleanAnswer)}\n`);
  assert.equal(output[6], `${JSON.stringify({
    success: true,
    threadId: 'thread-1',
    result: cleanAnswer
  })}\n`);
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
