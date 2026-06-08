package com.github.claudecodegui.dependency;

import java.util.Arrays;
import java.util.Collections;
import java.util.List;

/**
 * SDK definition enum.
 * Defines the installable AI SDK package information.
 */
public enum SdkDefinition {

    CLAUDE_SDK(
        "claude-sdk",
        "Claude Code SDK",
        "@anthropic-ai/claude-agent-sdk",
        "^0.2.58",
        Arrays.asList("@anthropic-ai/sdk", "@anthropic-ai/bedrock-sdk"),
        Arrays.asList("0.2.88", "0.2.81", "0.2.58"),
        "Claude AI 提供商所需，包含 Agent SDK 和 Bedrock 支持。"
    ),

    CODEX_SDK(
        "codex-sdk",
        "Codex SDK",
        "@openai/codex-sdk",
        "latest",
        Collections.emptyList(),
        Arrays.asList("0.117.0", "0.116.0", "0.115.0"),
        "Codex AI 提供商所需。"
    ),

    AGY_SDK(
        "agy-sdk",
        "Antigravity Python SDK",
        "google-antigravity",
        "latest",
        RuntimeType.PIP,
        Collections.emptyList(),
        Arrays.asList("0.1.2"),
        "Agy AI 提供商所需，包含 google-antigravity Python SDK。"
    );

    private final String id;
    private final String displayName;
    private final String packageName;
    private final String version;
    private final RuntimeType runtimeType;
    private final List<String> dependencies;
    private final List<String> fallbackVersions;
    private final String description;

    SdkDefinition(String id, String displayName, String packageName, String version,
                  List<String> dependencies, List<String> fallbackVersions, String description) {
        this(id, displayName, packageName, version, RuntimeType.NPM, dependencies, fallbackVersions, description);
    }

    SdkDefinition(String id, String displayName, String packageName, String version, RuntimeType runtimeType,
                  List<String> dependencies, List<String> fallbackVersions, String description) {
        this.id = id;
        this.displayName = displayName;
        this.packageName = packageName;
        this.version = version;
        this.runtimeType = runtimeType;
        this.dependencies = dependencies;
        this.fallbackVersions = fallbackVersions;
        this.description = description;
    }

    public String getId() {
        return id;
    }

    public String getDisplayName() {
        return displayName;
    }

    public String getPackageName() {
        return packageName;
    }

    public String getNpmPackage() {
        return packageName;
    }

    public String getVersion() {
        return version;
    }

    public RuntimeType getRuntimeType() {
        return runtimeType;
    }

    public List<String> getDependencies() {
        return dependencies;
    }

    public List<String> getFallbackVersions() {
        return fallbackVersions;
    }

    public String getDescription() {
        return description;
    }

    /**
     * Returns the full npm package specifier including the version.
     * For example: @anthropic-ai/claude-agent-sdk@^0.1.76
     */
    public String getFullPackageSpec() {
        return packageName + "@" + version;
    }

    /**
     * Returns all packages to install (main package + dependencies).
     */
    public List<String> getAllPackages() {
        if (dependencies.isEmpty()) {
            return Collections.singletonList(getFullPackageSpec());
        }
        java.util.ArrayList<String> all = new java.util.ArrayList<>();
        all.add(getFullPackageSpec());
        all.addAll(dependencies);
        return all;
    }

    /**
     * Finds an SDK definition by its ID.
     */
    public static SdkDefinition fromId(String id) {
        for (SdkDefinition sdk : values()) {
            if (sdk.getId().equals(id)) {
                return sdk;
            }
        }
        return null;
    }

    /**
     * Finds the corresponding SDK by provider name.
     */
    public static SdkDefinition fromProvider(String provider) {
        if ("claude".equalsIgnoreCase(provider)) {
            return CLAUDE_SDK;
        } else if ("codex".equalsIgnoreCase(provider)) {
            return CODEX_SDK;
        } else if ("agy".equalsIgnoreCase(provider)) {
            return AGY_SDK;
        }
        return null;
    }
}
