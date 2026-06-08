package com.github.claudecodegui.dependency;

import com.github.claudecodegui.util.PlatformUtils;
import com.intellij.openapi.diagnostic.Logger;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.List;
import java.util.concurrent.TimeUnit;

public class PythonDetector {

    private static final Logger LOG = Logger.getInstance(PythonDetector.class);

    public static List<String> getCandidateCommands() {
        if (PlatformUtils.isWindows()) {
            return Arrays.asList("py", "python", "python3");
        }
        return Arrays.asList("python3", "python", "py");
    }

    public List<String> findPythonCommand() {
        for (String candidate : getCandidateCommands()) {
            List<String> command = commandPrefix(candidate);
            List<String> versionCommand = new ArrayList<>(command);
            versionCommand.add("--version");
            if (runsSuccessfully(versionCommand)) {
                return command;
            }
        }
        return Collections.emptyList();
    }

    private static List<String> commandPrefix(String candidate) {
        if ("py".equals(candidate)) {
            return Arrays.asList("py", "-3");
        }
        return Collections.singletonList(candidate);
    }

    private boolean runsSuccessfully(List<String> command) {
        try {
            ProcessBuilder pb = new ProcessBuilder(command);
            pb.redirectErrorStream(true);
            Process process = pb.start();
            try (BufferedReader ignored = new BufferedReader(
                    new InputStreamReader(process.getInputStream(), StandardCharsets.UTF_8))) {
                while (ignored.readLine() != null) {
                    // Drain output to avoid blocking on verbose launchers.
                }
            }
            if (!process.waitFor(10, TimeUnit.SECONDS)) {
                process.destroyForcibly();
                return false;
            }
            return process.exitValue() == 0;
        } catch (Exception e) {
            LOG.debug("[PythonDetector] Candidate failed: " + String.join(" ", command) + " - " + e.getMessage());
            return false;
        }
    }
}
