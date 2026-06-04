package com.github.claudecodegui.provider.agy;

import com.github.claudecodegui.bridge.ProcessManager;
import com.github.claudecodegui.provider.common.MessageCallback;
import com.github.claudecodegui.provider.common.SDKResult;
import com.google.gson.Gson;
import com.google.gson.JsonObject;
import com.intellij.openapi.diagnostic.Logger;
import com.intellij.openapi.project.Project;

import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CompletableFuture;

/**
 * SDK Bridge for the agy (Gemini) provider.
 */
public class AgySDKBridge {
    private static final Logger LOG = Logger.getInstance(AgySDKBridge.class);
    private final Gson gson = new Gson();
    private final AgyStreamAdapter streamAdapter;
    private final ProcessManager processManager;
    private final AgyProcessInvoker processInvoker;

    public AgySDKBridge(Project project) {
        this.streamAdapter = new AgyStreamAdapter(gson);
        this.processManager = new ProcessManager();
        this.processInvoker = new AgyProcessInvoker(project, gson, streamAdapter, processManager);
    }

    public CompletableFuture<SDKResult> sendMessage(
            String channelId,
            String message,
            String sessionId,
            String cwd,
            String permissionMode,
            String model,
            MessageCallback callback
    ) {
        return processInvoker.sendMessage(channelId, message, sessionId, cwd, permissionMode, model, callback);
    }

    public JsonObject launchChannel(String channelId, String sessionId, String cwd) {
        JsonObject result = new JsonObject();
        result.addProperty("success", true);
        if (sessionId != null) {
            result.addProperty("sessionId", sessionId);
        }
        result.addProperty("channelId", channelId);
        result.addProperty("message", "agy channel ready");
        return result;
    }

    public void interruptChannel(String channelId) {
        LOG.info("Interrupting channel: " + channelId);
        processManager.interruptChannel(channelId);
    }

    public List<JsonObject> getSessionMessages(String sessionId, String cwd) {
        return new ArrayList<>();
    }
}
