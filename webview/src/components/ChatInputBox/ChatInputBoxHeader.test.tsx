import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ChatInputBoxHeader } from './ChatInputBoxHeader';

vi.mock('./ContextBar.js', () => ({
  ContextBar: () => <div data-testid="context-bar" />,
}));

describe('ChatInputBoxHeader', () => {
  it('uses Agy in the missing SDK warning bar', () => {
    render(
      <ChatInputBoxHeader
        sdkStatusLoading={false}
        sdkInstalled={false}
        currentProvider="agy"
        t={((key: string, options?: Record<string, unknown>) => key === 'chat.sdkNotInstalled'
          ? `${options?.provider ?? ''} SDK is not installed`
          : key) as any}
        attachments={[]}
        onRemoveAttachment={vi.fn()}
        usagePercentage={0}
        showUsage={false}
        onAddAttachment={vi.fn()}
        selectedAgent={null}
        onClearAgent={vi.fn()}
        hasMessages={false}
        statusPanelExpanded={false}
      />,
    );

    expect(screen.getByText(/Agy SDK is not installed/)).toBeTruthy();
  });
});
