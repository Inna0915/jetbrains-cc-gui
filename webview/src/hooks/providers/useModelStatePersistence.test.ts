import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useModelStatePersistence } from './useModelStatePersistence';

describe('useModelStatePersistence', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
    window.sendToJava = vi.fn();
  });

  it('restores agy provider state and syncs it to the backend', () => {
    localStorage.setItem('model-selection-state', JSON.stringify({
      provider: 'agy',
      agyModel: 'gemini-3.5-flash',
      agyPermissionMode: 'plan',
    }));

    const setCurrentProvider = vi.fn();
    const setSelectedClaudeModel = vi.fn();
    const setSelectedCodexModel = vi.fn();
    const setSelectedAgyModel = vi.fn();
    const setClaudePermissionMode = vi.fn();
    const setCodexPermissionMode = vi.fn();
    const setAgyPermissionMode = vi.fn();
    const setPermissionMode = vi.fn();
    const setLongContextEnabled = vi.fn();
    const setReasoningEffort = vi.fn();

    renderHook(() => useModelStatePersistence({
      setCurrentProvider,
      setSelectedClaudeModel,
      setSelectedCodexModel,
      setSelectedAgyModel,
      setClaudePermissionMode,
      setCodexPermissionMode,
      setAgyPermissionMode,
      setPermissionMode,
      setLongContextEnabled,
      setReasoningEffort,
      currentProvider: 'claude',
      selectedClaudeModel: 'claude-sonnet-4-6',
      selectedCodexModel: 'gpt-5.5',
      selectedAgyModel: 'gemini-3.5-flash',
      claudePermissionMode: 'bypassPermissions',
      codexPermissionMode: 'default',
      agyPermissionMode: 'plan',
      longContextEnabled: true,
      reasoningEffort: 'high',
    }));

    expect(setCurrentProvider).toHaveBeenCalledWith('agy');
    expect(setSelectedAgyModel).toHaveBeenCalledWith('gemini-3.5-flash');
    expect(setAgyPermissionMode).toHaveBeenCalledWith('plan');
    expect(setPermissionMode).toHaveBeenCalledWith('plan');

    vi.advanceTimersByTime(250);

    expect(window.sendToJava).toHaveBeenCalledWith('set_provider:agy');
    expect(window.sendToJava).toHaveBeenCalledWith('set_model:gemini-3.5-flash');
    expect(window.sendToJava).toHaveBeenCalledWith('set_mode:plan');
  });
});
