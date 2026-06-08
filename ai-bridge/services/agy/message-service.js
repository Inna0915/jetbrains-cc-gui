import { spawn } from 'node:child_process';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const serviceDir = dirname(fileURLToPath(import.meta.url));

export function getAgyRunnerPath() {
  return join(serviceDir, 'agy_sdk_runner.py');
}

export function getDefaultManagedPythonPath(platform = process.platform) {
  const venvDir = join(homedir(), '.codemoss', 'dependencies', 'agy-sdk', '.venv');
  if (platform === 'win32') {
    return join(venvDir, 'Scripts', 'python.exe');
  }
  return join(venvDir, 'bin', 'python');
}

export function resolvePythonPath(options = {}) {
  return options.pythonPath
    || process.env.AGY_PYTHON_PATH
    || process.env.AGY_SDK_PYTHON
    || getDefaultManagedPythonPath();
}

export function buildAgyRunnerInvocation(options = {}) {
  return {
    command: resolvePythonPath(options),
    args: [getAgyRunnerPath()]
  };
}

export function buildAgyStdinPayload({
  message,
  conversationId,
  threadId,
  sessionId,
  cwd,
  permissionMode,
  model,
  apiKey,
  attachments,
  saveDir,
  agentPrompt
}) {
  return {
    message: message || '',
    conversationId: conversationId || threadId || sessionId || null,
    cwd: cwd || process.cwd(),
    permissionMode: permissionMode || 'default',
    model: model || null,
    apiKey: apiKey || null,
    attachments: Array.isArray(attachments) ? attachments : [],
    saveDir: saveDir || null,
    agentPrompt: agentPrompt || null
  };
}

function forwardStderrChunk(chunk, stdoutWrite) {
  const text = chunk.toString();
  for (const line of text.split(/\r?\n/)) {
    if (line.trim()) {
      stdoutWrite(`[DEBUG] ${line}\n`);
    }
  }
}

export async function runAgyRunner(payload, options = {}) {
  const { command, args } = buildAgyRunnerInvocation(options);
  const spawnImpl = options.spawnImpl || spawn;
  const stdoutWrite = options.stdoutWrite || ((chunk) => process.stdout.write(chunk));
  const child = spawnImpl(command, args, {
    cwd: payload.cwd || process.cwd(),
    env: {
      ...process.env,
      AGY_USE_STDIN: 'true'
    },
    stdio: ['pipe', 'pipe', 'pipe']
  });

  const stderrLines = [];
  child.stdout.on('data', (chunk) => {
    stdoutWrite(chunk.toString());
  });
  child.stderr.on('data', (chunk) => {
    const text = chunk.toString();
    stderrLines.push(text);
    forwardStderrChunk(chunk, stdoutWrite);
  });

  child.stdin.write(JSON.stringify(payload));
  child.stdin.end();

  return new Promise((resolve, reject) => {
    child.on('error', reject);
    child.on('close', (code) => {
      if (code !== 0) {
        stdoutWrite(`[SEND_ERROR] ${JSON.stringify({
          success: false,
          error: stderrLines.join('').trim() || `Agy runner exited with code ${code}`
        })}\n`);
      }
      resolve(code);
    });
  });
}

export async function sendMessage(
  message,
  conversationId = null,
  cwd = null,
  permissionMode = null,
  model = null,
  apiKey = null,
  attachments = [],
  options = {}
) {
  const payload = buildAgyStdinPayload({
    message,
    conversationId,
    cwd,
    permissionMode,
    model,
    apiKey,
    attachments,
    saveDir: options.saveDir,
    agentPrompt: options.agentPrompt
  });
  return runAgyRunner(payload, options);
}
