import { describe, expect, it } from 'vitest';
import { resolveIconVendor, resolveModelVendor } from './modelIconMapping';
import { AVAILABLE_PROVIDERS } from '../components/ChatInputBox/types';
import { SDK_DEFINITIONS } from '../types/dependency';

describe('modelIconMapping', () => {
  it('keeps Codex Spark variants on the OpenAI icon', () => {
    expect(resolveModelVendor('gpt-5.3-codex-spark')).toBe('openai');
    expect(resolveIconVendor('codex', 'gpt-5.3-codex-spark')).toBe('openai');
  });

  it('still matches dedicated Spark vendor model ids', () => {
    expect(resolveModelVendor('spark-max')).toBe('spark');
    expect(resolveIconVendor(undefined, 'spark-lite')).toBe('spark');
  });

  it('resolves Xiaomi MiMo models before falling back to Claude provider icons', () => {
    expect(resolveModelVendor('mimo-v2.5-pro')).toBe('xiaomi');
    expect(resolveIconVendor('claude', 'mimo-v2.5-pro')).toBe('xiaomi');
    expect(resolveIconVendor('xiaomi')).toBe('xiaomi');
  });

  it('declares agy as an enabled provider with an installable SDK', () => {
    expect(AVAILABLE_PROVIDERS.find((provider) => provider.id === 'agy')?.enabled).toBe(true);
    expect(SDK_DEFINITIONS.find((sdk) => sdk.id === 'agy-sdk')?.relatedProviders).toContain('agy');
    expect(resolveIconVendor('agy')).toBe('gemini');
  });
});
