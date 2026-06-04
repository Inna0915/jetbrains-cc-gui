import { useState } from 'react';
import { AGY_MODELS } from '../../components/ChatInputBox/types';
import type { PermissionMode } from '../../components/ChatInputBox/types';

/**
 * Antigravity (agy) specific selectable state.
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
