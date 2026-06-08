package com.github.claudecodegui.session;

import com.github.claudecodegui.provider.agy.AgySDKBridge;
import com.github.claudecodegui.provider.claude.ClaudeSDKBridge;
import com.github.claudecodegui.provider.codex.CodexSDKBridge;
import com.github.claudecodegui.provider.common.MessageCallback;
import com.github.claudecodegui.provider.common.SDKResult;
import com.google.gson.Gson;
import com.google.gson.JsonObject;
import org.junit.Test;

import java.util.List;
import java.util.concurrent.CompletableFuture;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNull;

public class SessionSendServiceTest {

    @Test
    public void normalizeRequestedPermissionModeRejectsBlankAndUnknownValues() {
        assertNull(SessionSendService.normalizeRequestedPermissionMode(null));
        assertNull(SessionSendService.normalizeRequestedPermissionMode(" "));
        assertNull(SessionSendService.normalizeRequestedPermissionMode("dangerouslyAllowEverything"));
    }

    @Test
    public void resolveEffectivePermissionModePrefersRequestedModeWhenValid() {
        assertEquals(
                "acceptEdits",
                SessionSendService.resolveEffectivePermissionMode("claude", "acceptEdits", "default")
        );
    }

    @Test
    public void resolveEffectivePermissionModeFallsBackToSessionModeAndDowngradesCodexPlan() {
        assertEquals(
                "default",
                SessionSendService.resolveEffectivePermissionMode("codex", null, "plan")
        );
        assertEquals(
                "plan",
                SessionSendService.resolveEffectivePermissionMode("agy", null, "plan")
        );
        assertEquals(
                "default",
                SessionSendService.resolveEffectivePermissionMode("claude", null, null)
        );
    }

    @Test
    public void sendMessageToProviderRoutesAgyWithoutTouchingClaudeOrCodex() {
        SessionState state = new SessionState();
        state.setProvider("agy");
        state.setSessionId("conversation-123");
        state.setCwd("G:\\code\\project");
        state.setPermissionMode("plan");
        state.setModel("gemini-3-pro");

        RecordingClaudeBridge claudeBridge = new RecordingClaudeBridge();
        RecordingCodexBridge codexBridge = new RecordingCodexBridge();
        RecordingAgyBridge agyBridge = new RecordingAgyBridge();
        SessionSendService service = new SessionSendService(
                null,
                state,
                new SessionCallbackFacade(null),
                new MessageParser(),
                new MessageMerger(),
                new Gson(),
                claudeBridge,
                codexBridge,
                agyBridge,
                new SessionContextService(null, 100 * 1024)
        );

        service.sendMessageToProvider(
                "channel-1",
                "hello agy",
                List.of(),
                new JsonObject(),
                "Agent instructions",
                List.of(),
                null
        ).join();

        assertEquals(1, agyBridge.sendCount);
        assertEquals("hello agy", agyBridge.message);
        assertEquals("conversation-123", agyBridge.conversationId);
        assertEquals("G:\\code\\project", agyBridge.cwd);
        assertEquals("plan", agyBridge.permissionMode);
        assertEquals("gemini-3-pro", agyBridge.model);
        assertEquals("Agent instructions", agyBridge.agentPrompt);
        assertEquals(0, claudeBridge.sendCount);
        assertEquals(0, codexBridge.sendCount);
    }

    @Test
    public void getCodexRuntimeAccessErrorRequiresAuthorizationOrManagedProvider() {
        assertEquals(
                "Codex local configuration access is not authorized. Please authorize local ~/.codex access or enable a managed Codex provider first.",
                SessionSendService.getCodexRuntimeAccessError("inactive")
        );
        assertNull(SessionSendService.getCodexRuntimeAccessError("managed"));
        assertNull(SessionSendService.getCodexRuntimeAccessError("cli_login"));
    }

    private static class RecordingClaudeBridge extends ClaudeSDKBridge {
        private int sendCount = 0;

        @Override
        public CompletableFuture<SDKResult> sendMessage(
                String channelId,
                String message,
                String sessionId,
                String runtimeSessionEpoch,
                String cwd,
                List<ClaudeSession.Attachment> attachments,
                String permissionMode,
                String model,
                JsonObject openedFiles,
                String agentPrompt,
                Boolean streaming,
                Boolean disableThinking,
                String reasoningEffort,
                MessageCallback callback
        ) {
            sendCount++;
            return CompletableFuture.completedFuture(SDKResult.success("claude"));
        }
    }

    private static class RecordingCodexBridge extends CodexSDKBridge {
        private int sendCount = 0;

        @Override
        public CompletableFuture<SDKResult> sendMessage(
                String channelId,
                String message,
                String threadId,
                String cwd,
                List<ClaudeSession.Attachment> attachments,
                String permissionMode,
                String model,
                String agentPrompt,
                String reasoningEffort,
                MessageCallback callback
        ) {
            sendCount++;
            return CompletableFuture.completedFuture(SDKResult.success("codex"));
        }
    }

    private static class RecordingAgyBridge extends AgySDKBridge {
        private int sendCount = 0;
        private String message;
        private String conversationId;
        private String cwd;
        private String permissionMode;
        private String model;
        private String agentPrompt;

        @Override
        public CompletableFuture<SDKResult> sendMessage(
                String channelId,
                String message,
                String conversationId,
                String cwd,
                List<ClaudeSession.Attachment> attachments,
                String permissionMode,
                String model,
                String agentPrompt,
                MessageCallback callback
        ) {
            sendCount++;
            this.message = message;
            this.conversationId = conversationId;
            this.cwd = cwd;
            this.permissionMode = permissionMode;
            this.model = model;
            this.agentPrompt = agentPrompt;
            return CompletableFuture.completedFuture(SDKResult.success("agy"));
        }
    }
}
