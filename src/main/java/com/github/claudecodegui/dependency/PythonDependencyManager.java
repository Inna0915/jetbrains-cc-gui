package com.github.claudecodegui.dependency;

import com.github.claudecodegui.util.PlatformUtils;
import com.intellij.openapi.diagnostic.Logger;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.List;
import java.util.concurrent.TimeUnit;
import java.util.function.Consumer;

public class PythonDependencyManager {

    private static final Logger LOG = Logger.getInstance(PythonDependencyManager.class);
    private static final String INSTALLED_MARKER = ".installed";

    private final Path dependenciesDir;
    private final PythonDetector pythonDetector;

    public PythonDependencyManager(Path dependenciesDir) {
        this(dependenciesDir, new PythonDetector());
    }

    public PythonDependencyManager(Path dependenciesDir, PythonDetector pythonDetector) {
        this.dependenciesDir = dependenciesDir;
        this.pythonDetector = pythonDetector;
    }

    public Path getAgyVenvDir() {
        return getSdkDir(SdkDefinition.AGY_SDK.getId()).resolve(".venv");
    }

    public Path getSdkDir(String sdkId) {
        return dependenciesDir.resolve(sdkId);
    }

    public Path getVenvDir(String sdkId) {
        return getSdkDir(sdkId).resolve(".venv");
    }

    public Path getVenvPython(String sdkId) {
        Path venvDir = getVenvDir(sdkId);
        if (PlatformUtils.isWindows()) {
            return venvDir.resolve("Scripts").resolve("python.exe");
        }
        return venvDir.resolve("bin").resolve("python");
    }

    public boolean isInstalled(SdkDefinition sdk) {
        return getInstalledVersion(sdk) != null;
    }

    public String getInstalledVersion(SdkDefinition sdk) {
        if (sdk == null || sdk.getRuntimeType() != RuntimeType.PIP) {
            return null;
        }

        Path python = getVenvPython(sdk.getId());
        if (!Files.exists(python)) {
            return null;
        }

        ProcessResult result = runCommand(
                List.of(python.toString(), "-m", "pip", "show", sdk.getPackageName()),
                getSdkDir(sdk.getId()),
                30,
                null
        );
        if (result.exitCode != 0) {
            return null;
        }

        for (String line : result.output.split("\\R")) {
            if (line.startsWith("Version:")) {
                String version = line.substring("Version:".length()).trim();
                return version.isEmpty() ? null : version;
            }
        }
        return null;
    }

    public String getLatestVersion(SdkDefinition sdk) {
        if (sdk == null || sdk.getFallbackVersions().isEmpty()) {
            return null;
        }
        return sdk.getFallbackVersions().get(0);
    }

    public List<String> getAvailableVersions(SdkDefinition sdk) {
        return Collections.emptyList();
    }

    public InstallResult installSdkSync(SdkDefinition sdk, String requestedVersion, Consumer<String> logCallback) {
        if (sdk == null) {
            return InstallResult.failure("unknown", "Unknown SDK", "");
        }

        StringBuilder logs = new StringBuilder();
        Consumer<String> log = (message) -> {
            logs.append(message).append("\n");
            if (logCallback != null) {
                logCallback.accept(message);
            }
        };

        try {
            ensureSafeSdkPath(sdk.getId());

            Path sdkDir = getSdkDir(sdk.getId());
            Files.createDirectories(sdkDir);
            log.accept("Starting installation of " + sdk.getDisplayName() + "...");
            log.accept("Created directory: " + sdkDir);

            List<String> pythonCommand = pythonDetector.findPythonCommand();
            if (pythonCommand.isEmpty()) {
                return InstallResult.failure(
                        sdk.getId(),
                        "Python 3 not found. Please install Python 3.11+ and make it available on PATH.",
                        logs.toString()
                );
            }

            Path venvDir = getVenvDir(sdk.getId());
            List<String> createVenvCommand = new ArrayList<>(pythonCommand);
            createVenvCommand.add("-m");
            createVenvCommand.add("venv");
            createVenvCommand.add(venvDir.toString());
            log.accept("Creating Python virtual environment...");
            ProcessResult venvResult = runCommand(createVenvCommand, sdkDir, 120, log);
            if (venvResult.exitCode != 0) {
                return InstallResult.failure(sdk.getId(), "Python venv creation failed", logs.toString());
            }

            Path venvPython = getVenvPython(sdk.getId());
            log.accept("Upgrading pip...");
            ProcessResult pipUpgrade = runCommand(
                    List.of(venvPython.toString(), "-m", "pip", "install", "--upgrade", "pip"),
                    sdkDir,
                    180,
                    log
            );
            if (pipUpgrade.exitCode != 0) {
                return InstallResult.failure(sdk.getId(), "pip upgrade failed", logs.toString());
            }

            String packageSpec = buildPackageSpec(sdk, requestedVersion);
            log.accept("Installing package: " + packageSpec);
            ProcessResult pipInstall = runCommand(
                    List.of(venvPython.toString(), "-m", "pip", "install", packageSpec),
                    sdkDir,
                    300,
                    log
            );
            if (pipInstall.exitCode != 0) {
                return InstallResult.failure(sdk.getId(), "pip install failed", logs.toString());
            }

            String installedVersion = getInstalledVersion(sdk);
            if (installedVersion == null || installedVersion.isEmpty()) {
                installedVersion = "unknown";
            }
            Files.writeString(sdkDir.resolve(INSTALLED_MARKER), installedVersion, StandardCharsets.UTF_8);

            log.accept("Installation completed successfully!");
            log.accept("Installed version: " + installedVersion);
            return InstallResult.success(sdk.getId(), installedVersion, logs.toString());
        } catch (Exception e) {
            LOG.error("[PythonDependencyManager] Installation failed: " + e.getMessage(), e);
            log.accept("ERROR: " + e.getMessage());
            return InstallResult.failure(sdk.getId(), e.getMessage(), logs.toString());
        }
    }

    public boolean uninstallSdk(String sdkId) {
        try {
            ensureSafeSdkPath(sdkId);
            Path sdkDir = getSdkDir(sdkId);
            if (!Files.exists(sdkDir)) {
                return true;
            }

            Files.walk(sdkDir)
                    .sorted(Comparator.reverseOrder())
                    .forEach(path -> {
                        try {
                            Files.delete(path);
                        } catch (IOException e) {
                            throw new RuntimeException(e);
                        }
                    });
            return true;
        } catch (Exception e) {
            LOG.error("[PythonDependencyManager] Failed to uninstall SDK: " + e.getMessage(), e);
            return false;
        }
    }

    private void ensureSafeSdkPath(String sdkId) throws IOException {
        Path normalizedSdkDir = getSdkDir(sdkId).normalize().toAbsolutePath();
        Path normalizedDepsDir = dependenciesDir.normalize().toAbsolutePath();
        if (!normalizedSdkDir.startsWith(normalizedDepsDir)) {
            throw new IOException("Security error: SDK directory path is outside dependencies directory");
        }
    }

    private String buildPackageSpec(SdkDefinition sdk, String requestedVersion) {
        String normalized = DependencyManager.normalizeRequestedVersion(requestedVersion);
        if (normalized != null) {
            return sdk.getPackageName() + "==" + normalized;
        }
        return sdk.getPackageName();
    }

    private ProcessResult runCommand(List<String> command, Path directory, int timeoutSeconds, Consumer<String> log) {
        StringBuilder output = new StringBuilder();
        try {
            ProcessBuilder pb = new ProcessBuilder(command);
            pb.directory(directory.toFile());
            pb.redirectErrorStream(true);
            Process process = pb.start();

            try (BufferedReader reader = new BufferedReader(
                    new InputStreamReader(process.getInputStream(), StandardCharsets.UTF_8))) {
                String line;
                while ((line = reader.readLine()) != null) {
                    output.append(line).append("\n");
                    if (log != null) {
                        log.accept(line);
                    }
                }
            }

            if (!process.waitFor(timeoutSeconds, TimeUnit.SECONDS)) {
                process.destroyForcibly();
                return new ProcessResult(-1, output.toString());
            }

            return new ProcessResult(process.exitValue(), output.toString());
        } catch (Exception e) {
            output.append(e.getMessage()).append("\n");
            if (log != null) {
                log.accept("ERROR: " + e.getMessage());
            }
            return new ProcessResult(-1, output.toString());
        }
    }

    private static class ProcessResult {
        private final int exitCode;
        private final String output;

        private ProcessResult(int exitCode, String output) {
            this.exitCode = exitCode;
            this.output = output;
        }
    }
}
