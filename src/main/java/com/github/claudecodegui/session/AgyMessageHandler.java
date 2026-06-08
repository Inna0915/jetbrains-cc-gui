package com.github.claudecodegui.session;

/**
 * Agy message callback handler.
 * The Python SDK runner emits the same normalized message shapes as the Codex
 * bridge, with [THREAD_ID] mapped to the session_id callback.
 */
public class AgyMessageHandler extends CodexMessageHandler {
    public AgyMessageHandler(SessionState state, CallbackHandler callbackHandler) {
        super(state, callbackHandler, "Agy");
    }
}
