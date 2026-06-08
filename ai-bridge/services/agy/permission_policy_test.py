import os
import sys
import unittest


try:
    import google.antigravity  # noqa: F401
except ImportError:  # pragma: no cover - depends on local SDK availability
    raise unittest.SkipTest("google-antigravity SDK is not installed")


sys.path.insert(0, os.path.dirname(__file__))

from permission_ipc import parse_permission_response  # noqa: E402
from permission_policy import build_config, normalize_mode  # noqa: E402


class AgyPermissionPolicyTest(unittest.TestCase):
    def test_normalize_mode_aliases(self):
        self.assertEqual(normalize_mode(None), "default")
        self.assertEqual(normalize_mode(""), "default")
        self.assertEqual(normalize_mode("autoEdit"), "acceptEdits")
        self.assertEqual(normalize_mode("acceptEdits"), "acceptEdits")
        self.assertEqual(normalize_mode("bypassPermissions"), "bypassPermissions")
        self.assertEqual(normalize_mode("yolo"), "bypassPermissions")
        self.assertEqual(normalize_mode("plan"), "plan")

    def test_plan_uses_read_only_tools(self):
        cfg = build_config("plan", cwd="C:\\work", conversation_id=None, model="")

        self.assertEqual(
            [tool.value for tool in cfg.capabilities.enabled_tools],
            ["list_directory", "search_directory", "find_file", "view_file", "finish"],
        )
        self.assertFalse(cfg.capabilities.enable_subagents)
        self.assertEqual(cfg.workspaces, ["C:\\work"])

    def test_default_uses_workspace_and_safe_default_policies(self):
        cfg = build_config("default", cwd="C:\\work", conversation_id=None, model="")

        self.assertEqual(cfg.workspaces, ["C:\\work"])
        self.assertGreaterEqual(len(cfg.policies), 1)

    def test_accept_edits_keeps_workspace(self):
        cfg = build_config("acceptEdits", cwd="C:\\work", conversation_id="abc", model="gemini-3-pro")

        self.assertEqual(cfg.workspaces, ["C:\\work"])
        self.assertEqual(cfg.conversation_id, "abc")
        self.assertEqual(cfg.model, "gemini-3-pro")
        self.assertGreaterEqual(len(cfg.policies), 3)

    def test_bypass_is_unrestricted(self):
        cfg = build_config("bypassPermissions", cwd="C:\\work", conversation_id=None, model="")

        self.assertEqual(cfg.workspaces, [])

    def test_permission_response_requires_boolean_allow(self):
        self.assertTrue(parse_permission_response('{"allow": true}'))
        self.assertFalse(parse_permission_response('{"allow": false}'))
        self.assertFalse(parse_permission_response('{"allow": "true"}'))
        self.assertFalse(parse_permission_response("not json"))


if __name__ == "__main__":
    unittest.main()
