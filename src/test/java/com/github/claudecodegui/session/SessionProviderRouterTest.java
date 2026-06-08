package com.github.claudecodegui.session;

import com.github.claudecodegui.provider.agy.AgySDKBridge;
import com.github.claudecodegui.provider.claude.ClaudeSDKBridge;
import com.github.claudecodegui.provider.codex.CodexSDKBridge;
import com.google.gson.JsonObject;
import org.junit.Test;

import java.util.List;

import static org.junit.Assert.assertEquals;

public class SessionProviderRouterTest {
    @Test
    public void routesAgyOperationsToAgyBridge() {
        RecordingClaudeBridge claudeBridge = new RecordingClaudeBridge();
        RecordingCodexBridge codexBridge = new RecordingCodexBridge();
        RecordingAgyBridge agyBridge = new RecordingAgyBridge();
        SessionProviderRouter router = new SessionProviderRouter(claudeBridge, codexBridge, agyBridge);

        JsonObject launchResult = router.launchChannel("agy", "channel-1", "conversation-1", "G:\\code\\project");
        router.interruptChannel("agy", "channel-1");
        List<JsonObject> messages = router.getSessionMessages("agy", "conversation-1", "G:\\code\\project");

        assertEquals("agy", launchResult.get("provider").getAsString());
        assertEquals(1, agyBridge.launchCount);
        assertEquals(1, agyBridge.interruptCount);
        assertEquals(1, agyBridge.historyCount);
        assertEquals("agy", messages.get(0).get("provider").getAsString());
        assertEquals(0, claudeBridge.launchCount + claudeBridge.interruptCount + claudeBridge.historyCount);
        assertEquals(0, codexBridge.launchCount + codexBridge.interruptCount + codexBridge.historyCount);
    }

    private static class RecordingClaudeBridge extends ClaudeSDKBridge {
        private int launchCount = 0;
        private int interruptCount = 0;
        private int historyCount = 0;

        @Override
        public JsonObject launchChannel(String channelId, String sessionId, String cwd) {
            launchCount++;
            return providerResult("claude");
        }

        @Override
        public void interruptChannel(String channelId) {
            interruptCount++;
        }

        @Override
        public List<JsonObject> getSessionMessages(String sessionId, String cwd) {
            historyCount++;
            return List.of(providerResult("claude"));
        }
    }

    private static class RecordingCodexBridge extends CodexSDKBridge {
        private int launchCount = 0;
        private int interruptCount = 0;
        private int historyCount = 0;

        @Override
        public JsonObject launchChannel(String channelId, String sessionId, String cwd) {
            launchCount++;
            return providerResult("codex");
        }

        @Override
        public void interruptChannel(String channelId) {
            interruptCount++;
        }

        @Override
        public List<JsonObject> getSessionMessages(String sessionId, String cwd) {
            historyCount++;
            return List.of(providerResult("codex"));
        }
    }

    private static class RecordingAgyBridge extends AgySDKBridge {
        private int launchCount = 0;
        private int interruptCount = 0;
        private int historyCount = 0;

        @Override
        public JsonObject launchChannel(String channelId, String sessionId, String cwd) {
            launchCount++;
            return providerResult("agy");
        }

        @Override
        public void interruptChannel(String channelId) {
            interruptCount++;
        }

        @Override
        public List<JsonObject> getSessionMessages(String sessionId, String cwd) {
            historyCount++;
            return List.of(providerResult("agy"));
        }
    }

    private static JsonObject providerResult(String provider) {
        JsonObject result = new JsonObject();
        result.addProperty("provider", provider);
        return result;
    }
}
