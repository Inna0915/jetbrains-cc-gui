package com.github.claudecodegui.provider.agy;

import com.github.claudecodegui.dependency.DependencyManager;
import com.github.claudecodegui.dependency.PythonDependencyManager;
import com.github.claudecodegui.dependency.SdkDefinition;
import com.github.claudecodegui.provider.common.BaseSDKBridge;
import com.github.claudecodegui.provider.common.MessageCallback;
import com.github.claudecodegui.provider.common.SDKResult;
import com.github.claudecodegui.session.ClaudeSession;
import com.github.claudecodegui.settings.CodemossSettingsService;
import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;

import java.nio.file.Path;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicReference;
import java.util.function.Supplier;

/**
 * Agy SDK bridge.
 * Routes Java requests through the shared Node channel and into the managed
 * google-antigravity Python SDK runner.
 */
public class AgySDKBridge extends BaseSDKBridge {
    private final PythonDependencyManager pythonDependencyManager;
    private final Supplier<String> geminiApiKeySupplier;

    public AgySDKBridge() {
        this(
                new PythonDependencyManager(new DependencyManager().getDependenciesDir()),
                AgySDKBridge::loadConfiguredGeminiApiKey
        );
    }

    AgySDKBridge(PythonDependencyManager pythonDependencyManager) {
        this(pythonDependencyManager, AgySDKBridge::loadConfiguredGeminiApiKey);
    }

    AgySDKBridge(PythonDependencyManager pythonDependencyManager, Supplier<String> geminiApiKeySupplier) {
        super(AgySDKBridge.class);
        this.pythonDependencyManager = pythonDependencyManager;
        this.geminiApiKeySupplier = geminiApiKeySupplier;
    }

    @Override
    protected String getProviderName() {
        return "agy";
    }

    @Override
    protected void configureProviderEnv(Map<String, String> env, String stdinJson) {
        env.put("AGY_USE_STDIN", "true");
        Path pythonPath = pythonDependencyManager.getVenvPython(SdkDefinition.AGY_SDK.getId());
        env.put("AGY_PYTHON_PATH", pythonPath.toString());
        String apiKey = resolveGeminiApiKey();
        if (!apiKey.isEmpty()) {
            env.put("GEMINI_API_KEY", apiKey);
        }
    }

    @Override
    protected void processOutputLine(
            String line,
            MessageCallback callback,
            SDKResult result,
            StringBuilder assistantContent,
            AtomicBoolean hadSendError,
            AtomicReference<String> lastNodeError
    ) {
        if (line.contains("[DEBUG]")) {
            LOG.debug("[Agy] " + line);
        }

        if (line.startsWith("[MESSAGE_START]")) {
            callback.onMessage("message_start", "");
        } else if (line.startsWith("[STREAM_START]")) {
            callback.onMessage("stream_start", "");
        } else if (line.startsWith("[STREAM_END]")) {
            callback.onMessage("stream_end", "");
        } else if (line.startsWith("[MESSAGE_END]")) {
            callback.onMessage("message_end", "");
        } else if (line.startsWith("[THREAD_ID]")) {
            String receivedConversationId = line.substring("[THREAD_ID]".length()).trim();
            callback.onMessage("session_id", receivedConversationId);
        } else if (line.startsWith("[MESSAGE]")) {
            handleMessageLine(line, callback, result, assistantContent);
        } else if (line.startsWith("[CONTENT_DELTA]")) {
            String delta = decodeJsonStringPayload(line.substring("[CONTENT_DELTA]".length()));
            assistantContent.append(delta);
            callback.onMessage("content_delta", delta);
        } else if (line.startsWith("[THINKING_DELTA]")) {
            String delta = decodeJsonStringPayload(line.substring("[THINKING_DELTA]".length()));
            callback.onMessage("thinking_delta", delta);
        } else if (line.startsWith("[CONTENT]")) {
            String content = line.substring("[CONTENT]".length()).trim();
            if (!assistantContent.toString().contains(content)) {
                assistantContent.append(content);
            }
            callback.onMessage("content", content);
        } else if (line.startsWith("[SEND_ERROR]")) {
            handleSendErrorLine(line, callback, result, hadSendError);
        }
    }

    public CompletableFuture<SDKResult> sendMessage(
            String channelId,
            String message,
            String conversationId,
            String cwd,
            List<ClaudeSession.Attachment> attachments,
            String permissionMode,
            String model,
            String agentPrompt,
            String reasoningEffort,
            MessageCallback callback
    ) {
        JsonObject stdinInput = new JsonObject();
        stdinInput.addProperty("message", message != null ? message : "");
        stdinInput.addProperty("conversationId", conversationId != null ? conversationId : "");
        stdinInput.addProperty("cwd", cwd != null ? cwd : "");
        stdinInput.addProperty("permissionMode", permissionMode != null ? permissionMode : "default");
        stdinInput.addProperty("model", model != null ? model : "");
        String apiKey = resolveGeminiApiKey();
        if (!apiKey.isEmpty()) {
            stdinInput.addProperty("apiKey", apiKey);
        }
        stdinInput.add("attachments", buildAttachments(attachments));
        if (agentPrompt != null && !agentPrompt.isEmpty()) {
            stdinInput.addProperty("agentPrompt", agentPrompt);
        }
        if (reasoningEffort != null && !reasoningEffort.isEmpty()) {
            stdinInput.addProperty("reasoningEffort", reasoningEffort);
        }

        String stdinJson = gson.toJson(stdinInput);
        List<String> command = buildBaseCommand("send");
        return executeStreamingCommand(channelId, command, stdinJson, cwd, callback);
    }

    private String resolveGeminiApiKey() {
        try {
            String value = geminiApiKeySupplier != null ? geminiApiKeySupplier.get() : null;
            return value == null ? "" : value.trim();
        } catch (Exception e) {
            LOG.warn("[Agy] Failed to resolve configured Gemini API key: " + e.getMessage());
            return "";
        }
    }

    private static String loadConfiguredGeminiApiKey() {
        try {
            return new CodemossSettingsService().getAgyGeminiApiKey();
        } catch (Exception e) {
            return "";
        }
    }

    public List<JsonObject> getSessionMessages(String sessionId, String cwd) {
        return List.of();
    }

    private void handleMessageLine(
            String line,
            MessageCallback callback,
            SDKResult result,
            StringBuilder assistantContent
    ) {
        String jsonStr = line.substring("[MESSAGE]".length()).trim();
        try {
            JsonObject msg = gson.fromJson(jsonStr, JsonObject.class);
            if (msg == null) {
                return;
            }

            String msgType = msg.has("type") && !msg.get("type").isJsonNull()
                    ? msg.get("type").getAsString()
                    : "unknown";

            if ("status".equals(msgType)) {
                String status = "";
                if (msg.has("message") && !msg.get("message").isJsonNull()) {
                    JsonElement statusEl = msg.get("message");
                    status = statusEl.isJsonPrimitive() ? statusEl.getAsString() : statusEl.toString();
                }
                if (status != null && !status.isEmpty()) {
                    callback.onMessage("status", status);
                }
                return;
            }

            result.messages.add(msg);
            if ("assistant".equals(msgType)) {
                String extracted = extractAssistantText(msg);
                if (extracted != null && !extracted.isEmpty()) {
                    assistantContent.append(extracted);
                }
            }
            callback.onMessage(msgType, jsonStr);
        } catch (Exception ignored) {
        }
    }

    private void handleSendErrorLine(
            String line,
            MessageCallback callback,
            SDKResult result,
            AtomicBoolean hadSendError
    ) {
        String jsonStr = line.substring("[SEND_ERROR]".length()).trim();
        String errorMessage = jsonStr;
        try {
            JsonObject obj = gson.fromJson(jsonStr, JsonObject.class);
            if (obj.has("error")) {
                errorMessage = obj.get("error").getAsString();
            }
        } catch (Exception ignored) {
        }

        hadSendError.set(true);
        result.success = false;
        result.error = errorMessage;
        callback.onError(errorMessage);
    }

    private String decodeJsonStringPayload(String rawPayload) {
        String jsonStr = rawPayload.startsWith(" ") ? rawPayload.substring(1) : rawPayload;
        try {
            String decoded = gson.fromJson(jsonStr, String.class);
            return decoded != null ? decoded : "";
        } catch (Exception e) {
            LOG.warn("[AgySDKBridge] Failed to decode JSON string payload, falling back to raw: " + e.getMessage());
            return jsonStr;
        }
    }

    private JsonArray buildAttachments(List<ClaudeSession.Attachment> attachments) {
        JsonArray result = new JsonArray();
        if (attachments == null || attachments.isEmpty()) {
            return result;
        }

        for (ClaudeSession.Attachment attachment : attachments) {
            if (attachment == null) {
                continue;
            }
            JsonObject item = new JsonObject();
            item.addProperty("fileName", attachment.fileName != null ? attachment.fileName : "");
            item.addProperty("mediaType", attachment.mediaType != null ? attachment.mediaType : "");
            item.addProperty("data", attachment.data != null ? attachment.data : "");
            result.add(item);
        }
        return result;
    }

    private String extractAssistantText(JsonObject msg) {
        if (msg == null || !msg.has("message") || !msg.get("message").isJsonObject()) {
            return "";
        }

        JsonObject message = msg.getAsJsonObject("message");
        if (!message.has("content") || message.get("content").isJsonNull()) {
            return "";
        }

        JsonElement contentEl = message.get("content");
        if (contentEl.isJsonPrimitive()) {
            return contentEl.getAsString();
        }
        if (!contentEl.isJsonArray()) {
            return "";
        }

        JsonArray arr = contentEl.getAsJsonArray();
        StringBuilder sb = new StringBuilder();
        for (JsonElement el : arr) {
            if (!el.isJsonObject()) {
                continue;
            }
            JsonObject block = el.getAsJsonObject();
            if (!block.has("type") || block.get("type").isJsonNull()) {
                continue;
            }
            String type = block.get("type").getAsString();
            if ("text".equals(type) && block.has("text") && !block.get("text").isJsonNull()) {
                if (sb.length() > 0) {
                    sb.append("\n");
                }
                sb.append(block.get("text").getAsString());
            }
        }
        return sb.toString();
    }
}
