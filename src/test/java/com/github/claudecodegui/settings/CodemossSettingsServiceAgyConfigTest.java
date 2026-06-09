package com.github.claudecodegui.settings;

import com.github.claudecodegui.util.PlatformUtils;
import com.google.gson.JsonObject;
import org.junit.After;
import org.junit.Test;

import java.lang.reflect.Field;
import java.nio.file.Files;
import java.nio.file.Path;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

public class CodemossSettingsServiceAgyConfigTest {
    private String originalHomeDir;

    @After
    public void tearDown() throws Exception {
        if (originalHomeDir != null) {
            setCachedHomeDirectory(originalHomeDir);
            originalHomeDir = null;
        }
    }

    @Test
    public void persistsAgyGeminiApiKeyWithoutEchoingSecretInConfigView() throws Exception {
        Path tempHome = Files.createTempDirectory("agy-config-home");
        useTemporaryHomeDirectory(tempHome);

        CodemossSettingsService service = new CodemossSettingsService();
        service.setAgyGeminiApiKey(" gemini-test-key ");

        assertEquals("gemini-test-key", service.getAgyGeminiApiKey());

        JsonObject visibleConfig = service.getAgyConfig();
        assertTrue(visibleConfig.get("hasGeminiApiKey").getAsBoolean());
        assertFalse(visibleConfig.has("geminiApiKey"));
    }

    @Test
    public void blankAgyGeminiApiKeyClearsPersistedKey() throws Exception {
        Path tempHome = Files.createTempDirectory("agy-config-clear-home");
        useTemporaryHomeDirectory(tempHome);

        CodemossSettingsService service = new CodemossSettingsService();
        service.setAgyGeminiApiKey("gemini-test-key");
        service.setAgyGeminiApiKey(" ");

        assertEquals("", service.getAgyGeminiApiKey());
        assertFalse(service.getAgyConfig().get("hasGeminiApiKey").getAsBoolean());
    }

    private void useTemporaryHomeDirectory(Path tempHome) throws Exception {
        if (originalHomeDir == null) {
            originalHomeDir = getCachedHomeDirectory();
        }
        setCachedHomeDirectory(tempHome.toString());
        Files.createDirectories(tempHome.resolve(".codemoss"));
    }

    private String getCachedHomeDirectory() throws Exception {
        Field field = PlatformUtils.class.getDeclaredField("cachedRealHomeDir");
        field.setAccessible(true);
        return (String) field.get(null);
    }

    private void setCachedHomeDirectory(String homeDir) throws Exception {
        Field field = PlatformUtils.class.getDeclaredField("cachedRealHomeDir");
        field.setAccessible(true);
        field.set(null, homeDir);
    }
}
