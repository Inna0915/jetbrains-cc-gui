package com.github.claudecodegui.provider.agy;

import com.github.claudecodegui.bridge.ProcessManager;
import com.github.claudecodegui.provider.common.MessageCallback;
import com.github.claudecodegui.provider.common.SDKResult;
import com.github.claudecodegui.settings.CodemossSettingsService;
import com.github.claudecodegui.util.PlatformUtils;
import com.google.gson.Gson;
import com.google.gson.JsonObject;
import com.intellij.openapi.diagnostic.Logger;
import com.intellij.openapi.project.Project;

import java.io.BufferedReader;
import java.io.File;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicReference;

/**
 * Invokes the local gemini CLI binary and directs its stream to the stream adapter.
 */
public class AgyProcessInvoker {
    private static final Logger LOG = Logger.getInstance(AgyProcessInvoker.class);
    
    private final Project project;
    private final Gson gson;
    private final AgyStreamAdapter streamAdapter;
    private final ProcessManager processManager;
    private final CodemossSettingsService settingsService;

    public AgyProcessInvoker(Project project, Gson gson, AgyStreamAdapter streamAdapter, ProcessManager processManager) {
        this.project = project;
        this.gson = gson;
        this.streamAdapter = streamAdapter;
        this.processManager = processManager;
        this.settingsService = new CodemossSettingsService();
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
        return CompletableFuture.supplyAsync(() -> {
            SDKResult result = new SDKResult();
            StringBuilder assistantContent = new StringBuilder();
            AtomicBoolean hadSendError = new AtomicBoolean(false);
            AtomicReference<String> lastError = new AtomicReference<>(null);

            try {
                // Read configuration
                JsonObject agyConfig = new JsonObject();
                try {
                    JsonObject rootConfig = settingsService.readConfig();
                    if (rootConfig.has("agy") && rootConfig.get("agy").isJsonObject()) {
                        agyConfig = rootConfig.getAsJsonObject("agy");
                    }
                } catch (Exception e) {
                    LOG.warn("Failed to read agy config: " + e.getMessage());
                }

                String executablePath = agyConfig.has("executablePath") && !agyConfig.get("executablePath").isJsonNull()
                        ? agyConfig.get("executablePath").getAsString().trim() : "";
                if (executablePath.isEmpty()) {
                    executablePath = "gemini";
                }

                String apiKey = agyConfig.has("apiKey") && !agyConfig.get("apiKey").isJsonNull()
                        ? agyConfig.get("apiKey").getAsString().trim() : "";

                // Map permission mode
                String approvalMode = "default";
                if ("bypassPermissions".equals(permissionMode)) {
                    approvalMode = "yolo";
                } else if ("autoEdit".equals(permissionMode)) {
                    approvalMode = "auto_edit";
                } else if ("plan".equals(permissionMode)) {
                    approvalMode = "plan";
                }

                boolean resume = checkSessionExists(sessionId);

                List<String> command = new ArrayList<>();
                command.add(executablePath);
                if (resume) {
                    command.add("--resume");
                    command.add(sessionId);
                } else {
                    command.add("--session-id");
                    command.add(sessionId);
                }
                command.add("--skip-trust");
                command.add("-o");
                command.add("stream-json");
                command.add("-m");
                command.add(model != null ? model : "gemini-1.5-pro");
                command.add("--approval-mode");
                command.add(approvalMode);
                command.add("-p");
                command.add(message);

                LOG.info("Spawning gemini CLI command: " + String.join(" ", command));

                ProcessBuilder pb = new ProcessBuilder(command);

                // Set working directory
                if (cwd != null && !cwd.isEmpty()) {
                    File workingDir = new File(cwd);
                    if (workingDir.exists() && workingDir.isDirectory()) {
                        pb.directory(workingDir);
                    }
                }

                // Configure environment
                Map<String, String> env = pb.environment();
                if (!apiKey.isEmpty()) {
                    env.put("GEMINI_API_KEY", apiKey);
                }

                pb.redirectErrorStream(true);

                Process process = pb.start();
                processManager.registerProcess(channelId, process);

                try {
                    // Read output
                    try (BufferedReader reader = new BufferedReader(
                            new InputStreamReader(process.getInputStream(), StandardCharsets.UTF_8))) {
                        String line;
                        while ((line = reader.readLine()) != null) {
                            streamAdapter.processOutputLine(line, callback, result, assistantContent, hadSendError, lastError);
                        }
                    }

                    process.waitFor();
                    int exitCode = process.exitValue();

                    if (exitCode != 0) {
                        String err = lastError.get();
                        if (resume && err != null && (err.contains("Invalid session identifier") || err.contains("resuming session"))) {
                            LOG.warn("Resume failed for session: " + sessionId + ". Retrying as a new session.");
                            // Retry as a new session!
                            return sendMessageRetryAsNew(executablePath, apiKey, message, sessionId, cwd, approvalMode, model, channelId, callback);
                        }

                        if (!hadSendError.get()) {
                            String errorMsg = "gemini CLI process exited with code " + exitCode;
                            if (err != null && !err.isEmpty()) {
                                errorMsg += "\nDetails: " + err;
                            }
                            result.success = false;
                            result.error = errorMsg;
                            callback.onError(errorMsg);
                        }
                    } else {
                        result.success = true;
                        result.finalResult = assistantContent.toString();
                        callback.onComplete(result);
                    }

                    return result;
                } finally {
                    processManager.unregisterProcess(channelId, process);
                }
            } catch (Exception e) {
                result.success = false;
                result.error = e.getMessage();
                callback.onError(e.getMessage());
                return result;
            }
        });
    }

    private SDKResult sendMessageRetryAsNew(
            String executablePath,
            String apiKey,
            String message,
            String sessionId,
            String cwd,
            String approvalMode,
            String model,
            String channelId,
            MessageCallback callback
    ) {
        SDKResult result = new SDKResult();
        StringBuilder assistantContent = new StringBuilder();
        AtomicBoolean hadSendError = new AtomicBoolean(false);
        AtomicReference<String> lastError = new AtomicReference<>(null);

        try {
            List<String> command = new ArrayList<>();
            command.add(executablePath);
            command.add("--session-id");
            command.add(sessionId);
            command.add("--skip-trust");
            command.add("-o");
            command.add("stream-json");
            command.add("-m");
            command.add(model != null ? model : "gemini-1.5-pro");
            command.add("--approval-mode");
            command.add(approvalMode);
            command.add("-p");
            command.add(message);

            LOG.info("Retrying: spawning gemini CLI command: " + String.join(" ", command));

            ProcessBuilder pb = new ProcessBuilder(command);

            if (cwd != null && !cwd.isEmpty()) {
                File workingDir = new File(cwd);
                if (workingDir.exists() && workingDir.isDirectory()) {
                    pb.directory(workingDir);
                }
            }

            Map<String, String> env = pb.environment();
            if (!apiKey.isEmpty()) {
                env.put("GEMINI_API_KEY", apiKey);
            }

            pb.redirectErrorStream(true);

            Process process = pb.start();
            processManager.registerProcess(channelId, process);

            try {
                try (BufferedReader reader = new BufferedReader(
                        new InputStreamReader(process.getInputStream(), StandardCharsets.UTF_8))) {
                    String line;
                    while ((line = reader.readLine()) != null) {
                        streamAdapter.processOutputLine(line, callback, result, assistantContent, hadSendError, lastError);
                    }
                }

                process.waitFor();
                int exitCode = process.exitValue();

                if (exitCode != 0) {
                    if (!hadSendError.get()) {
                        String errorMsg = "gemini CLI process exited with code " + exitCode;
                        String err = lastError.get();
                        if (err != null && !err.isEmpty()) {
                            errorMsg += "\nDetails: " + err;
                        }
                        result.success = false;
                        result.error = errorMsg;
                        callback.onError(errorMsg);
                    }
                } else {
                    result.success = true;
                    result.finalResult = assistantContent.toString();
                    callback.onComplete(result);
                }

                return result;
            } finally {
                processManager.unregisterProcess(channelId, process);
            }
        } catch (Exception e) {
            result.success = false;
            result.error = e.getMessage();
            callback.onError(e.getMessage());
            return result;
        }
    }

    private boolean checkSessionExists(String sessionId) {
        try {
            File geminiHome = new File(PlatformUtils.getHomeDirectory(), ".gemini");
            File tmpDir = new File(geminiHome, "tmp");
            if (!tmpDir.exists() || !tmpDir.isDirectory()) {
                return false;
            }
            File[] projectDirs = tmpDir.listFiles(File::isDirectory);
            if (projectDirs == null) {
                return false;
            }
            for (File projectDir : projectDirs) {
                File chatsDir = new File(projectDir, "chats");
                if (chatsDir.exists() && chatsDir.isDirectory()) {
                    File[] files = chatsDir.listFiles((dir, name) -> name.endsWith(".jsonl"));
                    if (files != null) {
                        for (File file : files) {
                            try (BufferedReader reader = new BufferedReader(new java.io.FileReader(file))) {
                                String firstLine = reader.readLine();
                                if (firstLine != null && firstLine.contains("\"session_id\":\"" + sessionId + "\"")) {
                                    return true;
                                }
                            } catch (Exception e) {
                                // ignore
                            }
                        }
                    }
                }
            }
        } catch (Exception e) {
            LOG.warn("Failed to check if session exists: " + e.getMessage());
        }
        return false;
    }
}
