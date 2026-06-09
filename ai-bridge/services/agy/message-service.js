import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import initSqlJs from 'sql.js';

const serviceDir = dirname(fileURLToPath(import.meta.url));
const VALID_AUTH_MODES = new Set(['auto', 'localCli', 'apiKey']);
const VALID_AGY_REASONING_EFFORTS = new Set(['low', 'medium', 'high']);
const AGY_MODEL_SELECTIONS = {
  'gemini-3.5-flash@low': { model: 'gemini-3.5-flash', reasoningEffort: 'low' },
  'gemini-3.5-flash@medium': { model: 'gemini-3.5-flash', reasoningEffort: 'medium' },
  'gemini-3.5-flash@high': { model: 'gemini-3.5-flash', reasoningEffort: 'high' },
  'gemini-3.1-pro@low': { model: 'gemini-3.1-pro', reasoningEffort: 'low' },
  'gemini-3.1-pro@high': { model: 'gemini-3.1-pro', reasoningEffort: 'high' },
  'claude-sonnet-4-6@thinking': { model: 'claude-sonnet-4-6', reasoningEffort: 'high' },
  'claude-opus-4-6@thinking': { model: 'claude-opus-4-6', reasoningEffort: 'high' },
  'gpt-oss-120b@medium': { model: 'gpt-oss-120b', reasoningEffort: 'medium' }
};
const AGY_BOT_BOUNDARY_PATTERN = /2\(bot-[0-9a-f-]+/i;
const AGY_BOT_BOUNDARY_SUFFIX_PATTERN = /2\(bot-[0-9a-f-]+.*$/i;

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

export function normalizeAgyAuthMode(authMode) {
  const value = typeof authMode === 'string' ? authMode.trim() : '';
  return VALID_AUTH_MODES.has(value) ? value : 'auto';
}

export function normalizeAgyReasoningEffort(reasoningEffort) {
  const value = typeof reasoningEffort === 'string' ? reasoningEffort.trim() : '';
  if (VALID_AGY_REASONING_EFFORTS.has(value)) {
    return value;
  }
  if (value === 'xhigh' || value === 'max') {
    return 'high';
  }
  return null;
}

export function resolveAgyModelSelection(model, reasoningEffort) {
  const modelId = typeof model === 'string' ? model.trim() : '';
  const selected = AGY_MODEL_SELECTIONS[modelId];
  if (selected) {
    return { ...selected };
  }
  return {
    model: modelId || null,
    reasoningEffort: normalizeAgyReasoningEffort(reasoningEffort)
  };
}

export function getDefaultAgyCliPath(platform = process.platform) {
  if (platform === 'win32') {
    return join(homedir(), 'AppData', 'Local', 'agy', 'bin', 'agy.exe');
  }
  return 'agy';
}

export function resolveAgyCliPath(options = {}) {
  if (options.cliPath) {
    return options.cliPath;
  }
  if (process.env.AGY_CLI_PATH) {
    return process.env.AGY_CLI_PATH;
  }
  const defaultPath = getDefaultAgyCliPath();
  if (defaultPath !== 'agy' && existsSync(defaultPath)) {
    return defaultPath;
  }
  return 'agy';
}

export function buildAgyCliInvocation(payload = {}, options = {}) {
  const args = [];
  const permissionMode = payload.permissionMode || 'default';
  const modelSelection = resolveAgyModelSelection(payload.model, payload.reasoningEffort);
  if (permissionMode === 'bypassPermissions') {
    args.push('--dangerously-skip-permissions');
  }
  if (payload.conversationId) {
    args.push('--conversation', payload.conversationId);
  }
  if (modelSelection.model) {
    args.push('--model', modelSelection.model);
  }
  args.push('--print-timeout', options.printTimeout || payload.printTimeout || '5m');
  args.push('--print', payload.message || '');
  return {
    command: resolveAgyCliPath(options),
    args
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
  agentPrompt,
  reasoningEffort,
  authMode
}) {
  const modelSelection = resolveAgyModelSelection(model, reasoningEffort);
  return {
    message: message || '',
    conversationId: conversationId || threadId || sessionId || null,
    cwd: cwd || process.cwd(),
    permissionMode: permissionMode || 'default',
    model: modelSelection.model,
    apiKey: apiKey || null,
    attachments: Array.isArray(attachments) ? attachments : [],
    saveDir: saveDir || null,
    agentPrompt: agentPrompt || null,
    reasoningEffort: modelSelection.reasoningEffort,
    authMode: normalizeAgyAuthMode(authMode)
  };
}

export function resolveAgyApiKey(payload = {}, env = process.env) {
  const value = payload.apiKey || env.GEMINI_API_KEY || env.GOOGLE_API_KEY || '';
  return typeof value === 'string' ? value.trim() : '';
}

function forwardStderrChunk(chunk, stdoutWrite) {
  const text = chunk.toString();
  for (const line of text.split(/\r?\n/)) {
    if (line.trim()) {
      stdoutWrite(`[DEBUG] ${line}\n`);
    }
  }
}

function shouldUseLocalCli(payload = {}, options = {}) {
  const authMode = normalizeAgyAuthMode(options.authMode || payload.authMode);
  return authMode === 'localCli' || authMode === 'auto';
}

function getLastConversationsPath(options = {}) {
  return options.lastConversationsPath
    || join(homedir(), '.gemini', 'antigravity-cli', 'cache', 'last_conversations.json');
}

function getConversationDbPath(conversationId, options = {}) {
  const conversationsDir = options.conversationsDir
    || join(homedir(), '.gemini', 'antigravity-cli', 'conversations');
  return join(conversationsDir, `${conversationId}.db`);
}

export function readAgyLastConversationId(cwd, options = {}) {
  const filePath = getLastConversationsPath(options);
  if (!cwd || !existsSync(filePath)) {
    return '';
  }
  try {
    const data = JSON.parse(readFileSync(filePath, 'utf8'));
    const candidates = [cwd, normalize(cwd)];
    for (const candidate of candidates) {
      if (data[candidate]) {
        return String(data[candidate]);
      }
    }
    const normalizedCwd = normalize(cwd).toLowerCase();
    const foundKey = Object.keys(data).find((key) => normalize(key).toLowerCase() === normalizedCwd);
    return foundKey ? String(data[foundKey]) : '';
  } catch {
    return '';
  }
}

function extractPrintableStrings(value) {
  if (!value) {
    return [];
  }
  const buffer = Buffer.from(value);
  const parts = [];
  let start = -1;
  const flush = (end) => {
    if (start >= 0 && end - start >= 2) {
      const text = buffer.subarray(start, end).toString('utf8')
        .replace(/\u0000/g, '')
        .replace(/\r\n/g, '\n')
        .trim();
      if (text) {
        parts.push(text);
      }
    }
    start = -1;
  };

  for (let i = 0; i < buffer.length; i += 1) {
    const byte = buffer[i];
    const printable = byte >= 0x20 && byte !== 0x7f;
    if (printable) {
      if (start < 0) {
        start = i;
      }
    } else {
      flush(i);
    }
  }
  flush(buffer.length);
  return parts.map((part) => part.replace(/[ \t]+\n/g, '\n').trim()).filter(Boolean);
}

function isLikelyAssistantText(text) {
  const value = (text || '').trim();
  if (!value) {
    return false;
  }
  if (/^```/.test(value)) {
    return true;
  }
  const replacementCount = (value.match(/\uFFFD/g) || []).length;
  if (replacementCount > 0) {
    return false;
  }
  if (value === 'sessionID' || value === 'view_file' || value === 'run_command' || value === 'call_mcp_tool') {
    return false;
  }
  if (AGY_BOT_BOUNDARY_PATTERN.test(value)) {
    return false;
  }
  if (value.length <= 4
    && !isShortTokenAnswer(value)
    && !/[\u4e00-\u9fff]/.test(value)
    && !/^[-*]\s+/.test(value)) {
    return false;
  }
  if (!/[\p{L}\p{N}]/u.test(value)) {
    return false;
  }
  if (/^\{.*"tool(Action|Summary|Name)"/.test(value)) {
    return false;
  }
  if (/^"?\$?[0-9a-f]{8,}-[0-9a-f-]{20,}$/i.test(value)) {
    return false;
  }
  if (/^[A-Z][A-Z0-9_ -]{2,80}[.!?]?$/.test(value)) {
    return true;
  }
  if (/^[A-Za-z0-9_./+=:-]{8,}$/.test(value) && !/\s/.test(value) && !/[#*`.,!?，。！？]/.test(value)) {
    return false;
  }
  const usefulChars = Array.from(value).filter((ch) => /[\p{L}\p{N}\p{P}\p{S}\p{Zs}\n\t]/u.test(ch)).length;
  return usefulChars / Array.from(value).length > 0.72;
}

function isLikelyAssistantStart(text) {
  const value = (text || '').trim();
  if (/^```/.test(value)) {
    return true;
  }
  if (isShortTokenAnswer(value)) {
    return true;
  }
  if (/^[#*>-]\s/.test(value)) {
    return true;
  }
  if (/[\u4e00-\u9fff]/.test(value) && /[\s，。！？、；：]/.test(value)) {
    return true;
  }
  const wordCount = (value.match(/[A-Za-z]{2,}/g) || []).length;
  return /\s/.test(value) && (wordCount >= 3 || /[.!?:;]/.test(value));
}

function isShortTokenAnswer(text) {
  const value = (text || '').trim();
  return /^(OK|Yes|No)$/i.test(value) || /^[A-Z][A-Z0-9_ -]{2,80}[.!?]?$/.test(value);
}

function normalizeExtractedString(item) {
  return item
    .replace(AGY_BOT_BOUNDARY_SUFFIX_PATTERN, '')
    .trim();
}

function isLikelyBinaryTailLine(line) {
  const value = (line || '').trim();
  if (!value) {
    return true;
  }
  if (/^```/.test(value) || isShortTokenAnswer(value)) {
    return false;
  }
  if ((value.match(/\uFFFD/g) || []).length > 0) {
    return true;
  }
  if (value.length <= 6 && /[^\x00-\x7F\u4e00-\u9fff]/.test(value)) {
    return true;
  }
  if (value.length <= 6 && /[\u4e00-\u9fff]/.test(value) && /[=<>_`~]/.test(value)) {
    return true;
  }
  return value.length <= 4
    && !/[\u4e00-\u9fff]/.test(value)
    && !/^[-*]\s+/.test(value)
    && !/^\d+\.\s+/.test(value);
}

function trimTrailingBinaryFragments(text) {
  const lines = text.split('\n');
  while (lines.length > 0 && isLikelyBinaryTailLine(lines[lines.length - 1])) {
    lines.pop();
  }
  if (lines.length === 0) {
    return '';
  }
  const lastIndex = lines.length - 1;
  lines[lastIndex] = lines[lastIndex]
    .replace(/([\u4e00-\u9fff，。！？、；：）】》」』])(?:[`A-Z])$/, '$1')
    .replace(/([^`])`$/, '$1');
  return lines.join('\n').trim();
}

function collapseRepeatedBlocks(text) {
  const lines = text.split('\n');
  if (lines.length < 2 || lines.length % 2 !== 0) {
    return text;
  }
  const half = lines.length / 2;
  const first = lines.slice(0, half).join('\n');
  const second = lines.slice(half).join('\n');
  return first === second ? first : text;
}

function cleanCandidateText(text) {
  return trimTrailingBinaryFragments(collapseRepeatedBlocks(text.trim()));
}

function appendCandidatePart(currentParts, rawPart) {
  const item = normalizeExtractedString(rawPart);
  if (!item || !isLikelyAssistantText(item)) {
    return currentParts;
  }
  if (currentParts.length === 0 && !isLikelyAssistantStart(item)) {
    return currentParts;
  }
  currentParts.push(item);
  return currentParts;
}

function flushCandidate(candidates, currentParts) {
  if (currentParts.length === 0) {
    return;
  }
  const candidate = cleanCandidateText(currentParts.join('\n'));
  if (candidate) {
    candidates.push(candidate);
  }
}

function selectAgyAssistantCandidate(candidates) {
  if (candidates.length === 0) {
    return '';
  }
  const userFacing = candidates.filter((candidate) => isLikelyAssistantStart(candidate));
  const pool = userFacing.length ? userFacing : candidates;
  if (pool.some(isShortTokenAnswer)) {
    return pool.find(isShortTokenAnswer);
  }
  return pool[pool.length - 1];
}

export function extractAgyAssistantTextFromPayload(payload) {
  const strings = extractPrintableStrings(payload);
  const candidates = [];
  let currentParts = [];
  for (const rawItem of strings) {
    const boundaryIndex = rawItem.search(AGY_BOT_BOUNDARY_PATTERN);
    if (boundaryIndex >= 0) {
      const beforeBoundary = rawItem.slice(0, boundaryIndex);
      currentParts = appendCandidatePart(currentParts, beforeBoundary);
      flushCandidate(candidates, currentParts);
      currentParts = [];
      continue;
    }
    currentParts = appendCandidatePart(currentParts, rawItem);
  }
  flushCandidate(candidates, currentParts);
  return selectAgyAssistantCandidate(candidates);
}

export async function extractAgyAssistantTextFromDb(conversationId, options = {}) {
  if (!conversationId) {
    return '';
  }
  const dbPath = getConversationDbPath(conversationId, options);
  if (!existsSync(dbPath)) {
    return '';
  }
  const SQL = await initSqlJs();
  const db = new SQL.Database(readFileSync(dbPath));
  try {
    const result = db.exec(`
      SELECT step_payload
      FROM steps
      WHERE step_type = 15 AND status = 3
      ORDER BY idx DESC
      LIMIT 8
    `);
    if (!result.length || !result[0].values.length) {
      return '';
    }
    for (const row of result[0].values) {
      const text = extractAgyAssistantTextFromPayload(row[0]);
      if (text) {
        return text;
      }
    }
    return '';
  } finally {
    db.close();
  }
}

async function resolveAgyCliResult(payload, stdoutText, options) {
  const stdoutValue = sanitizeAgyCliStdout(stdoutText);
  const fallbackConversationId = payload.conversationId || readAgyLastConversationId(payload.cwd, options);
  if (stdoutValue) {
    return {
      threadId: fallbackConversationId || payload.conversationId || '',
      text: stdoutValue
    };
  }
  const dbText = await extractAgyAssistantTextFromDb(fallbackConversationId, options);
  return {
    threadId: fallbackConversationId || payload.conversationId || '',
    text: dbText
  };
}

function shouldSanitizeAgyCliStdout(stdoutText) {
  const value = stdoutText || '';
  if (!value.trim()) {
    return false;
  }
  const controlCount = Array.from(value).filter((ch) => {
    const code = ch.codePointAt(0);
    return code < 0x20 && ch !== '\n' && ch !== '\r' && ch !== '\t';
  }).length;
  return AGY_BOT_BOUNDARY_PATTERN.test(value)
    || value.includes('\uFFFD')
    || /^\s*(?:B!\s*)?sessionID\b/m.test(value)
    || controlCount > 0;
}

function sanitizeAgyCliStdout(stdoutText) {
  const value = stdoutText.trim();
  if (!value) {
    return '';
  }
  if (!shouldSanitizeAgyCliStdout(value)) {
    return value;
  }
  return extractAgyAssistantTextFromPayload(Buffer.from(value)) || value;
}

function emitAgyStreamStart(stdoutWrite) {
  stdoutWrite('[MESSAGE_START]\n');
  stdoutWrite('[STREAM_START]\n');
}

function emitAgyStreamEnd(stdoutWrite) {
  stdoutWrite('[STREAM_END]\n');
  stdoutWrite('[MESSAGE_END]\n');
}

function emitAgyResult(text, threadId, stdoutWrite) {
  if (threadId) {
    stdoutWrite(`[THREAD_ID] ${threadId}\n`);
  }
  stdoutWrite(`[CONTENT_DELTA] ${JSON.stringify(text)}\n`);
  emitAgyStreamEnd(stdoutWrite);
  stdoutWrite(`${JSON.stringify({
    success: true,
    threadId: threadId || null,
    result: text
  })}\n`);
}

export async function runAgyCliPrint(payload, options = {}) {
  const { command, args } = buildAgyCliInvocation(payload, options);
  const spawnImpl = options.spawnImpl || spawn;
  const stdoutWrite = options.stdoutWrite || ((chunk) => process.stdout.write(chunk));
  const runtimeEnv = options.env || process.env;
  let child;
  let streamStarted = false;
  let settled = false;
  const emitStreamEndIfNeeded = () => {
    if (streamStarted) {
      emitAgyStreamEnd(stdoutWrite);
      streamStarted = false;
    }
  };
  try {
    child = spawnImpl(command, args, {
      cwd: payload.cwd || process.cwd(),
      env: runtimeEnv,
      stdio: ['ignore', 'pipe', 'pipe']
    });
  } catch (error) {
    stdoutWrite(`[SEND_ERROR] ${JSON.stringify({
      success: false,
      error: `Failed to start local agy CLI: ${error.message}`
    })}\n`);
    return 1;
  }
  emitAgyStreamStart(stdoutWrite);
  streamStarted = true;

  let stdoutText = '';
  const stderrLines = [];
  child.stdout.on('data', (chunk) => {
    stdoutText += chunk.toString();
  });
  child.stderr.on('data', (chunk) => {
    const text = chunk.toString();
    stderrLines.push(text);
    forwardStderrChunk(chunk, stdoutWrite);
  });

  return new Promise((resolve) => {
    child.on('error', (error) => {
      if (settled) {
        return;
      }
      settled = true;
      emitStreamEndIfNeeded();
      stdoutWrite(`[SEND_ERROR] ${JSON.stringify({
        success: false,
        error: `Failed to start local agy CLI: ${error.message}`
      })}\n`);
      resolve(1);
    });
    child.on('close', async (code) => {
      if (settled) {
        return;
      }
      settled = true;
      if (code !== 0) {
        emitStreamEndIfNeeded();
        stdoutWrite(`[SEND_ERROR] ${JSON.stringify({
          success: false,
          error: stderrLines.join('').trim() || `Agy CLI exited with code ${code}`
        })}\n`);
        resolve(code);
        return;
      }
      const result = await resolveAgyCliResult(payload, stdoutText, options);
      if (!result.text) {
        stdoutWrite(`[SEND_ERROR] ${JSON.stringify({
          success: false,
          error: 'Agy CLI completed but no response was captured from stdout or the local conversation store.'
        })}\n`);
        resolve(1);
        return;
      }
      emitAgyResult(result.text, result.threadId, stdoutWrite);
      streamStarted = false;
      resolve(0);
    });
  });
}

export async function runAgyRunner(payload, options = {}) {
  const { command, args } = buildAgyRunnerInvocation(options);
  const spawnImpl = options.spawnImpl || spawn;
  const stdoutWrite = options.stdoutWrite || ((chunk) => process.stdout.write(chunk));
  const runtimeEnv = options.env || process.env;
  const effectiveApiKey = resolveAgyApiKey(payload, runtimeEnv);
  if (!effectiveApiKey) {
    stdoutWrite(`[SEND_ERROR] ${JSON.stringify({
      success: false,
      error: 'Agy Gemini API key is not configured. Configure Settings > Providers > Agy > Gemini API key, or set GEMINI_API_KEY / GOOGLE_API_KEY in the IDE environment.'
    })}\n`);
    return 1;
  }
  const runnerPayload = {
    ...payload,
    ...resolveAgyModelSelection(payload.model, payload.reasoningEffort),
    apiKey: effectiveApiKey
  };
  const child = spawnImpl(command, args, {
    cwd: payload.cwd || process.cwd(),
    env: {
      ...runtimeEnv,
      AGY_USE_STDIN: 'true',
      GEMINI_API_KEY: effectiveApiKey
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

  child.stdin.write(JSON.stringify(runnerPayload));
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
    agentPrompt: options.agentPrompt,
    reasoningEffort: options.reasoningEffort,
    authMode: options.authMode
  });
  if (shouldUseLocalCli(payload, options)) {
    return runAgyCliPrint(payload, options);
  }
  return runAgyRunner(payload, options);
}
