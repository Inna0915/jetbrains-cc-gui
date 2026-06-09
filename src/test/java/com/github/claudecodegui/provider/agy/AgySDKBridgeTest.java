package com.github.claudecodegui.provider.agy;

import com.github.claudecodegui.dependency.PythonDependencyManager;
import com.github.claudecodegui.dependency.SdkDefinition;
import com.github.claudecodegui.provider.common.MessageCallback;
import com.github.claudecodegui.provider.common.SDKResult;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import org.junit.Rule;
import org.junit.Test;
import org.junit.rules.TemporaryFolder;

import java.nio.file.Path;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicReference;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

public class AgySDKBridgeTest {
    @Rule
    public TemporaryFolder temporaryFolder = new TemporaryFolder();

    @Test
    public void shouldExposeAgyProviderName() throws Exception {
        CapturingAgySDKBridge bridge = new CapturingAgySDKBridge(pythonManager());

        assertEquals("agy", bridge.providerNameForTest());
    }

    @Test
    public void shouldSendAgyPayloadThroughStdin() throws Exception {
        CapturingAgySDKBridge bridge = new CapturingAgySDKBridge(pythonManager());

        bridge.sendMessage(
                "channel-1",
                "hello agy",
                "conversation-123",
                "G:\\code\\project",
                List.of(),
                "plan",
                "gemini-3-pro",
                "Stay concise",
                "medium",
                new NoopCallback()
        ).join();

        JsonObject payload = JsonParser.parseString(bridge.capturedStdinJson).getAsJsonObject();
        assertEquals("hello agy", payload.get("message").getAsString());
        assertEquals("conversation-123", payload.get("conversationId").getAsString());
        assertEquals("G:\\code\\project", payload.get("cwd").getAsString());
        assertEquals("plan", payload.get("permissionMode").getAsString());
        assertEquals("gemini-3-pro", payload.get("model").getAsString());
        assertEquals("Stay concise", payload.get("agentPrompt").getAsString());
        assertEquals("medium", payload.get("reasoningEffort").getAsString());
        assertTrue(bridge.capturedCommand.contains("agy"));
        assertTrue(bridge.capturedCommand.contains("send"));
    }

    @Test
    public void shouldConfigureAgyEnvironment() throws Exception {
        PythonDependencyManager pythonManager = pythonManager();
        CapturingAgySDKBridge bridge = new CapturingAgySDKBridge(pythonManager);
        bridge.setSessionId("agy-session-for-permissions");

        Map<String, String> env = bridge.buildEnvironmentForTest("{}");

        assertEquals("true", env.get("AGY_USE_STDIN"));
        assertEquals(
                pythonManager.getVenvPython(SdkDefinition.AGY_SDK.getId()).toString(),
                env.get("AGY_PYTHON_PATH")
        );
        assertEquals("agy-session-for-permissions", env.get("CLAUDE_SESSION_ID"));
        assertTrue(env.containsKey("CLAUDE_PERMISSION_DIR"));
        assertFalse(env.get("CLAUDE_PERMISSION_DIR").isBlank());
    }

    @Test
    public void shouldParseFakeRunnerLineProtocol() throws Exception {
        CapturingAgySDKBridge bridge = new CapturingAgySDKBridge(pythonManager());
        RecordingCallback callback = new RecordingCallback();

        SDKResult result = bridge.replayOutputLinesForTest(List.of(
                "[MESSAGE_START]",
                "[STREAM_START]",
                "[THREAD_ID] fake-conversation",
                "[CONTENT_DELTA] \"hello\"",
                "[STREAM_END]",
                "[MESSAGE_END]"
        ), callback);

        assertEquals("hello", result.finalResult);
        assertEquals(List.of(
                "message_start:",
                "stream_start:",
                "session_id:fake-conversation",
                "content_delta:hello",
                "stream_end:",
                "message_end:"
        ), callback.events);
    }

    private PythonDependencyManager pythonManager() throws Exception {
        Path dependenciesDir = temporaryFolder.newFolder("dependencies").toPath();
        return new PythonDependencyManager(dependenciesDir);
    }

    private static class CapturingAgySDKBridge extends AgySDKBridge {
        private List<String> capturedCommand;
        private String capturedStdinJson;

        private CapturingAgySDKBridge(PythonDependencyManager pythonDependencyManager) {
            super(pythonDependencyManager);
        }

        private String providerNameForTest() {
            return getProviderName();
        }

        private Map<String, String> buildEnvironmentForTest(String stdinJson) {
            Map<String, String> env = new HashMap<>();
            configureProviderEnv(env, stdinJson);
            envConfigurator.configurePermissionEnv(env);
            return env;
        }

        private SDKResult replayOutputLinesForTest(List<String> lines, MessageCallback callback) {
            SDKResult result = new SDKResult();
            StringBuilder assistantContent = new StringBuilder();
            AtomicBoolean hadSendError = new AtomicBoolean(false);
            AtomicReference<String> lastNodeError = new AtomicReference<>(null);

            for (String line : lines) {
                processOutputLine(line, callback, result, assistantContent, hadSendError, lastNodeError);
            }

            result.finalResult = assistantContent.toString();
            result.messageCount = result.messages.size();
            result.success = !hadSendError.get();
            return result;
        }

        @Override
        protected List<String> buildBaseCommand(String action) {
            return List.of("node", "channel-manager.js", getProviderName(), action);
        }

        @Override
        protected CompletableFuture<SDKResult> executeStreamingCommand(
                String channelId,
                List<String> command,
                String stdinJson,
                String cwd,
                MessageCallback callback
        ) {
            this.capturedCommand = command;
            this.capturedStdinJson = stdinJson;
            return CompletableFuture.completedFuture(SDKResult.success("ok"));
        }
    }

    private static class NoopCallback implements MessageCallback {
        @Override
        public void onMessage(String type, String content) {
        }

        @Override
        public void onError(String error) {
        }

        @Override
        public void onComplete(SDKResult result) {
        }
    }

    private static class RecordingCallback implements MessageCallback {
        private final List<String> events = new java.util.ArrayList<>();

        @Override
        public void onMessage(String type, String content) {
            events.add(type + ":" + content);
        }

        @Override
        public void onError(String error) {
            events.add("error:" + error);
        }

        @Override
        public void onComplete(SDKResult result) {
            events.add("complete:" + result.finalResult);
        }
    }
}
