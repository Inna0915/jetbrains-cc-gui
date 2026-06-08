import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ProviderTabSection from './index';
import { STORAGE_KEYS } from '../../../types/provider';

const translations: Record<string, string> = {
  'settings.providers': 'Providers',
  'settings.providersDesc': 'Manage providers',
  'settings.providerTab.claude': 'Claude Code',
  'settings.providerTab.codex': 'Codex',
  'settings.providerTab.agy': 'Agy',
  'settings.pluginModels.title': 'Custom Models',
  'settings.pluginModels.manage': 'Manage Models',
};

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => translations[key] ?? key,
  }),
}));

vi.mock('../ProviderManageSection', () => ({
  default: () => <div>Claude Provider Section</div>,
}));

vi.mock('../CodexProviderSection', () => ({
  default: () => <div>Codex Provider Section</div>,
}));

vi.mock('../CustomModelDialog', () => ({
  default: ({
    isOpen,
    models,
  }: {
    isOpen: boolean;
    models: Array<{ id: string; label: string }>;
  }) => (
    isOpen
      ? (
        <div role="dialog">
          {models.map((model) => (
            <span key={model.id}>{model.id}</span>
          ))}
        </div>
      )
      : null
  ),
}));

describe('ProviderTabSection', () => {
  const defaultProps = {
    providers: [],
    loading: false,
    onAddProvider: vi.fn(),
    onEditProvider: vi.fn(),
    onDeleteProvider: vi.fn(),
    onSwitchProvider: vi.fn(),
    codexProviders: [],
    codexLoading: false,
    onAddCodexProvider: vi.fn(),
    onEditCodexProvider: vi.fn(),
    onDeleteCodexProvider: vi.fn(),
    onSwitchCodexProvider: vi.fn(),
    onRevokeCodexLocalConfigAuthorization: vi.fn(),
    addToast: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it('renders an Agy provider tab', () => {
    render(<ProviderTabSection currentProvider="agy" {...defaultProps} />);

    const agyTab = screen.getByRole('tab', { name: /agy/i });
    expect(agyTab).toBeTruthy();
    expect(agyTab.getAttribute('aria-selected')).toBe('true');
  });

  it('uses the Agy custom model storage key in the Agy tab', () => {
    localStorage.setItem(
      STORAGE_KEYS.AGY_CUSTOM_MODELS,
      JSON.stringify([{ id: 'gemini-custom', label: 'Gemini Custom' }]),
    );

    const { container } = render(<ProviderTabSection currentProvider="agy" {...defaultProps} />);
    const agyPanel = container.querySelector('#panel-agy-providers');

    expect(agyPanel).toBeTruthy();
    fireEvent.click(within(agyPanel as HTMLElement).getByRole('button', { name: 'Manage Models' }));

    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(screen.getByText('gemini-custom')).toBeTruthy();
  });
});
