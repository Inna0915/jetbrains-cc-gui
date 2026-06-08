package com.github.claudecodegui.session;

import com.github.claudecodegui.permission.PermissionRequest;
import com.github.claudecodegui.session.ClaudeSession.Message;
import org.junit.Test;

import java.util.ArrayList;
import java.util.List;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotNull;

public class AgyMessageHandlerTest {
    @Test
    public void capturesConversationIdAndForwardsStreamingDeltas() {
        SessionState state = new SessionState();
        CallbackHandler callbackHandler = new CallbackHandler();
        RecordingCallback callback = new RecordingCallback();
        callbackHandler.setCallback(callback);

        AgyMessageHandler handler = new AgyMessageHandler(state, callbackHandler);
        handler.onMessage("session_id", "abc-123");
        handler.onMessage("stream_start", "");
        handler.onMessage("content_delta", "hello");
        handler.onMessage("thinking_delta", "thought");

        assertEquals("abc-123", state.getSessionId());
        assertEquals("abc-123", callback.sessionId);
        assertEquals(List.of("hello"), callback.contentDeltas);
        assertEquals(List.of("thought"), callback.thinkingDeltas);
    }

    @Test
    public void preservesToolUseMessagesFromAgyAssistantPayloads() {
        SessionState state = new SessionState();
        CallbackHandler callbackHandler = new CallbackHandler();
        RecordingCallback callback = new RecordingCallback();
        callbackHandler.setCallback(callback);

        AgyMessageHandler handler = new AgyMessageHandler(state, callbackHandler);
        handler.onMessage("assistant", "{\"type\":\"assistant\",\"message\":{\"content\":[{\"type\":\"tool_use\",\"id\":\"tool-1\",\"name\":\"run_command\",\"input\":{\"command\":\"pwd\"}}]}}");

        assertEquals(1, state.getMessages().size());
        Message message = state.getMessages().get(0);
        assertNotNull(message.raw);
        assertEquals(
                "tool_use",
                message.raw
                        .getAsJsonObject("message")
                        .getAsJsonArray("content")
                        .get(0)
                        .getAsJsonObject()
                        .get("type")
                        .getAsString()
        );
        assertEquals(1, callback.messageUpdateCount);
    }

    private static final class RecordingCallback implements ClaudeSession.SessionCallback {
        private String sessionId;
        private int messageUpdateCount = 0;
        private final List<String> contentDeltas = new ArrayList<>();
        private final List<String> thinkingDeltas = new ArrayList<>();

        @Override
        public void onMessageUpdate(List<Message> messages) {
            messageUpdateCount++;
        }

        @Override
        public void onStateChange(boolean busy, boolean loading, String error) {
        }

        @Override
        public void onSessionIdReceived(String sessionId) {
            this.sessionId = sessionId;
        }

        @Override
        public void onPermissionRequested(PermissionRequest request) {
        }

        @Override
        public void onThinkingStatusChanged(boolean isThinking) {
        }

        @Override
        public void onSlashCommandsReceived(List<String> slashCommands) {
        }

        @Override
        public void onNodeLog(String log) {
        }

        @Override
        public void onSummaryReceived(String summary) {
        }

        @Override
        public void onContentDelta(String delta) {
            contentDeltas.add(delta);
        }

        @Override
        public void onThinkingDelta(String delta) {
            thinkingDeltas.add(delta);
        }
    }
}
