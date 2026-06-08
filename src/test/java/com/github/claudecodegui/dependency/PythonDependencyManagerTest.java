package com.github.claudecodegui.dependency;

import org.junit.Rule;
import org.junit.Test;
import org.junit.rules.TemporaryFolder;

import java.nio.file.Path;

import static org.junit.Assert.assertTrue;

public class PythonDependencyManagerTest {
    @Rule
    public TemporaryFolder temporaryFolder = new TemporaryFolder();

    @Test
    public void shouldExposePythonCandidateCommands() {
        assertTrue(PythonDetector.getCandidateCommands().contains("py"));
        assertTrue(PythonDetector.getCandidateCommands().contains("python"));
    }

    @Test
    public void shouldUseManagedAgyVenvUnderAgySdkDirectory() throws Exception {
        Path dependenciesDir = temporaryFolder.newFolder("dependencies").toPath();
        PythonDependencyManager manager = new PythonDependencyManager(dependenciesDir);

        String venvPath = manager.getAgyVenvDir().toString();

        assertTrue(venvPath.contains("agy-sdk"));
        assertTrue(venvPath.endsWith(".venv"));
    }
}
