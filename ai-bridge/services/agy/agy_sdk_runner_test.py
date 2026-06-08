import json
import os
import sys
import unittest


try:
    import google.antigravity  # noqa: F401
except ImportError:  # pragma: no cover - depends on local SDK availability
    raise unittest.SkipTest("google-antigravity SDK is not installed")


sys.path.insert(0, os.path.dirname(__file__))

from agy_sdk_runner import build_content, emit_chunk, emit_error, emit_usage  # noqa: E402


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


if __name__ == "__main__":
    unittest.main()
