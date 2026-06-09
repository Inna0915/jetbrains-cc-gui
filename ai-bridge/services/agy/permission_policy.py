from __future__ import annotations

from typing import Any

from google.antigravity import CapabilitiesConfig, LocalAgentConfig
from google.antigravity.hooks import policy
from google.antigravity.types import BuiltinTools, GeminiConfig, GenerationConfig, ModelConfig, ModelEntry

from permission_ipc import request_permission


DEFAULT_TEXT_MODEL = "gemini-3.5-flash"


def normalize_mode(mode: str | None) -> str:
    value = (mode or "default").strip()
    if value in ("autoEdit", "acceptEdits"):
        return "acceptEdits"
    if value in ("bypassPermissions", "yolo"):
        return "bypassPermissions"
    if value == "plan":
        return "plan"
    return "default"


def normalize_thinking_level(value: str | None) -> str | None:
    normalized = (value or "").strip()
    if normalized in ("low", "medium", "high"):
        return normalized
    if normalized in ("xhigh", "max"):
        return "high"
    return None


def _compact_kwargs(values: dict[str, Any]) -> dict[str, Any]:
    return {key: value for key, value in values.items() if value is not None}


def _build_model_kwargs(model: str | None, reasoning_effort: str | None) -> dict[str, Any]:
    thinking_level = normalize_thinking_level(reasoning_effort)
    model_name = model or None
    if thinking_level is None:
        return {"model": model_name}

    generation = GenerationConfig(thinking_level=thinking_level)
    model_entry_kwargs = {
        "name": model_name or DEFAULT_TEXT_MODEL,
        "generation": generation,
    }

    return {
        "model": None,
        "gemini_config": GeminiConfig(
            models=ModelConfig(default=ModelEntry(**model_entry_kwargs))
        ),
    }


def _tool_call_value(tool_call: Any, *names: str) -> Any:
    for name in names:
        if hasattr(tool_call, name):
            value = getattr(tool_call, name)
            if value is not None:
                return value
    return None


def _to_plain(value: Any) -> Any:
    if value is None:
        return {}
    if hasattr(value, "model_dump"):
        return value.model_dump()
    if hasattr(value, "dict"):
        return value.dict()
    if isinstance(value, (str, int, float, bool, list, tuple, dict)):
        return value
    return repr(value)


def map_tool_call_to_permission_request(tool_call: Any) -> dict[str, Any]:
    tool_name = _tool_call_value(tool_call, "name", "tool_name", "function_name") or type(tool_call).__name__
    inputs = _tool_call_value(tool_call, "input", "arguments", "args", "kwargs")
    return {
        "toolName": str(tool_name),
        "inputs": _to_plain(inputs),
    }


async def gui_permission_handler(tool_call: Any) -> bool:
    return await request_permission(map_tool_call_to_permission_request(tool_call))


def build_config(
    mode: str | None,
    cwd: str,
    conversation_id: str | None,
    model: str | None,
    save_dir: str | None = None,
    api_key: str | None = None,
    gui_handler: Any = None,
    system_instructions: str | None = None,
    reasoning_effort: str | None = None,
) -> LocalAgentConfig:
    normalized = normalize_mode(mode)
    kwargs = _compact_kwargs({
        "conversation_id": conversation_id or None,
        "save_dir": save_dir,
        "api_key": api_key,
        "system_instructions": system_instructions,
        **_build_model_kwargs(model, reasoning_effort),
    })

    if normalized == "plan":
        return LocalAgentConfig(
            workspaces=[cwd],
            capabilities=CapabilitiesConfig(
                enabled_tools=BuiltinTools.read_only(),
                enable_subagents=False,
            ),
            policies=[policy.allow_all()],
            **kwargs,
        )

    if normalized == "bypassPermissions":
        return LocalAgentConfig(
            workspaces=[],
            policies=[policy.allow_all()],
            **kwargs,
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
        **kwargs,
    )
