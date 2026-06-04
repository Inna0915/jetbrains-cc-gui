import { useEffect } from 'react';
import { sendBridgeEvent } from '../../utils/bridge';
import {
  CLAUDE_MODELS,
  CODEX_MODELS,
  AGY_MODELS,
  isValidPermissionMode,
  normalizeClaudeModelId,
  apply1MContextSuffix,
  strip1MContextSuffix,
} from '../../components/ChatInputBox/types';
import type { PermissionMode, ReasoningEffort } from '../../components/ChatInputBox/types';

const STORAGE_KEY = 'model-selection-state';
const REASONING_VALUES = ['low', 'medium', 'high', 'xhigh', 'max'] as const;

const getCustomModels = (key: string): { id: string }[] => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
};

const isReasoningEffort = (value: unknown): value is ReasoningEffort =>
  typeof value === 'string' && (REASONING_VALUES as readonly string[]).includes(value);

export interface UseModelStatePersistenceOptions {
  // Cross-slice load setters (run once on mount)
  setCurrentProvider: (value: string) => void;
  setSelectedClaudeModel: (value: string) => void;
  setSelectedCodexModel: (value: string) => void;
  setSelectedAgyModel: (value: string) => void;
  setClaudePermissionMode: (value: PermissionMode) => void;
  setCodexPermissionMode: (value: PermissionMode) => void;
  setAgyPermissionMode: (value: PermissionMode) => void;
  setPermissionMode: (value: PermissionMode) => void;
  setLongContextEnabled: (value: boolean) => void;
  setReasoningEffort: (value: ReasoningEffort) => void;
  // Cross-slice save deps (re-saves on any change)
  currentProvider: string;
  selectedClaudeModel: string;
  selectedCodexModel: string;
  selectedAgyModel: string;
  claudePermissionMode: PermissionMode;
  codexPermissionMode: PermissionMode;
  agyPermissionMode: PermissionMode;
  longContextEnabled: boolean;
  reasoningEffort: ReasoningEffort;
}

/**
 * Hydrates state from localStorage on mount and saves on any changes.
 * Supports claude, codex, and agy providers.
 */
export function useModelStatePersistence(options: UseModelStatePersistenceOptions) {
  const {
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
    currentProvider,
    selectedClaudeModel,
    selectedCodexModel,
    selectedAgyModel,
    claudePermissionMode,
    codexPermissionMode,
    agyPermissionMode,
    longContextEnabled,
    reasoningEffort,
  } = options;

  // Hydrate from localStorage and sync to backend (mount only).
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      let restoredProvider = 'claude';
      let restoredClaudeModel = CLAUDE_MODELS[0].id;
      let restoredCodexModel = CODEX_MODELS[0].id;
      let restoredAgyModel = AGY_MODELS[0].id;
      let restoredClaudePermissionMode: PermissionMode = 'bypassPermissions';
      let restoredCodexPermissionMode: PermissionMode = 'default';
      let restoredAgyPermissionMode: PermissionMode = 'default';
      let restoredLongContextEnabled = true;

      if (saved) {
        const state = JSON.parse(saved);

        if (['claude', 'codex', 'agy'].includes(state.provider)) {
          restoredProvider = state.provider;
          setCurrentProvider(state.provider);
        }

        if (isValidPermissionMode(state.claudePermissionMode)) {
          restoredClaudePermissionMode = state.claudePermissionMode;
        }
        if (isValidPermissionMode(state.codexPermissionMode)) {
          restoredCodexPermissionMode = state.codexPermissionMode === 'plan'
            ? 'default'
            : state.codexPermissionMode;
        }
        if (isValidPermissionMode(state.agyPermissionMode)) {
          restoredAgyPermissionMode = state.agyPermissionMode;
        }

        if (typeof state.longContextEnabled === 'boolean') {
          restoredLongContextEnabled = state.longContextEnabled;
          setLongContextEnabled(state.longContextEnabled);
        }

        if (isReasoningEffort(state.reasoningEffort)) {
          setReasoningEffort(state.reasoningEffort);
        }

        const savedClaudeCustomModels = getCustomModels('claude-custom-models');
        const strippedClaudeModel = strip1MContextSuffix(state.claudeModel);
        const normalizedClaudeModel = normalizeClaudeModelId(strippedClaudeModel);
        if (
          CLAUDE_MODELS.find(m => m.id === normalizedClaudeModel) ||
          savedClaudeCustomModels.find(m => m.id === normalizedClaudeModel)
        ) {
          restoredClaudeModel = normalizedClaudeModel;
          setSelectedClaudeModel(normalizedClaudeModel);
        }

        const savedCodexCustomModels = getCustomModels('codex-custom-models');
        if (
          CODEX_MODELS.find(m => m.id === state.codexModel) ||
          savedCodexCustomModels.find(m => m.id === state.codexModel)
        ) {
          restoredCodexModel = state.codexModel;
          setSelectedCodexModel(state.codexModel);
        }

        if (AGY_MODELS.find(m => m.id === state.agyModel)) {
          restoredAgyModel = state.agyModel;
          setSelectedAgyModel(state.agyModel);
        }
      }

      const initialPermissionMode: PermissionMode = restoredProvider === 'codex'
        ? restoredCodexPermissionMode
        : restoredProvider === 'agy'
        ? restoredAgyPermissionMode
        : restoredClaudePermissionMode;

      setClaudePermissionMode(restoredClaudePermissionMode);
      setCodexPermissionMode(restoredCodexPermissionMode);
      setAgyPermissionMode(restoredAgyPermissionMode);
      setPermissionMode(initialPermissionMode);

      let syncRetryCount = 0;
      const MAX_SYNC_RETRIES = 30;

      const syncToBackend = () => {
        if (window.sendToJava) {
          sendBridgeEvent('set_provider', restoredProvider);
          const modelToSync = restoredProvider === 'codex'
            ? restoredCodexModel
            : restoredProvider === 'agy'
            ? restoredAgyModel
            : apply1MContextSuffix(restoredClaudeModel, restoredLongContextEnabled);
          sendBridgeEvent('set_model', modelToSync);
          sendBridgeEvent('set_mode', initialPermissionMode);
        } else {
          syncRetryCount++;
          if (syncRetryCount < MAX_SYNC_RETRIES) {
            setTimeout(syncToBackend, 100);
          }
        }
      };
      setTimeout(syncToBackend, 200);
    } catch {
      // ignore
    }
  }, []);

  // Persist snapshot whenever any of the keys change.
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        provider: currentProvider,
        claudeModel: selectedClaudeModel,
        codexModel: selectedCodexModel,
        agyModel: selectedAgyModel,
        claudePermissionMode,
        codexPermissionMode,
        agyPermissionMode,
        longContextEnabled,
        reasoningEffort,
      }));
    } catch {
      // ignore
    }
  }, [
    currentProvider,
    selectedClaudeModel,
    selectedCodexModel,
    selectedAgyModel,
    claudePermissionMode,
    codexPermissionMode,
    agyPermissionMode,
    longContextEnabled,
    reasoningEffort,
  ]);
}
