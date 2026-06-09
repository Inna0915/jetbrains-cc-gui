import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ButtonArea } from './ButtonArea';
import { STORAGE_KEYS } from '../../types/provider';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock('./selectors', () => ({
  ConfigSelect: () => null,
  ModeSelect: () => null,
  ProviderSelect: () => null,
  ReasoningSelect: () => null,
  ModelSelect: ({ models }: { models: Array<{ id: string; label: string }> }) => (
    <div data-testid="model-list">
      {models.map((model) => `${model.id}:${model.label}`).join('|')}
    </div>
  ),
}));

describe('ButtonArea Agy models', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('uses Agy built-in and custom models for the Agy provider', () => {
    localStorage.setItem(
      STORAGE_KEYS.AGY_CUSTOM_MODELS,
      JSON.stringify([{ id: 'gemini-custom', label: 'Gemini Custom' }]),
    );

    render(
      <ButtonArea
        currentProvider="agy"
        selectedModel="gemini-custom"
      />,
    );

    const modelList = screen.getByTestId('model-list').textContent ?? '';
    expect(modelList).toContain('gemini-custom:Gemini Custom');
    expect(modelList).toContain('gemini-3.5-flash:Gemini 3.5 Flash');
    expect(modelList).not.toContain('gemini-3-pro:Gemini 3 Pro');
    expect(modelList).not.toContain('claude-sonnet-4-6');
  });
});
