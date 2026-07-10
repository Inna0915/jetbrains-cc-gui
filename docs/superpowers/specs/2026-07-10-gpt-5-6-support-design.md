# GPT-5.6 Codex Support Design

## Goal

Add the three official GPT-5.6 Codex models and their descriptions to CCGUI, expose the new `max` reasoning effort only where supported, preserve that value through the Codex bridge, and package the plugin as version `0.4.7-cyzn`.

## Sources

- OpenAI Codex models: <https://developers.openai.com/codex/models>
- OpenAI GPT-5.6 guide: <https://developers.openai.com/api/docs/guides/latest-model>

The official Codex catalog lists `gpt-5.6-sol`, `gpt-5.6-terra`, and `gpt-5.6-luna`. The GPT-5.6 guide documents `max` reasoning effort in addition to the existing lower effort levels.

## Model Catalog

Add these models at the beginning of the built-in Codex model list, in this order:

1. `gpt-5.6-sol`: flagship GPT-5.6 model for the most demanding coding, computer-use, research, and cybersecurity work.
2. `gpt-5.6-terra`: balanced GPT-5.6 model for everyday work, with GPT-5.5-class performance at lower cost.
3. `gpt-5.6-luna`: fastest and most affordable GPT-5.6 model for efficient, repeatable workloads.

Add matching label and description keys to every locale currently supported by the webview. The existing model selector remains unchanged apart from displaying these catalog entries. Because the chat provider initializes from the first built-in Codex model, new/default Codex chat selections will use `gpt-5.6-sol`; persisted valid selections remain unchanged.

Do not add the `gpt-5.6` alias as a separate option, because it routes to Sol and would duplicate the concrete model.

## Reasoning Effort

Keep the existing Codex levels `low`, `medium`, `high`, and `xhigh`. Add `max` to the selectable levels only when the current Codex model is one of the three GPT-5.6 models.

Represent this as a focused GPT-5.6 capability set rather than enabling `max` for every Codex model or refactoring the entire model catalog into a new metadata system.

When a user has selected `max` and switches to a Codex model that does not support it, the selector must normalize the value to `high`, matching the existing unavailable-effort fallback behavior.

The Codex channel must forward `max` unchanged. Remove the current compatibility downgrade that rewrites `max` to `xhigh`. The installed Codex SDK is loaded dynamically at its latest version and serializes the supplied reasoning effort into the CLI `model_reasoning_effort` configuration.

## Version And Packaging

Change the Gradle project version from `0.4.7` to `0.4.7-cyzn`. The webview prebuild derives its displayed version from `build.gradle`, so generated version output will update during the build. Historical changelog entry versions remain unchanged.

Build the installable plugin with `gradlew.bat buildPlugin`. The expected artifact is:

`build/distributions/idea-claude-code-gui-0.4.7-cyzn.zip`

## Testing

Use test-first changes for each behavior:

- The built-in Codex catalog starts with the three concrete GPT-5.6 model IDs in the required order.
- The selector shows `max` for all three GPT-5.6 models.
- The selector hides `max` for older Codex models and normalizes a stale `max` selection to `high`.
- The Codex channel forwards `max` without rewriting it.
- GPT-5.6 context metadata is only added if an official value is confirmed; otherwise existing fallback behavior remains intact.
- The webview test suite and Java tests pass.
- The final plugin build succeeds and produces the versioned ZIP artifact.

## Out Of Scope

- The `gpt-5.6` alias as an additional model option
- The API-only `none` reasoning effort
- GPT-5.6 Pro mode, Ultra mode, persisted reasoning, or programmatic tool calling
- Unverified pricing or context-window data
- Changing prompt-enhancer or commit-message model defaults
- Refactoring all provider model capabilities into a shared metadata architecture
