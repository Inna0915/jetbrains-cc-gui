import { useState } from 'react';
import { AGY_MODELS } from '../../components/ChatInputBox/types';
import type { PermissionMode } from '../../components/ChatInputBox/types';

/**
 * Agy-specific selectable state. Runtime policy mapping is handled by the
 * backend; the webview only persists and forwards the selected mode/model.
 */
export function useAgyProvider() {
  const [selectedAgyModel, setSelectedAgyModel] = useState(AGY_MODELS[0].id);
  const [agyPermissionMode, setAgyPermissionMode] = useState<PermissionMode>('default');

  return {
    selectedAgyModel,
    setSelectedAgyModel,
    agyPermissionMode,
    setAgyPermissionMode,
  };
}

export type UseAgyProviderReturn = ReturnType<typeof useAgyProvider>;
