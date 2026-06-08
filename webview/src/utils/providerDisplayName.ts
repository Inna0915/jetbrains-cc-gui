export function getProviderDisplayName(providerId: string): string {
  if (providerId === 'codex') {
    return 'Codex';
  }
  if (providerId === 'agy') {
    return 'Agy';
  }
  return 'Claude Code';
}
