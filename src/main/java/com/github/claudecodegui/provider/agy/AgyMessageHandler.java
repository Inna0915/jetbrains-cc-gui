package com.github.claudecodegui.provider.agy;

import com.github.claudecodegui.provider.common.MessageCallback;
import com.github.claudecodegui.provider.common.SDKResult;
import com.github.claudecodegui.session.CallbackHandler;
import com.github.claudecodegui.session.ClaudeSession;
import com.github.claudecodegui.session.SessionState;
import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import com.intellij.openapi.project.Project;
import com.intellij.openapi.diagnostic.Logger;

/**
 * Handles callbacks from AgyStreamAdapter and pipes them into the active chat session.
 */
public class AgyMessageHandler implements MessageCallback {
    private static final Logger LOG = Logger.getInstance(AgyMessageHandler.class);

    private final Project project;
    private final SessionState state;
    private final CallbackHandler callbackHandler;

    private final StringBuilder assistantContent = new StringBuilder();
    private final StringBuilder thinkingContent = new StringBuilder();
    private ClaudeSession.Message currentAssistantMessage = null;
    private boolean isThinking = false;
    private boolean isStreaming = false;

    public AgyMessageHandler(Project project, SessionState state, CallbackHandler callbackHandler) {
        this.project = project;
        this.state = state;
        this.callbackHandler = callbackHandler;
    }

    @Override
    public void onMessage(String type, String content) {
        LOG.debug("AgyMessageHandler.onMessage: type=" + type + ", len=" + (content != null ? content.length() : 0));

        if ("stream_start".equals(type)) {
            isStreaming = true;
            isThinking = true;
            callbackHandler.notifyStreamStart();
            callbackHandler.notifyThinkingStatusChanged(true);
            com.github.claudecodegui.notifications.ClaudeNotifier.setWaiting(project);
        } else if ("stream_end".equals(type) || "message_end".equals(type)) {
            isStreaming = false;
            if (isThinking) {
                isThinking = false;
                callbackHandler.notifyThinkingStatusChanged(false);
            }
            callbackHandler.notifyStreamEnd();
            com.github.claudecodegui.notifications.ClaudeNotifier.clearStatus(project);
            callbackHandler.notifyMessageUpdate(state.getMessages());
        } else if ("session_id".equals(type)) {
            if (content != null && !content.isEmpty()) {
                state.setSessionId(content);
                callbackHandler.notifySessionIdReceived(content);
            }
        } else if ("thinking_delta".equals(type)) {
            if (content != null && !content.isEmpty()) {
                thinkingContent.append(content);
                callbackHandler.notifyThinkingDelta(content);
            }
        } else if ("content_delta".equals(type) || "content".equals(type)) {
            if (content != null && !content.isEmpty()) {
                if (isThinking) {
                    isThinking = false;
                    callbackHandler.notifyThinkingStatusChanged(false);
                    com.github.claudecodegui.notifications.ClaudeNotifier.setGenerating(project);
                }
                assistantContent.append(content);
                ensureCurrentAssistantMessageExists();
                currentAssistantMessage.content = assistantContent.toString();
                callbackHandler.notifyContentDelta(content);
                if (!isStreaming) {
                    callbackHandler.notifyMessageUpdate(state.getMessages());
                }
            }
        } else if ("status".equals(type)) {
            if (content != null && !content.isEmpty()) {
                callbackHandler.notifyStatusMessage(content);
            }
        }
    }

    @Override
    public void onError(String error) {
        isStreaming = false;
        isThinking = false;
        com.github.claudecodegui.notifications.ClaudeNotifier.clearStatus(project);
        
        ClaudeSession.Message errorMessage = new ClaudeSession.Message(
                ClaudeSession.Message.Type.ERROR, 
                error != null ? error : "Unknown error occurred"
        );
        state.addMessage(errorMessage);
        state.setError(error);
        state.setBusy(false);
        state.setLoading(false);
        callbackHandler.notifyStateChange(false, false, error);
        callbackHandler.notifyMessageUpdate(state.getMessages());
    }

    @Override
    public void onComplete(SDKResult result) {
        isStreaming = false;
        isThinking = false;
        com.github.claudecodegui.notifications.ClaudeNotifier.clearStatus(project);
        
        state.setBusy(false);
        state.setLoading(false);
        callbackHandler.notifyStateChange(false, false, null);
        callbackHandler.notifyMessageUpdate(state.getMessages());
    }

    private void ensureCurrentAssistantMessageExists() {
        if (currentAssistantMessage == null) {
            JsonObject raw = new JsonObject();
            raw.addProperty("type", "assistant");
            JsonObject messageObj = new JsonObject();
            messageObj.add("content", new JsonArray());
            raw.add("message", messageObj);
            currentAssistantMessage = new ClaudeSession.Message(ClaudeSession.Message.Type.ASSISTANT, "", raw);
            state.addMessage(currentAssistantMessage);
        }
    }
}
