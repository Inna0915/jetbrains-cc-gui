import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useUsageTracking } from './useUsageTracking';

describe('useUsageTracking', () => {
  it('maps agy provider to agy-sdk install status', () => {
    const { result } = renderHook(() => useUsageTracking());

    act(() => {
      result.current.setSdkStatus({
        'agy-sdk': { status: 'installed' },
      });
      result.current.setSdkStatusLoaded(true);
    });

    expect(result.current.isSdkInstalled('agy')).toBe(true);
  });

  it('does not treat unknown providers as Claude SDK installs', () => {
    const { result } = renderHook(() => useUsageTracking());

    act(() => {
      result.current.setSdkStatus({
        'claude-sdk': { status: 'installed' },
      });
      result.current.setSdkStatusLoaded(true);
    });

    expect(result.current.isSdkInstalled('unknown-provider')).toBe(false);
  });
});
