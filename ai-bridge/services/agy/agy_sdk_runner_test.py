import json
import os
import sys
import unittest


try:
    import google.antigravity  # noqa: F401
except ImportError:  # pragma: no cover - depends on local SDK availability
    raise unittest.SkipTest("google-antigravity SDK is not installed")


sys.path.insert(0, os.path.dirname(__file__))

from agy_sdk_runner import build_content, build_version_info, emit_chunk, emit_error, emit_usage, run  # noqa: E402


class FakeText:
    text = "hello"


class FakeThought:
    text = "thinking"


class FakeToolCall:
    id = "call-1"
    name = "edit_file"
    input = {"path": "a.txt"}


class FakeToolResult:
    id = "call-1"
    name = "edit_file"
    output = "done"
    is_error = False


class FakeUsage:
    input_tokens = 10
    output_tokens = 20
    cache_creation_input_tokens = 2
    cache_read_input_tokens = 3


class FakeChunkStream:
    def __init__(self, lines):
        self.lines = lines

    def __aiter__(self):
        return self

    async def __anext__(self):
        if not self.lines:
            raise StopAsyncIteration
        return self.lines.pop(0)


class FakeResponse:
    def __init__(self, lines):
        self.chunks = FakeChunkStream(lines)
        self.usage_metadata = None


class FakeConversation:
    conversation_id = "thread-1"


class FakeAgent:
    events = None

    def __init__(self, _config):
        self.conversation = FakeConversation()

    async def __aenter__(self):
        return self

    async def __aexit__(self, _exc_type, _exc, _tb):
        return False

    async def chat(self, _content):
        if self.events is not None:
            self.events.append("[CHAT_CALLED]")
        return FakeResponse([FakeText()])


class AgySdkRunnerTest(unittest.TestCase):
    def test_emit_text_chunk(self):
        lines = []

        emit_chunk(FakeText(), lines.append)

        self.assertEqual(lines, ['[CONTENT_DELTA] "hello"'])

    def test_emit_thought_chunk(self):
        lines = []

        emit_chunk(FakeThought(), lines.append)

        self.assertEqual(lines, ['[THINKING_DELTA] "thinking"'])

    def test_emit_tool_call_as_message(self):
        lines = []

        emit_chunk(FakeToolCall(), lines.append)

        self.assertEqual(len(lines), 1)
        self.assertTrue(lines[0].startswith("[MESSAGE] "))
        payload = json.loads(lines[0][len("[MESSAGE] "):])
        self.assertEqual(payload["type"], "assistant")
        self.assertEqual(payload["message"]["content"][0]["type"], "tool_use")
        self.assertEqual(payload["message"]["content"][0]["name"], "edit_file")

    def test_emit_tool_result_as_message(self):
        lines = []

        emit_chunk(FakeToolResult(), lines.append)

        payload = json.loads(lines[0][len("[MESSAGE] "):])
        self.assertEqual(payload["type"], "user")
        self.assertEqual(payload["message"]["content"][0]["type"], "tool_result")
        self.assertEqual(payload["message"]["content"][0]["content"], "done")

    def test_emit_usage(self):
        lines = []

        emit_usage(FakeUsage(), lines.append, session_id="thread-1")

        payload = json.loads(lines[0][len("[MESSAGE] "):])
        self.assertEqual(payload["message"]["usage"]["input_tokens"], 10)
        self.assertEqual(payload["message"]["usage"]["output_tokens"], 20)
        self.assertEqual(payload["session_id"], "thread-1")

    def test_emit_error_payload(self):
        lines = []

        emit_error(RuntimeError("boom"), lines.append)

        payload = json.loads(lines[0][len("[SEND_ERROR] "):])
        self.assertFalse(payload["success"])
        self.assertEqual(payload["error"], "boom")

    def test_build_content_includes_message_and_attachments(self):
        payload = {
            "message": "hello",
            "attachments": [
                {"fileName": "a.txt", "mediaType": "text/plain"},
            ],
        }

        content = build_content(payload)

        self.assertIn("hello", content)
        self.assertIn("a.txt", content)

    def test_build_version_info_uses_installed_sdk_metadata(self):
        info = build_version_info()

        self.assertEqual(info["package"], "google-antigravity")
        self.assertRegex(info["version"], r"\d+\.\d+")
        self.assertIn("python", info)

    def test_run_emits_stream_start_before_waiting_for_agent_chat(self):
        import agy_sdk_runner

        original_agent = agy_sdk_runner.Agent
        agy_sdk_runner.Agent = FakeAgent
        try:
            lines = []
            FakeAgent.events = lines

            import asyncio
            asyncio.run(run({
                "message": "hello",
                "cwd": "C:\\work",
                "apiKey": "test-key",
                "authMode": "apiKey",
            }, lines.append))

            self.assertEqual(lines[0], "[MESSAGE_START]")
            self.assertEqual(lines[1], "[STREAM_START]")
            self.assertEqual(lines[2], "[CHAT_CALLED]")
            self.assertIn('[CONTENT_DELTA] "hello"', lines)
        finally:
            FakeAgent.events = None
            agy_sdk_runner.Agent = original_agent


if __name__ == "__main__":
    unittest.main()
