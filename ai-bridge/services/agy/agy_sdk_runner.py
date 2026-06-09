from __future__ import annotations

import asyncio
import base64
import binascii
from importlib import metadata
import json
import os
import sys
import uuid
from typing import Any, Callable

from google.antigravity import Agent
from google.antigravity.types import Image, Text, Thought, ToolCall, ToolResult

from permission_policy import build_config


Emit = Callable[[str], None]


def emit_json_marker(marker: str, payload: Any, emit: Emit) -> None:
    emit(f"{marker} {json.dumps(payload, ensure_ascii=False)}")


def _default_emit(line: str) -> None:
    print(line, flush=True)


def build_version_info() -> dict[str, str]:
    try:
        version = metadata.version("google-antigravity")
    except metadata.PackageNotFoundError:
        version = "unknown"
    return {
        "package": "google-antigravity",
        "version": version,
        "python": sys.version.split()[0],
        "executable": sys.executable,
    }


def _chunk_is(chunk: Any, sdk_type: type, type_name: str) -> bool:
    return isinstance(chunk, sdk_type) or type(chunk).__name__.endswith(type_name)


def _get_attr(value: Any, *names: str, default: Any = None) -> Any:
    for name in names:
        if hasattr(value, name):
            attr = getattr(value, name)
            if attr is not None:
                return attr
    return default


def _plain(value: Any) -> Any:
    if value is None:
        return {}
    if hasattr(value, "model_dump"):
        return value.model_dump()
    if hasattr(value, "dict"):
        return value.dict()
    if isinstance(value, (str, int, float, bool, list, tuple, dict)):
        return value
    return repr(value)


def _tool_call_payload(chunk: Any) -> dict[str, Any]:
    tool_id = str(_get_attr(chunk, "id", "tool_call_id", default=str(uuid.uuid4())))
    name = str(_get_attr(chunk, "name", "tool_name", "function_name", default="unknown"))
    tool_input = _plain(_get_attr(chunk, "input", "arguments", "args", "kwargs", default={}))
    return {
        "type": "assistant",
        "message": {
            "id": str(uuid.uuid4()),
            "type": "message",
            "role": "assistant",
            "content": [{
                "type": "tool_use",
                "id": tool_id,
                "name": name,
                "input": tool_input,
            }],
            "model": "agy",
            "stop_reason": None,
            "usage": {
                "input_tokens": 0,
                "output_tokens": 0,
                "cache_creation_input_tokens": 0,
                "cache_read_input_tokens": 0,
            },
        },
        "session_id": None,
        "uuid": tool_id,
    }


def _tool_result_payload(chunk: Any) -> dict[str, Any]:
    tool_id = str(_get_attr(chunk, "id", "tool_call_id", default=str(uuid.uuid4())))
    content = _get_attr(chunk, "output", "content", "result", default="")
    is_error = bool(_get_attr(chunk, "is_error", "error", default=False))
    return {
        "type": "user",
        "message": {
            "role": "user",
            "content": [{
                "type": "tool_result",
                "tool_use_id": tool_id,
                "content": "" if content is None else str(content),
                "is_error": is_error,
            }],
        },
        "session_id": None,
        "uuid": str(uuid.uuid4()),
    }


def emit_chunk(chunk: Any, emit: Emit = _default_emit) -> None:
    if _chunk_is(chunk, Text, "Text"):
        emit_json_marker("[CONTENT_DELTA]", _get_attr(chunk, "text", default=""), emit)
        return
    if _chunk_is(chunk, Thought, "Thought"):
        emit_json_marker("[THINKING_DELTA]", _get_attr(chunk, "text", default=""), emit)
        return
    if _chunk_is(chunk, ToolCall, "ToolCall"):
        emit_json_marker("[MESSAGE]", _tool_call_payload(chunk), emit)
        return
    if _chunk_is(chunk, ToolResult, "ToolResult"):
        emit_json_marker("[MESSAGE]", _tool_result_payload(chunk), emit)


def _usage_value(usage: Any, *names: str) -> int:
    raw = _get_attr(usage, *names, default=0)
    try:
        return int(raw or 0)
    except (TypeError, ValueError):
        return 0


def emit_usage(usage: Any, emit: Emit = _default_emit, session_id: str | None = None) -> None:
    payload = {
        "type": "assistant",
        "message": {
            "id": str(uuid.uuid4()),
            "type": "message",
            "role": "assistant",
            "content": [],
            "model": "agy",
            "stop_reason": "end_turn",
            "usage": {
                "input_tokens": _usage_value(usage, "input_tokens", "prompt_tokens", "prompt_token_count"),
                "output_tokens": _usage_value(usage, "output_tokens", "completion_tokens", "candidates_token_count"),
                "cache_creation_input_tokens": _usage_value(usage, "cache_creation_input_tokens"),
                "cache_read_input_tokens": _usage_value(usage, "cache_read_input_tokens", "cached_input_tokens"),
            },
        },
        "session_id": session_id,
        "uuid": str(uuid.uuid4()),
    }
    emit_json_marker("[MESSAGE]", payload, emit)


def emit_error(exc: BaseException, emit: Emit = _default_emit) -> None:
    emit_json_marker("[SEND_ERROR]", {"success": False, "error": str(exc)}, emit)


def _attachment_file_name(attachment: dict[str, Any]) -> str:
    return str(attachment.get("fileName") or attachment.get("name") or "attachment")


def _attachment_media_type(attachment: dict[str, Any]) -> str:
    return str(attachment.get("mediaType") or attachment.get("type") or "unknown")


def _decode_base64_attachment_data(value: Any) -> bytes | None:
    if not isinstance(value, str) or not value.strip():
        return None
    raw = value.strip()
    if raw.startswith("data:") and "," in raw:
        raw = raw.split(",", 1)[1]
    try:
        return base64.b64decode(raw, validate=True)
    except (binascii.Error, ValueError):
        return None


def _build_image_attachment(attachment: dict[str, Any]) -> Image | None:
    media_type = _attachment_media_type(attachment)
    if not media_type.startswith("image/"):
        return None
    data = _decode_base64_attachment_data(attachment.get("data"))
    if data is None:
        return None
    return Image(
        data=data,
        mime_type=media_type,
        description=_attachment_file_name(attachment),
    )


def build_content(payload: dict[str, Any]) -> Any:
    parts: list[str] = []
    media_items: list[Any] = []
    attachment_lines: list[str] = []
    message = payload.get("message") or payload.get("text") or ""
    if message:
        parts.append(str(message))

    attachments = payload.get("attachments") or []
    if attachments:
        for attachment in attachments:
            if not isinstance(attachment, dict):
                continue
            image = _build_image_attachment(attachment)
            if image is not None:
                media_items.append(image)
                continue
            file_name = _attachment_file_name(attachment)
            media_type = _attachment_media_type(attachment)
            attachment_lines.append(f"- {file_name} ({media_type})")

    if attachment_lines:
        parts.append("Attachments:")
        parts.extend(attachment_lines)

    text_content = "\n".join(parts).strip()
    if media_items:
        return ([text_content] if text_content else []) + media_items

    return text_content


def _conversation_id_from_agent(agent: Agent, fallback: str | None) -> str | None:
    conversation = getattr(agent, "conversation", None)
    conversation_id = getattr(conversation, "conversation_id", None)
    return conversation_id or fallback


async def run(payload: dict[str, Any], emit: Emit = _default_emit) -> int:
    cwd = payload.get("cwd") or os.getcwd()
    conversation_id = payload.get("conversationId") or payload.get("sessionId") or None
    config = build_config(
        payload.get("permissionMode"),
        cwd=cwd,
        conversation_id=conversation_id,
        model=payload.get("model") or None,
        save_dir=payload.get("saveDir") or None,
        api_key=payload.get("apiKey") or None,
        system_instructions=payload.get("agentPrompt") or None,
        reasoning_effort=payload.get("reasoningEffort") or None,
    )

    emit("[MESSAGE_START]")
    emit("[STREAM_START]")
    try:
        async with Agent(config) as agent:
            response = await agent.chat(build_content(payload))
            thread_id = _conversation_id_from_agent(agent, conversation_id)
            if thread_id:
                emit(f"[THREAD_ID] {thread_id}")
            async for chunk in response.chunks:
                emit_chunk(chunk, emit)
            usage = getattr(response, "usage_metadata", None)
            if usage:
                emit_usage(usage, emit, session_id=thread_id)
    finally:
        emit("[STREAM_END]")
        emit("[MESSAGE_END]")
    return 0


async def _main_async() -> int:
    try:
        payload = json.load(sys.stdin)
        if not isinstance(payload, dict):
            raise ValueError("stdin payload must be a JSON object")
        return await run(payload)
    except Exception as exc:
        emit_error(exc)
        return 1


def main() -> int:
    if "--version" in sys.argv[1:]:
        print(json.dumps(build_version_info(), ensure_ascii=False), flush=True)
        return 0
    return asyncio.run(_main_async())


if __name__ == "__main__":
    raise SystemExit(main())
