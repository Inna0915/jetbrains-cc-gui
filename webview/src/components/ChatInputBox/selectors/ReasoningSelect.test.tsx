import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ReasoningSelect } from './ReasoningSelect';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_key: string, options?: { defaultValue?: string }) => options?.defaultValue ?? _key,
  }),
}));

describe('ReasoningSelect', () => {
  it.each(['gpt-5.6-sol', 'gpt-5.6-terra', 'gpt-5.6-luna'])(
    'shows max for Codex model %s',
    (selectedModel) => {
      render(
        <ReasoningSelect
          value="high"
          onChange={vi.fn()}
          currentProvider="codex"
          selectedModel={selectedModel}
        />,
      );

      fireEvent.click(screen.getByRole('button'));

      expect(screen.getByText('Max')).toBeTruthy();
    },
  );

  it('resets max and hides it for older Codex models', () => {
    const onChange = vi.fn();

    render(
      <ReasoningSelect
        value="max"
        onChange={onChange}
        currentProvider="codex"
        selectedModel="gpt-5.5"
      />,
    );

    expect(onChange).toHaveBeenCalledWith('high');

    fireEvent.click(screen.getByRole('button'));

    expect(screen.queryByText('Max')).toBeNull();
  });

  it('shows xhigh and max for Claude Opus 4.8', () => {
    render(
      <ReasoningSelect
        value="high"
        onChange={vi.fn()}
        currentProvider="claude"
        selectedModel="claude-opus-4-8"
      />,
    );

    fireEvent.click(screen.getByRole('button'));

    expect(screen.getByText('XHigh')).toBeTruthy();
    expect(screen.getByText('Max')).toBeTruthy();
  });

  it('shows max but not xhigh for Claude Sonnet 4.6', () => {
    render(
      <ReasoningSelect
        value="high"
        onChange={vi.fn()}
        currentProvider="claude"
        selectedModel="claude-sonnet-4-6"
      />,
    );

    fireEvent.click(screen.getByRole('button'));

    expect(screen.queryByText('XHigh')).toBeNull();
    expect(screen.getByText('Max')).toBeTruthy();
  });

  it('shows max but not xhigh for Claude Sonnet 5', () => {
    render(
      <ReasoningSelect
        value="high"
        onChange={vi.fn()}
        currentProvider="claude"
        selectedModel="claude-sonnet-5"
      />,
    );

    fireEvent.click(screen.getByRole('button'));

    expect(screen.queryByText('XHigh')).toBeNull();
    expect(screen.getByText('Max')).toBeTruthy();
  });

  it('resets unavailable effort when selected Claude model changes', () => {
    const onChange = vi.fn();

    render(
      <ReasoningSelect
        value="xhigh"
        onChange={onChange}
        currentProvider="claude"
        selectedModel="claude-sonnet-4-6"
      />,
    );

    expect(onChange).toHaveBeenCalledWith('high');
  });

  it('hides for Claude models without effort support', () => {
    render(
      <ReasoningSelect
        value="high"
        onChange={vi.fn()}
        currentProvider="claude"
        selectedModel="claude-haiku-4-5"
      />,
    );

    expect(screen.queryByRole('button')).toBeNull();
  });
});
