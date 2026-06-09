# Agy Python SDK Support Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add Antigravity (`agy`) as a first-class provider using the real `google-antigravity` Python SDK plus a local `agy` CLI authentication path, including provider switching, SDK dependency management, streaming, session resume, permission-mode switching, and auth-mode switching.

**Architecture:** Keep the existing Java -> Node bridge shape and add an `agy` provider channel. Java spawns `ai-bridge/channel-manager.js agy send`; Node chooses the Agy runtime from `authMode`. `auto` and `localCli` prefer the installed native `agy` CLI so it can reuse the user's local OAuth / Google AI Pro login from the CLI keyring. `apiKey` uses the managed Python venv runner; the runner uses `LocalAgentConfig`, maps SDK chunks to the existing line protocol, and reuses the existing file-based permission IPC.

**Tech Stack:** IntelliJ Platform Java 17, Node ESM bridge, Python 3.11+ managed venv, `google-antigravity` 0.1.2, React/Vite/TypeScript webview, JUnit 4, Node test runner, Vitest.

**Real SDK verification, 2026-06-08 / refreshed 2026-06-09:** `agy --version` returns `1.0.6`; `pip index versions google-antigravity` reports only `0.1.2` and marks it latest; `LocalAgentConfig()` from `google-antigravity==0.1.2` defaults `gemini_config.models.default.name` to `gemini-3.5-flash` and `gemini_config.models.image_generation.name` to `gemini-3.1-flash-image-preview`; `agy models` exits 0 with empty stdout on this machine, so the built-in chat model list is a UI mapping based on the requested Antigravity model menu and remains user-editable through custom models. The SDK exposes `ThinkingLevel` values `minimal`, `low`, `medium`, and `high`; a real SDK object check confirms `GenerationConfig(thinking_level="high")` is preserved inside `GeminiConfig(models.default.generation.thinking_level="high")`. The plugin exposes Agy model-menu entries with encoded thinking variants, maps them to real model IDs before calling SDK/CLI, and maps stale `xhigh`/`max` values to `high`. SDK installation is via the PyPI package `google-antigravity`, not by assuming the local `agy.exe` CLI contains the Python SDK. Conversation continuation is supported through `LocalAgentConfig(conversation_id=...)` and CLI `agy --conversation`, but full local history message import is not treated as supported until a stable public reader exists. Auth verification shows the SDK requires `LocalAgentConfig(api_key=...)` / `GeminiConfig(api_key=...)` or `GEMINI_API_KEY`; local `~/.gemini/config/config.json` and `~/.gemini/settings.json` are not sufficient when they do not contain a key. The plugin persists an optional Agy Gemini API key at `.codemoss/config.json` under `agy.geminiApiKey`, never echoes the secret to the webview, and injects it into both the runner stdin `apiKey` and process env `GEMINI_API_KEY` when `authMode=apiKey`. The Node bridge also maps `GOOGLE_API_KEY` to `GEMINI_API_KEY` for compatibility and emits a plugin-level `[SEND_ERROR]` before spawning Python when API-key mode has no key.

**Local CLI auth verification, 2026-06-09:** The installed native CLI is `C:\Users\Administrator\AppData\Local\agy\bin\agy.exe`, version `1.0.6`. It supports `--print`, `--print-timeout`, `--conversation`, `--continue`, `--model`, and `--dangerously-skip-permissions`; `agy.exe --help` and `agy.exe models --help` do not expose a thinking/depth flag, and `agy models` still exits 0 with empty stdout. Therefore High thinking is verifiably applied in SDK/API-key mode, while local CLI auth mode can only pass the resolved real model ID to the native CLI and cannot force or prove High through a public CLI flag. Real non-interactive testing showed the native CLI can silently reuse the local Antigravity login, but `agy --print-timeout 90s --print "Reply exactly OK"` exits `0` with empty redirected stdout/stderr on this machine. The CLI still creates a conversation DB under `~/.gemini/antigravity-cli/conversations` and updates `~/.gemini/antigravity-cli/cache/last_conversations.json`; the latest assistant response is recoverable from `steps.step_payload` blobs in that SQLite DB. Therefore local auth mode does not read or copy OAuth tokens directly. It delegates auth to `agy.exe` and, when stdout is empty, reads only the resulting local conversation store to recover assistant text.

**Agy auth modes, 2026-06-09:** The plugin stores non-secret `agy.authMode` in `.codemoss/config.json`. Valid values are `auto`, `localCli`, and `apiKey`; invalid or missing values normalize to `auto`. `auto` and `localCli` call the native CLI first and therefore can use the same local authorization as terminal `agy`. `apiKey` uses the Python SDK path and requires a configured Gemini API key or `GEMINI_API_KEY` / `GOOGLE_API_KEY`. Switching auth mode must not clear the saved API key.

**Permission-mode boundary, 2026-06-09:** In local CLI auth mode, `bypassPermissions` maps to native `agy --dangerously-skip-permissions`; other permission modes rely on the native CLI's default confirmation/sandbox behavior because `agy.exe --help` does not expose separate `plan` or `acceptEdits` flags. The Python SDK/API-key path remains the implementation that can enforce the plugin's detailed GUI permission policies for `plan`, `default`, `acceptEdits`, and `bypassPermissions`.

---

## Preconditions

- Branch is `agy-dev`.
- Worktree is clean except this plan/spec.
- Do not implement runtime code before writing the failing test for each task.
- Use `apply_patch` for manual code edits.
- Use the design document at `docs/superpowers/specs/2026-06-08-agy-cli-support-design.md` as the source of truth.

## Task 1: Add Provider Constants and Frontend Types

**Files:**
- Modify: `webview/src/components/ChatInputBox/types.ts`
- Modify: `webview/src/types/dependency.ts`
- Modify: `webview/src/utils/modelIconMapping.test.ts`
- Modify: `webview/src/utils/modelIconMapping.ts`

**Step 1: Write failing frontend tests**

Add assertions that:

```ts
expect(AVAILABLE_PROVIDERS.find(p => p.id === 'agy')?.enabled).toBe(true);
expect(SDK_DEFINITIONS.find(s => s.id === 'agy-sdk')?.relatedProviders).toContain('agy');
```

If `modelIconMapping` has provider/model coverage, add:

```ts
expect(getProviderIcon('agy')).toBeTruthy();
```

**Step 2: Run tests and verify failure**

Run:

```powershell
cd webview
npm test -- --run src/utils/modelIconMapping.test.ts
```

Expected: FAIL because `agy` and `agy-sdk` do not exist.

**Step 3: Implement minimal frontend constants**

Add:

```ts
export type SdkId = 'claude-sdk' | 'codex-sdk' | 'agy-sdk';
```

Add `agy-sdk` to `SDK_DEFINITIONS`:

```ts
{
  id: 'agy-sdk',
  name: 'Antigravity Python SDK',
  description: 'Agy AI 提供商所需。包含 google-antigravity Python SDK。',
  relatedProviders: ['agy'],
}
```

Add Agy provider:

```ts
{ id: 'agy', label: 'Agy', icon: 'codicon-terminal', enabled: true }
```

Add a model list that mirrors the requested Antigravity menu while keeping real model IDs separate from display IDs:

```ts
export const AGY_MODELS: ModelInfo[] = [
  { id: 'gemini-3.5-flash@medium', actualModelId: 'gemini-3.5-flash', reasoningEffort: 'medium', label: 'Gemini 3.5 Flash (Medium)' },
  { id: 'gemini-3.5-flash@high', actualModelId: 'gemini-3.5-flash', reasoningEffort: 'high', label: 'Gemini 3.5 Flash (High)' },
  { id: 'gemini-3.5-flash@low', actualModelId: 'gemini-3.5-flash', reasoningEffort: 'low', label: 'Gemini 3.5 Flash (Low)' },
  { id: 'gemini-3.1-pro@low', actualModelId: 'gemini-3.1-pro', reasoningEffort: 'low', label: 'Gemini 3.1 Pro (Low)' },
  { id: 'gemini-3.1-pro@high', actualModelId: 'gemini-3.1-pro', reasoningEffort: 'high', label: 'Gemini 3.1 Pro (High)' },
  { id: 'claude-sonnet-4-6@thinking', actualModelId: 'claude-sonnet-4-6', reasoningEffort: 'high', label: 'Claude Sonnet 4.6 (Thinking)' },
  { id: 'claude-opus-4-6@thinking', actualModelId: 'claude-opus-4-6', reasoningEffort: 'high', label: 'Claude Opus 4.6 (Thinking)' },
  { id: 'gpt-oss-120b@medium', actualModelId: 'gpt-oss-120b', reasoningEffort: 'medium', label: 'GPT-OSS 120B (Medium)' },
];
```

`actualModelId` is what the backend passes to SDK/CLI; the display `id` is only a stable UI selection key that also drives `reasoningEffort`. Keep the list user-editable through custom models because the SDK accepts arbitrary model strings via `LocalAgentConfig(model=...)`.

**Step 4: Run tests and verify pass**

Run:

```powershell
cd webview
npm test -- --run src/utils/modelIconMapping.test.ts
```

Expected: PASS.

**Step 5: Commit**

```powershell
git add webview/src/components/ChatInputBox/types.ts webview/src/types/dependency.ts webview/src/utils/modelIconMapping.ts webview/src/utils/modelIconMapping.test.ts
git commit -m "feat: add agy provider metadata"
```

## Task 2: Persist Agy Provider State

**Files:**
- Modify: `webview/src/hooks/useModelProviderState.ts`
- Modify: `webview/src/hooks/providers/useModelStatePersistence.ts`
- Create or modify tests near: `webview/src/hooks/useModelProviderState*.test.ts` and `webview/src/hooks/providers/useModelStatePersistence*.test.ts`

**Step 1: Write failing persistence tests**

Cover:

```ts
localStorage.setItem('model-selection-state', JSON.stringify({
  provider: 'agy',
  agyModel: 'gemini-3.5-flash',
  agyPermissionMode: 'plan',
}));
```

Expected behavior:

- `setCurrentProvider('agy')` is called.
- `setPermissionMode('plan')` is called.
- backend sync sends `set_provider: agy`, `set_model: gemini-3.5-flash`, and `set_mode: plan`.

**Step 2: Run tests and verify failure**

Run:

```powershell
cd webview
npm test -- --run src/hooks
```

Expected: FAIL because restore allowlist only accepts Claude/Codex and no agy model state exists.

**Step 3: Implement state**

Add:

- `selectedAgyModel`
- `agyPermissionMode`
- setters returned from `useModelProviderState`
- persistence keys `agyModel` and `agyPermissionMode`
- restore provider allowlist `['claude', 'codex', 'agy']`

Update selected model logic:

```ts
const selectedModel =
  currentProvider === 'codex' ? selectedCodexModel :
  currentProvider === 'agy' ? selectedAgyModel :
  selectedClaudeModel;
```

Update provider switch mode/model selection similarly.

**Step 4: Run tests and verify pass**

Run:

```powershell
cd webview
npm test -- --run src/hooks
```

Expected: PASS.

**Step 5: Commit**

```powershell
git add webview/src/hooks/useModelProviderState.ts webview/src/hooks/providers/useModelStatePersistence.ts webview/src/hooks/*agy* webview/src/hooks/providers/*agy*
git commit -m "feat: persist agy provider state"
```

## Task 3: Fix SDK Install Gating and Slash Commands for Agy

**Files:**
- Modify: `webview/src/components/settings/DependencySection/index.tsx`
- Modify: `webview/src/components/settings/DependencySection/index.test.tsx`
- Modify: `webview/src/hooks/providers/useUsageTracking.ts`
- Modify: `webview/src/hooks/useMessageSender.ts`
- Modify: `webview/src/hooks/useMessageSender.context.test.ts`

**Step 1: Write failing tests**

Add cases:

```ts
expect(isSdkInstalled('agy')).toBe(true); // when sdkStatus['agy-sdk'].status = 'installed'
```

For `/plan`:

```ts
currentProvider = 'agy';
checkLocalCommand('/plan');
expect(handleModeSelect).toHaveBeenCalledWith('plan');
```

For missing SDK warning:

```ts
currentProvider = 'agy';
currentSdkInstalled = false;
expect(addToast).toHaveBeenCalledWith(expect.stringContaining('Agy'), 'warning');
```

For dependency UI installation:

```ts
expect(screen.getByText('Antigravity Python SDK')).toBeTruthy();
expect(screen.getByText('Agy AI 提供商所需。包含 google-antigravity Python SDK。')).toBeTruthy();
fireEvent.click(screen.getByRole('button', { name: '安装 v0.1.2' }));
expect(window.sendToJava).toHaveBeenCalledWith(
  'install_dependency:{"id":"agy-sdk","version":"0.1.2"}',
);
```

**Step 2: Run tests and verify failure**

Run:

```powershell
cd webview
npm test -- --run src/hooks/useMessageSender.context.test.ts
```

Expected: FAIL because unknown providers map to Claude and `/plan` is Claude-only.

**Step 3: Implement**

Update map:

```ts
const PROVIDER_TO_SDK: Record<string, string> = {
  claude: 'claude-sdk',
  anthropic: 'claude-sdk',
  bedrock: 'claude-sdk',
  codex: 'codex-sdk',
  openai: 'codex-sdk',
  agy: 'agy-sdk',
};
```

Unknown providers should return false instead of defaulting to Claude:

```ts
const sdkId = PROVIDER_TO_SDK[providerId];
if (!sdkId) return false;
```

Allow `/plan` for Claude and Agy:

```ts
if (PLAN_COMMANDS.has(command) && (currentProvider === 'claude' || currentProvider === 'agy')) {
  handleModeSelect?.('plan');
  return true;
}
```

Use provider display name helper:

```ts
const providerName = currentProvider === 'codex' ? 'Codex' :
  currentProvider === 'agy' ? 'Agy' : 'Claude Code';
```

Render the Agy install entry in `DependencySection`:

```ts
{
  id: 'agy-sdk' as SdkId,
  nameKey: 'settings.dependency.agySdkName',
  description: 'settings.dependency.agySdkDescription',
  relatedProviders: ['agy'],
}
```

Add matching i18n keys in all locale files so the visible install route is `Settings -> Dependencies -> Antigravity Python SDK -> Install`. The backend install payload remains `install_dependency:{"id":"agy-sdk","version":"0.1.2"}` and Java installs pip package `google-antigravity` into `~/.codemoss/dependencies/agy-sdk/.venv`.

**Step 4: Run tests and verify pass**

Run:

```powershell
cd webview
npm test -- --run src/hooks/useMessageSender.context.test.ts
```

Expected: PASS.

**Step 5: Commit**

```powershell
git add webview/src/hooks/providers/useUsageTracking.ts webview/src/hooks/useMessageSender.ts webview/src/hooks/useMessageSender.context.test.ts
git commit -m "feat: gate agy on agy sdk"
```

## Task 4: Add Agy Settings Tab and Custom Model Storage

**Files:**
- Modify: `webview/src/components/settings/ProviderTabSection/index.tsx`
- Modify: `webview/src/components/settings/ProviderTabSection/style.module.less`
- Modify: `webview/src/types/provider.ts`
- Add or modify tests near: `webview/src/components/settings/ProviderTabSection`

**Step 1: Write failing UI tests**

Assert settings can render a third tab:

```tsx
render(<ProviderTabSection currentProvider="agy" ... />);
expect(screen.getByRole('tab', { name: /agy/i })).toBeInTheDocument();
```

Assert Agy custom model management uses an Agy storage key.

**Step 2: Run tests and verify failure**

Run:

```powershell
cd webview
npm test -- --run src/components/settings
```

Expected: FAIL because only Claude/Codex tabs exist.

**Step 3: Implement minimal Agy tab**

Add `AGY_CUSTOM_MODELS` storage key and a tab that exposes custom model management. If no credential provider UI is required for MVP, display only SDK/model controls and no account cards.

**Step 4: Run tests and verify pass**

Run:

```powershell
cd webview
npm test -- --run src/components/settings
```

Expected: PASS.

**Step 5: Commit**

```powershell
git add webview/src/components/settings/ProviderTabSection webview/src/types/provider.ts
git commit -m "feat: add agy provider settings"
```

## Task 5: Add Python Dependency Runtime

**Files:**
- Modify: `src/main/java/com/github/claudecodegui/dependency/SdkDefinition.java`
- Modify: `src/main/java/com/github/claudecodegui/dependency/DependencyManager.java`
- Create: `src/main/java/com/github/claudecodegui/dependency/PythonDependencyManager.java`
- Create: `src/main/java/com/github/claudecodegui/dependency/PythonDetector.java`
- Modify: `src/main/java/com/github/claudecodegui/handler/DependencyHandler.java`
- Test: `src/test/java/com/github/claudecodegui/dependency/PythonDependencyManagerTest.java`
- Test: `src/test/java/com/github/claudecodegui/dependency/DependencyManagerAgySdkTest.java`

**Step 1: Write failing Java tests**

Add tests:

```java
assertEquals(SdkDefinition.AGY_SDK, SdkDefinition.fromProvider("agy"));
assertEquals("agy-sdk", SdkDefinition.fromId("agy-sdk").getId());
assertEquals("google-antigravity", SdkDefinition.AGY_SDK.getPackageName());
```

For Python detection, inject fake executable command behavior or isolate path resolution:

```java
assertTrue(PythonDetector.getCandidateCommands().contains("py"));
assertTrue(PythonDetector.getCandidateCommands().contains("python"));
```

For install path:

```java
assertTrue(manager.getAgyVenvDir().toString().contains("agy-sdk"));
```

**Step 2: Run tests and verify failure**

Run:

```powershell
.\gradlew.bat test --tests "*DependencyManagerAgySdkTest" --tests "*PythonDependencyManagerTest" -PskipWebview=true
```

Expected: FAIL because no Python runtime exists.

**Step 3: Implement runtime metadata**

Add runtime type:

```java
public enum RuntimeType { NPM, PIP }
```

Add `AGY_SDK`:

```java
AGY_SDK(
    "agy-sdk",
    "Antigravity Python SDK",
    "google-antigravity",
    "latest",
    RuntimeType.PIP,
    Collections.emptyList(),
    Arrays.asList("0.1.2"),
    "Agy AI 提供商所需，包含 google-antigravity Python SDK。"
)
```

If changing the existing enum constructor is too broad, add overloads while preserving existing NPM callers.

**Step 4: Implement PythonDependencyManager**

Behavior:

- root: `~/.codemoss/dependencies/agy-sdk`
- venv: `~/.codemoss/dependencies/agy-sdk/.venv`
- marker: `.installed`
- version check: run `.venv/Scripts/python.exe -m pip show google-antigravity`
- install: create venv, upgrade pip, install package
- uninstall: remove `agy-sdk` directory after path safety check

Use native PowerShell path-safe deletion rules through Java `Files.walk`, not shell deletion.

**Step 5: Delegate from DependencyManager**

For `RuntimeType.PIP`:

- `isInstalled`
- `getInstalledVersion`
- `getLatestVersion`
- `getAvailableVersions`
- `installSdkSync`
- `uninstallSdk`
- `checkForUpdates`

For version list, if PyPI querying is not implemented in MVP, return fallback `0.1.2` and source `fallback`.

**Step 6: Update DependencyHandler**

Do not require Node.js before installing `agy-sdk`.

Pseudo-branch:

```java
if (sdk.getRuntimeType() == RuntimeType.NPM && !dependencyManager.checkNodeEnvironment()) {
    // existing node error
}
```

**Step 7: Run tests and verify pass**

Run:

```powershell
.\gradlew.bat test --tests "*DependencyManagerAgySdkTest" --tests "*PythonDependencyManagerTest" -PskipWebview=true
```

Expected: PASS.

**Step 8: Commit**

```powershell
git add src/main/java/com/github/claudecodegui/dependency src/main/java/com/github/claudecodegui/handler/DependencyHandler.java src/test/java/com/github/claudecodegui/dependency
git commit -m "feat: add python dependency runtime for agy"
```

## Task 6: Add Python Runner Permission Policy

**Files:**
- Create: `ai-bridge/services/agy/permission_policy.py`
- Create: `ai-bridge/services/agy/permission_ipc.py`
- Create: `ai-bridge/services/agy/permission_policy_test.py`

**Step 1: Write failing Python tests**

Use `unittest` and skip only if `google.antigravity` is unavailable:

```python
import unittest
from permission_policy import build_config

class AgyPermissionPolicyTest(unittest.TestCase):
    def test_plan_uses_read_only_tools(self):
        cfg = build_config("plan", cwd="C:\\work", conversation_id=None, model="")
        self.assertEqual([t.value for t in cfg.capabilities.enabled_tools],
                         ["list_directory", "search_directory", "find_file", "view_file", "finish"])
        self.assertEqual(cfg.workspaces, ["C:\\work"])

    def test_bypass_is_unrestricted(self):
        cfg = build_config("bypassPermissions", cwd="C:\\work", conversation_id=None, model="")
        self.assertEqual(cfg.workspaces, [])
```

**Step 2: Run test and verify failure**

Run in the temporary SDK venv or the future managed venv:

```powershell
$py = "$env:TEMP\agy-sdk-real-verify\Scripts\python.exe"
& $py -m unittest ai-bridge/services/agy/permission_policy_test.py
```

Expected: FAIL because files do not exist.

**Step 3: Implement permission_policy.py**

Core shape:

```python
from google.antigravity import LocalAgentConfig, CapabilitiesConfig
from google.antigravity.types import BuiltinTools
from google.antigravity.hooks import policy

def normalize_mode(mode: str | None) -> str:
    value = (mode or "default").strip()
    if value in ("autoEdit", "acceptEdits"):
        return "acceptEdits"
    if value in ("bypassPermissions", "yolo"):
        return "bypassPermissions"
    if value == "plan":
        return "plan"
    return "default"

def build_config(mode, cwd, conversation_id, model, save_dir=None, api_key=None, gui_handler=None):
    normalized = normalize_mode(mode)
    kwargs = {
        "conversation_id": conversation_id or None,
        "model": model or None,
        "save_dir": save_dir,
    }
    if api_key:
        kwargs["api_key"] = api_key
    if normalized == "plan":
        return LocalAgentConfig(
            workspaces=[cwd],
            capabilities=CapabilitiesConfig(
                enabled_tools=BuiltinTools.read_only(),
                enable_subagents=False,
            ),
            policies=[policy.allow_all()],
            **{k: v for k, v in kwargs.items() if v is not None},
        )
    if normalized == "bypassPermissions":
        return LocalAgentConfig(
            workspaces=[],
            policies=[policy.allow_all()],
            **{k: v for k, v in kwargs.items() if v is not None},
        )
    handler = gui_handler or (lambda tool_call: False)
    policies = policy.safe_defaults(handler)
    if normalized == "acceptEdits":
        policies = [
            *policies,
            policy.allow(BuiltinTools.CREATE_FILE.value, name="accept_edits"),
            policy.allow(BuiltinTools.EDIT_FILE.value, name="accept_edits"),
        ]
    return LocalAgentConfig(
        workspaces=[cwd],
        policies=policies,
        **{k: v for k, v in kwargs.items() if v is not None},
    )
```

**Step 4: Implement permission_ipc.py**

Mirror `ai-bridge/permission-ipc.js`:

- read env `CLAUDE_PERMISSION_DIR`
- read env `CLAUDE_SESSION_ID`
- write JSON request
- poll response until safety net
- return true only when response JSON has boolean `allow: true`

**Step 5: Run test and verify pass**

Run:

```powershell
$py = "$env:TEMP\agy-sdk-real-verify\Scripts\python.exe"
& $py -m unittest ai-bridge/services/agy/permission_policy_test.py
```

Expected: PASS.

**Step 6: Commit**

```powershell
git add ai-bridge/services/agy/permission_policy.py ai-bridge/services/agy/permission_ipc.py ai-bridge/services/agy/permission_policy_test.py
git commit -m "feat: add agy permission policy builder"
```

## Task 7: Add Python SDK Runner

**Files:**
- Create: `ai-bridge/services/agy/agy_sdk_runner.py`
- Create: `ai-bridge/services/agy/agy_sdk_runner_test.py`

**Step 1: Write failing runner unit tests**

Use fake chunk classes so the test does not require network auth:

```python
class FakeText:
    text = "hello"

def test_emit_text_chunk(self):
    lines = []
    emit_chunk(FakeText(), lines.append)
    self.assertEqual(lines, ['[CONTENT_DELTA] "hello"'])
```

Cover:

- Text chunk emission
- Thought chunk emission
- ToolCall JSON emission
- ToolResult JSON emission
- error payload emission

**Step 2: Run tests and verify failure**

Run:

```powershell
$py = "$env:TEMP\agy-sdk-real-verify\Scripts\python.exe"
& $py -m unittest ai-bridge/services/agy/agy_sdk_runner_test.py
```

Expected: FAIL because runner does not exist.

**Step 3: Implement runner helpers**

Implement pure helpers first:

```python
def emit_json_marker(marker: str, payload: Any) -> None:
    print(f"{marker} {json.dumps(payload, ensure_ascii=False)}", flush=True)
```

Chunk mapping:

```python
if isinstance(chunk, Text):
    emit_json_marker("[CONTENT_DELTA]", chunk.text)
elif isinstance(chunk, Thought):
    emit_json_marker("[THINKING_DELTA]", chunk.text)
elif isinstance(chunk, ToolCall):
    print("[MESSAGE] " + json.dumps({...}), flush=True)
elif isinstance(chunk, ToolResult):
    print("[MESSAGE] " + json.dumps({...}), flush=True)
```

**Step 4: Implement main async flow**

Runtime flow:

```python
async def run(payload):
    config = build_config(...)
    print("[MESSAGE_START]", flush=True)
    async with Agent(config) as agent:
        response = await agent.chat(build_content(payload))
        print("[STREAM_START]", flush=True)
        print(f"[THREAD_ID] {agent.conversation.conversation_id}", flush=True)
        async for chunk in response.chunks:
            emit_chunk(chunk)
        usage = response.usage_metadata
        if usage:
            emit_usage(usage)
    print("[STREAM_END]", flush=True)
    print("[MESSAGE_END]", flush=True)
```

Guard all exceptions:

```python
except Exception as exc:
    print("[SEND_ERROR] " + json.dumps({"success": False, "error": str(exc)}), flush=True)
    return 1
```

**Step 5: Run tests and verify pass**

Run:

```powershell
$py = "$env:TEMP\agy-sdk-real-verify\Scripts\python.exe"
& $py -m unittest ai-bridge/services/agy/agy_sdk_runner_test.py
```

Expected: PASS.

**Step 6: Commit**

```powershell
git add ai-bridge/services/agy/agy_sdk_runner.py ai-bridge/services/agy/agy_sdk_runner_test.py
git commit -m "feat: add agy sdk runner"
```

## Task 8: Add Node Agy Channel and Message Service

**Files:**
- Create: `ai-bridge/channels/agy-channel.js`
- Create: `ai-bridge/services/agy/message-service.js`
- Create: `ai-bridge/services/agy/message-service.test.mjs`
- Modify: `ai-bridge/channel-manager.js`
- Modify: `ai-bridge/utils/stdin-utils.js`

**Step 1: Write failing Node tests**

Test dispatch:

```js
import { getAgyCommandList } from './agy-channel.js';
assert.deepEqual(getAgyCommandList(), ['send']);
```

Test spawn command assembly with injected fake runner:

```js
assert(command.includes('agy_sdk_runner.py'));
assert.equal(stdinPayload.permissionMode, 'default');
```

**Step 2: Run tests and verify failure**

Run:

```powershell
cd ai-bridge
node --test services/agy/message-service.test.mjs
```

Expected: FAIL because files do not exist.

**Step 3: Implement channel**

Mirror Codex:

```js
export async function handleAgyCommand(command, args, stdinData) {
  switch (command) {
    case 'send':
      await agySendMessage(...);
      break;
    default:
      throw new Error(`Unknown Agy command: ${command}`);
  }
}
```

**Step 4: Implement message service**

Responsibilities:

- locate Python executable from stdin/env, falling back to managed venv path from Java
- spawn `agy_sdk_runner.py`
- write stdin JSON
- forward stdout lines exactly
- forward stderr as `[DEBUG]` or `[SEND_ERROR]` when process exits non-zero

Add `AGY_USE_STDIN` support in `stdin-utils.js`, or make provider stdin env generic.

**Step 5: Modify channel-manager**

Add:

```js
import { handleAgyCommand } from './channels/agy-channel.js';
```

Then:

```js
agy: handleAgyCommand
```

Update invalid provider message to include `agy`.

**Step 6: Run tests and verify pass**

Run:

```powershell
cd ai-bridge
node --test services/agy/message-service.test.mjs
node --test permission-ipc.test.js
```

Expected: PASS.

**Step 7: Commit**

```powershell
git add ai-bridge/channel-manager.js ai-bridge/utils/stdin-utils.js ai-bridge/channels/agy-channel.js ai-bridge/services/agy
git commit -m "feat: add agy node bridge channel"
```

## Task 9: Add Java AgySDKBridge

**Files:**
- Create: `src/main/java/com/github/claudecodegui/provider/agy/AgySDKBridge.java`
- Create: `src/test/java/com/github/claudecodegui/provider/agy/AgySDKBridgeTest.java`

**Step 1: Write failing Java tests**

Use test doubles where possible:

```java
assertEquals("agy", bridge.getProviderNameForTest());
```

Assert stdin contains:

- `message`
- `conversationId`
- `cwd`
- `permissionMode`
- `model`

Assert environment contains:

- `AGY_USE_STDIN=true`
- `CLAUDE_PERMISSION_DIR`
- `CLAUDE_SESSION_ID`
- managed Python path

**Step 2: Run tests and verify failure**

Run:

```powershell
.\gradlew.bat test --tests "*AgySDKBridgeTest" -PskipWebview=true
```

Expected: FAIL because bridge does not exist.

**Step 3: Implement bridge**

Extend `BaseSDKBridge`.

Key methods:

```java
protected String getProviderName() { return "agy"; }
protected void configureProviderEnv(Map<String, String> env, String stdinJson) {
    env.put("AGY_USE_STDIN", "true");
    env.put("AGY_PYTHON", pythonDependencyManager.getPythonExecutable().toString());
}
```

Add `sendMessage(...)` with Agy parameters and call:

```java
List<String> command = buildBaseCommand("send");
return executeStreamingCommand(channelId, command, stdinJson, cwd, callback);
```

Process output line handling can start from Codex logic because Agy emits the same markers.

**Step 4: Run tests and verify pass**

Run:

```powershell
.\gradlew.bat test --tests "*AgySDKBridgeTest" -PskipWebview=true
```

Expected: PASS.

**Step 5: Commit**

```powershell
git add src/main/java/com/github/claudecodegui/provider/agy src/test/java/com/github/claudecodegui/provider/agy
git commit -m "feat: add agy sdk bridge"
```

## Task 10: Route Agy in Java Session Layer

**Files:**
- Modify: `src/main/java/com/github/claudecodegui/handler/core/HandlerContext.java`
- Modify: `src/main/java/com/github/claudecodegui/ui/toolwindow/ClaudeChatWindow.java`
- Modify: `src/main/java/com/github/claudecodegui/session/SessionSendService.java`
- Modify: `src/main/java/com/github/claudecodegui/session/SessionProviderRouter.java`
- Modify: delegate host interfaces touched by `ClaudeChatWindow`
- Test: `src/test/java/com/github/claudecodegui/session/SessionSendServiceTest.java`
- Test: `src/test/java/com/github/claudecodegui/session/SessionProviderRouterTest.java`

**Step 1: Write failing routing tests**

Add a test ensuring `agy` does not route to Claude:

```java
CompletableFuture<Void> result = service.sendMessageToProvider(... provider "agy" ...);
verify(agyBridge).sendMessage(...);
verifyNoInteractions(claudeBridge);
verifyNoInteractions(codexBridge);
```

Add router tests:

```java
router.interruptChannel("agy", "channel-1");
verify(agyBridge).interruptChannel("channel-1");
```

**Step 2: Run tests and verify failure**

Run:

```powershell
.\gradlew.bat test --tests "*SessionSendServiceTest" --tests "*SessionProviderRouterTest" -PskipWebview=true
```

Expected: FAIL because no Agy route exists.

**Step 3: Implement explicit provider routing**

Change all provider branches to explicit three-way routing:

```java
if ("codex".equals(provider)) { ... }
if ("agy".equals(provider)) { ... }
return claude...
```

In `resolveEffectivePermissionMode`, do not map `agy` `plan` to `default`. Only Codex keeps that behavior.

Instantiate and clean up `AgySDKBridge` in `ClaudeChatWindow`.

**Step 4: Run tests and verify pass**

Run:

```powershell
.\gradlew.bat test --tests "*SessionSendServiceTest" --tests "*SessionProviderRouterTest" -PskipWebview=true
```

Expected: PASS.

**Step 5: Commit**

```powershell
git add src/main/java/com/github/claudecodegui/handler/core/HandlerContext.java src/main/java/com/github/claudecodegui/ui/toolwindow/ClaudeChatWindow.java src/main/java/com/github/claudecodegui/session src/test/java/com/github/claudecodegui/session
git commit -m "feat: route agy provider in sessions"
```

## Task 11: Add Agy Message Handler and Session ID Handling

**Files:**
- Create: `src/main/java/com/github/claudecodegui/session/AgyMessageHandler.java`
- Modify: `src/main/java/com/github/claudecodegui/session/SessionCallbackAdapter.java` only if needed
- Test: `src/test/java/com/github/claudecodegui/session/AgyMessageHandlerTest.java`

**Step 1: Write failing tests**

Feed marker lines:

```text
[THREAD_ID] abc-123
[CONTENT_DELTA] "hello"
[THINKING_DELTA] "thought"
[MESSAGE] {"type":"tool_use","name":"run_command"}
```

Assert callback receives:

- session id `abc-123`
- content delta `hello`
- thinking delta
- tool message

**Step 2: Run tests and verify failure**

Run:

```powershell
.\gradlew.bat test --tests "*AgyMessageHandlerTest" -PskipWebview=true
```

Expected: FAIL because handler does not exist.

**Step 3: Implement handler**

Use `CodexMessageHandler` as reference, but name provider-specific logs `Agy`.

Keep final response accumulation consistent with Codex.

**Step 4: Run tests and verify pass**

Run:

```powershell
.\gradlew.bat test --tests "*AgyMessageHandlerTest" -PskipWebview=true
```

Expected: PASS.

**Step 5: Commit**

```powershell
git add src/main/java/com/github/claudecodegui/session/AgyMessageHandler.java src/test/java/com/github/claudecodegui/session/AgyMessageHandlerTest.java
git commit -m "feat: parse agy stream messages"
```

## Task 12: Add Agy Permission Mapper Coverage

**Files:**
- Modify: `ai-bridge/utils/permission-mapper.js`
- Create: `ai-bridge/utils/agy-permission-mapper.test.mjs`

**Step 1: Write failing mapper tests**

Assert:

```js
assert.equal(AgyPermissionMapper.toProvider('plan').mode, 'plan');
assert.equal(AgyPermissionMapper.toProvider('default').mode, 'default');
assert.equal(AgyPermissionMapper.toProvider('acceptEdits').mode, 'acceptEdits');
assert.equal(AgyPermissionMapper.toProvider('bypassPermissions').mode, 'bypassPermissions');
```

**Step 2: Run tests and verify failure**

Run:

```powershell
cd ai-bridge
node --test utils/agy-permission-mapper.test.mjs
```

Expected: FAIL because mapper does not exist.

**Step 3: Implement mapper**

Add `AgyPermissionMapper` that normalizes aliases only. The actual SDK policy is created in Python.

Register provider factory:

```js
case 'agy':
  return AgyPermissionMapper;
```

**Step 4: Run tests and verify pass**

Run:

```powershell
cd ai-bridge
node --test utils/agy-permission-mapper.test.mjs
```

Expected: PASS.

**Step 5: Commit**

```powershell
git add ai-bridge/utils/permission-mapper.js ai-bridge/utils/agy-permission-mapper.test.mjs
git commit -m "feat: add agy permission mapper"
```

## Task 13: Wire Packaging and SDK Status

**Files:**
- Modify: `build.gradle`
- Modify: `ai-bridge/utils/sdk-loader.js` if system status still depends on Node SDK packages
- Modify: `src/main/java/com/github/claudecodegui/service/NodeProcessRegistryHelpers.java` if provider labels need update
- Tests near existing dependency/status tests

**Step 1: Write failing packaging/status tests**

Assert `getAllSdkStatus()` returns `agy-sdk`.

If `sdk-loader.js` is used by system status:

```js
const status = getSdkStatus();
assert.ok(status.agy);
```

**Step 2: Run tests and verify failure**

Run:

```powershell
.\gradlew.bat test --tests "*DependencyManagerAgySdkTest" -PskipWebview=true
cd ai-bridge
node --test utils/sdk-loader*.test.mjs
```

Expected: FAIL where Agy status is missing.

**Step 3: Implement**

Ensure Python files under `ai-bridge/services/agy` are included in `ai-bridge.zip`.

Do not exclude Python files in packaging.

If `sdk-loader.js` cannot inspect Python venv directly, mark Agy as Java-managed and avoid false "not installed" from Node system status.

**Step 4: Run tests and verify pass**

Run:

```powershell
.\gradlew.bat test --tests "*DependencyManagerAgySdkTest" -PskipWebview=true
cd ai-bridge
node --test
```

Expected: PASS.

**Step 5: Commit**

```powershell
git add build.gradle ai-bridge/utils/sdk-loader.js src/main/java/com/github/claudecodegui/service src/test/java/com/github/claudecodegui
git commit -m "feat: include agy in dependency status"
```

## Task 14: End-to-End Validation Without Network Auth

**Files:**
- Create: `ai-bridge/services/agy/fake_agy_sdk_runner.mjs` only if useful for tests
- Add tests around Node/Java line handling

**Step 1: Add fake runner integration test**

Fake runner emits:

```text
[MESSAGE_START]
[STREAM_START]
[THREAD_ID] fake-conversation
[CONTENT_DELTA] "hello"
[STREAM_END]
[MESSAGE_END]
{"success":true,"threadId":"fake-conversation","result":"hello"}
```

Node test asserts the Java-facing stdout is forwarded unchanged.

**Step 2: Run test**

Run:

```powershell
cd ai-bridge
node --test services/agy/message-service.test.mjs
```

Expected: PASS.

**Step 3: Add Java process parser test**

Use existing bridge test patterns to feed the fake output into `AgySDKBridge.processOutputLine`.

Expected: Java callback receives stream start/end, session id, and content delta.

**Step 4: Run test**

Run:

```powershell
.\gradlew.bat test --tests "*AgySDKBridgeTest" -PskipWebview=true
```

Expected: PASS.

**Step 5: Commit**

```powershell
git add ai-bridge/services/agy src/test/java/com/github/claudecodegui/provider/agy
git commit -m "test: add agy bridge integration coverage"
```

## Task 15: Real SDK Smoke Test

**Files:**
- No product code unless test failures reveal defects.

**Step 1: Install managed SDK**

Run through UI or command line:

```powershell
.\gradlew.bat runIde -PskipWebview=false
```

Then use Settings -> Dependencies -> Antigravity Python SDK -> Install. This sends `install_dependency` for `agy-sdk`; Java creates `~/.codemoss/dependencies/agy-sdk/.venv` and installs pip package `google-antigravity`.

If testing from terminal:

```powershell
$venv = "$env:USERPROFILE\.codemoss\dependencies\agy-sdk\.venv"
python -m venv $venv
& "$venv\Scripts\python.exe" -m pip install --upgrade pip
& "$venv\Scripts\python.exe" -m pip install google-antigravity
```

**Step 2: Run runner import smoke test**

Run:

```powershell
& "$env:USERPROFILE\.codemoss\dependencies\agy-sdk\.venv\Scripts\python.exe" ai-bridge/services/agy/agy_sdk_runner.py --version
```

Expected: prints package/runtime info and exits 0. If no `--version` flag exists yet, add it before running.

**Step 3: Run authenticated smoke test**

Only run if Antigravity auth is available on the machine:

```powershell
$payload = '{"message":"List the files in the current directory.","cwd":"G:\\code\\vscode\\jetbrains-cc-gui","permissionMode":"plan","model":"","conversationId":"","apiKey":"<gemini-api-key>"}'
$payload | node ai-bridge/channel-manager.js agy send
```

Or configure the plugin key in Settings -> Providers -> Agy -> Gemini API key, which persists to `.codemoss/config.json` and is passed to the SDK as both stdin `apiKey` and `GEMINI_API_KEY`.

For environment-only testing:

```powershell
$env:GEMINI_API_KEY = "<gemini-api-key>"
$payload = '{"message":"List the files in the current directory.","cwd":"G:\\code\\vscode\\jetbrains-cc-gui","permissionMode":"plan","model":"","conversationId":""}'
$payload | node ai-bridge/channel-manager.js agy send
```

Expected:

- `[MESSAGE_START]`
- `[STREAM_START]`
- `[THREAD_ID]`
- one or more content/thinking/tool markers
- `[STREAM_END]`
- `[MESSAGE_END]`

**Step 4: Manual permission smoke**

In IDE:

1. Select provider `Agy`.
2. Mode `default`.
3. Ask it to create a small file in the workspace.
4. Verify GUI permission prompt appears.
5. Deny; verify no file is created and stream ends gracefully.
6. Switch `acceptEdits`; repeat and verify workspace edit proceeds without prompt.
7. Ask it to run a shell command; verify command still asks.
8. Switch `bypassPermissions`; verify no prompt.

**Step 5: Commit fixes only if needed**

```powershell
git add <fixed files>
git commit -m "fix: stabilize agy sdk smoke test"
```

## Task 16: Full Regression

**Files:**
- No code changes unless failures are found.

**Step 1: Run Java tests**

Run:

```powershell
.\gradlew.bat test -PskipWebview=true
```

Expected: PASS.

**Step 2: Run Node tests**

Run:

```powershell
cd ai-bridge
node --test
```

Expected: PASS.

**Step 3: Run webview tests**

Run:

```powershell
cd webview
npm test
```

Expected: PASS.

**Step 4: Build plugin**

Run:

```powershell
.\gradlew.bat buildPlugin -PskipWebview=false
```

Expected: PASS and `build/distributions/*.zip` produced.

**Step 5: Final commit**

If there are remaining unstaged implementation changes:

```powershell
git status --short
git add <remaining files>
git commit -m "feat: support agy provider"
```

## Rollback Plan

If the Python SDK integration is unstable:

1. Keep frontend provider hidden by setting `agy.enabled = false`.
2. Keep dependency manager support for `agy-sdk`, because it is isolated.
3. Remove `agy` from provider routing maps or guard it behind a feature flag.
4. Do not change Claude/Codex code paths except for provider-fallback safety fixes.

## Definition of Done

- `agy` appears as an enabled provider.
- Agy settings expose `auto`, `localCli`, and `apiKey` auth modes; `auto` defaults to local CLI auth when native `agy` is available.
- Missing `agy-sdk` blocks sending and opens Dependencies settings.
- Dependencies settings visibly lists `Antigravity Python SDK` and its install action sends `install_dependency` with id `agy-sdk`.
- Installing `agy-sdk` creates a managed venv under `~/.codemoss/dependencies/agy-sdk/.venv`.
- Agy built-in chat models include the requested Antigravity menu entries and resolve to real model IDs before reaching SDK/CLI.
- Agy High thinking is verified for SDK/API-key mode through `GenerationConfig(thinking_level="high")`; local CLI auth mode documents that no public thinking flag exists in `agy.exe 1.0.6`.
- `agy` messages route to `AgySDKBridge`, not Claude.
- Python runner imports `google.antigravity` from the managed venv.
- Local CLI mode delegates auth to native `agy.exe` and can recover an answer from the local Antigravity conversation store when `--print` stdout is empty.
- Streaming text, thinking, tool calls, and session id reach the webview.
- `plan`, `default`, `acceptEdits`, and `bypassPermissions` map to the verified SDK policies.
- Permission prompts use the existing GUI.
- Interrupt stops the active Python process.
- Java, Node, and webview tests pass.
