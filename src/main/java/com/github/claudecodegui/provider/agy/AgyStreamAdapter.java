package com.github.claudecodegui.provider.agy;

import com.github.claudecodegui.provider.common.MessageCallback;
import com.github.claudecodegui.provider.common.SDKResult;
import com.google.gson.Gson;
import com.google.gson.JsonObject;
import com.intellij.openapi.diagnostic.Logger;

import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicReference;

/**
 * Stream adapter for the agy (Gemini) provider.
 * Parses NDJSON output from the gemini CLI process.
 */
public class AgyStreamAdapter {
    private static final Logger LOG = Logger.getInstance(AgyStreamAdapter.class);
    private final Gson gson;

    public AgyStreamAdapter(Gson gson) {
        this.gson = gson;
    }

    public void processOutputLine(
            String line,
            MessageCallback callback,
            SDKResult result,
            StringBuilder assistantContent,
            AtomicBoolean hadSendError,
            AtomicReference<String> lastError
    ) {
        if (line == null) {
            return;
        }
        String trimmed = line.trim();
        if (trimmed.isEmpty()) {
            return;
        }

        // Check if the line is JSON
        if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
            try {
                JsonObject json = gson.fromJson(trimmed, JsonObject.class);
                if (json.has("type")) {
                    String type = json.get("type").getAsString();
                    
                    if ("init".equals(type)) {
                        if (json.has("session_id")) {
                            String sessionId = json.get("session_id").getAsString();
                            callback.onMessage("session_id", sessionId);
                        }
                    } else if ("message".equals(type)) {
                        String role = json.has("role") ? json.get("role").getAsString() : "";
                        if ("assistant".equals(role)) {
                            String content = json.has("content") ? json.get("content").getAsString() : "";
                            boolean delta = json.has("delta") && json.get("delta").getAsBoolean();
                            if (delta) {
                                callback.onMessage("content_delta", content);
                            } else {
                                callback.onMessage("content", content);
                            }
                        } else if ("thinking".equals(role)) {
                            String content = json.has("content") ? json.get("content").getAsString() : "";
                            callback.onMessage("thinking_delta", content);
                        }
                    } else if ("thinking_start".equals(type)) {
                        callback.onMessage("stream_start", "");
                    } else if ("thinking_delta".equals(type)) {
                        String delta = json.has("delta") ? json.get("delta").getAsString() : "";
                        callback.onMessage("thinking_delta", delta);
                    } else if ("content_delta".equals(type)) {
                        String delta = json.has("delta") ? json.get("delta").getAsString() : "";
                        callback.onMessage("content_delta", delta);
                    } else if ("tool_use".equals(type)) {
                        if (json.has("tool_name")) {
                            callback.onMessage("status", "Executing tool: " + json.get("tool_name").getAsString());
                        }
                    } else if ("done".equals(type) || "result".equals(type)) {
                        callback.onMessage("stream_end", "");
                    }
                }
            } catch (Exception e) {
                LOG.debug("Failed to parse JSON line: " + trimmed + ", error: " + e.getMessage());
            }
        } else {
            // Non-JSON line
            if (trimmed.startsWith("Error:") || trimmed.startsWith("Error starting session") || trimmed.startsWith("Error resuming session")) {
                lastError.set(trimmed);
                hadSendError.set(true);
                callback.onError(trimmed);
            } else {
                LOG.debug("gemini CLI log: " + trimmed);
            }
        }
    }
}
