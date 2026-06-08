import asyncio
import json
import os
import tempfile
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


DEFAULT_SAFETY_NET_MS = 300_000
POLL_INTERVAL_SECONDS = 0.1


def parse_permission_response(content: str) -> bool:
    try:
        parsed = json.loads(content)
    except Exception:
        return False
    if not isinstance(parsed, dict):
        return False
    return parsed.get("allow") is True


def _permission_dir() -> Path:
    raw = os.environ.get("CLAUDE_PERMISSION_DIR")
    if raw:
        return Path(raw)
    return Path(tempfile.gettempdir()) / "claude-permission"


def _session_id() -> str:
    return os.environ.get("CLAUDE_SESSION_ID") or "unknown-session"


def _safety_net_ms() -> int:
    raw = os.environ.get("CLAUDE_PERMISSION_SAFETY_NET_MS")
    if not raw:
        return DEFAULT_SAFETY_NET_MS
    try:
        value = int(raw)
    except ValueError:
        return DEFAULT_SAFETY_NET_MS
    return max(1, value)


def _json_safe(value: Any) -> Any:
    try:
        json.dumps(value)
        return value
    except TypeError:
        return repr(value)


async def request_permission(request: dict[str, Any]) -> bool:
    permission_dir = _permission_dir()
    permission_dir.mkdir(parents=True, exist_ok=True)

    request_id = str(uuid.uuid4())
    session_id = _session_id()
    request_file = permission_dir / f"request-{session_id}-{request_id}.json"
    response_file = permission_dir / f"response-{session_id}-{request_id}.json"

    request_data = {
        "requestId": request_id,
        "toolName": request.get("toolName") or "unknown",
        "inputs": _json_safe(request.get("inputs") or {}),
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "cwd": request.get("cwd") or os.getcwd(),
    }
    request_file.write_text(json.dumps(request_data, ensure_ascii=False, indent=2), encoding="utf-8")

    timeout_seconds = _safety_net_ms() / 1000
    loop = asyncio.get_running_loop()
    deadline = loop.time() + timeout_seconds

    while loop.time() < deadline:
        await asyncio.sleep(POLL_INTERVAL_SECONDS)
        if response_file.exists():
            content = response_file.read_text(encoding="utf-8")
            try:
                response_file.unlink()
            except OSError:
                pass
            return parse_permission_response(content)

    return False
