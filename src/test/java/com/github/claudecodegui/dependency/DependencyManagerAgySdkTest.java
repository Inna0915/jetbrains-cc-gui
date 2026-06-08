package com.github.claudecodegui.dependency;

import org.junit.Test;

import java.util.Collections;

import static org.junit.Assert.assertEquals;

public class DependencyManagerAgySdkTest {
    @Test
    public void shouldDefineAgySdkMetadata() {
        assertEquals(SdkDefinition.AGY_SDK, SdkDefinition.fromProvider("agy"));
        assertEquals("agy-sdk", SdkDefinition.fromId("agy-sdk").getId());
        assertEquals("google-antigravity", SdkDefinition.AGY_SDK.getPackageName());
        assertEquals(RuntimeType.PIP, SdkDefinition.AGY_SDK.getRuntimeType());
    }

    @Test
    public void shouldUseFallbackVersionsForAgyWhenRemoteVersionsAreUnavailable() {
        DependencyManager manager = new DependencyManager();

        assertEquals(Collections.singletonList("0.1.2"), manager.getFallbackVersions("agy-sdk"));
        assertEquals(Collections.emptyList(), manager.getAvailableVersions("agy-sdk"));
        assertEquals("0.1.2", manager.getLatestVersion("agy-sdk"));
    }
}
