package com.github.claudecodegui.session;

import com.github.claudecodegui.provider.agy.AgySDKBridge;
import com.github.claudecodegui.provider.claude.ClaudeSDKBridge;
import com.github.claudecodegui.provider.codex.CodexSDKBridge;
import com.google.gson.JsonObject;

import java.util.List;

/**
 * Centralizes provider-specific bridge routing for session operations.
 */
public class SessionProviderRouter {

    private final ClaudeSDKBridge claudeSDKBridge;
    private final CodexSDKBridge codexSDKBridge;
    private final AgySDKBridge agySDKBridge;

    public SessionProviderRouter(ClaudeSDKBridge claudeSDKBridge, CodexSDKBridge codexSDKBridge) {
        this(claudeSDKBridge, codexSDKBridge, null);
    }

    public SessionProviderRouter(ClaudeSDKBridge claudeSDKBridge, CodexSDKBridge codexSDKBridge, AgySDKBridge agySDKBridge) {
        this.claudeSDKBridge = claudeSDKBridge;
        this.codexSDKBridge = codexSDKBridge;
        this.agySDKBridge = agySDKBridge;
    }

    public JsonObject launchChannel(String provider, String channelId, String sessionId, String cwd) {
        if ("codex".equals(provider)) {
            return codexSDKBridge.launchChannel(channelId, sessionId, cwd);
        }
        if ("agy".equals(provider) && agySDKBridge != null) {
            return agySDKBridge.launchChannel(channelId, sessionId, cwd);
        }
        return claudeSDKBridge.launchChannel(channelId, sessionId, cwd);
    }

    public void interruptChannel(String provider, String channelId) {
        if ("codex".equals(provider)) {
            codexSDKBridge.interruptChannel(channelId);
            return;
        }
        if ("agy".equals(provider) && agySDKBridge != null) {
            agySDKBridge.interruptChannel(channelId);
            return;
        }
        claudeSDKBridge.interruptChannel(channelId);
    }

    public List<JsonObject> getSessionMessages(String provider, String sessionId, String cwd) {
        if ("codex".equals(provider)) {
            return codexSDKBridge.getSessionMessages(sessionId, cwd);
        }
        if ("agy".equals(provider) && agySDKBridge != null) {
            return agySDKBridge.getSessionMessages(sessionId, cwd);
        }
        return claudeSDKBridge.getSessionMessages(sessionId, cwd);
    }
}
