/**
 * Codex channel command handler – keeps Codex specific logic separated.
 */
import { sendMessage as codexSendMessage } from '../services/codex/message-service.js';
import { getMcpServerTools as codexGetMcpServerTools } from '../services/codex/message-service.js';

export function normalizeCodexReasoningEffort(reasoningEffort) {
  return reasoningEffort || 'medium';
}

/**
 * Execute a Codex command.
 * @param {string} command
 * @param {string[]} args
 * @param {object|null} stdinData
 * @param {object|undefined} services
 */
export async function handleCodexCommand(command, args, stdinData, services) {
  const sendMessage = services?.sendMessage || codexSendMessage;
  const getMcpServerTools = services?.getMcpServerTools || codexGetMcpServerTools;

  switch (command) {
    case 'send': {
      if (stdinData && stdinData.message !== undefined) {
        const {
          message,
          threadId,
          cwd,
          permissionMode,
          model,
          baseUrl,
          apiKey,
          reasoningEffort,
          serviceTier,
          attachments  // Image attachments (local_image format)
        } = stdinData;
        await sendMessage(
          message,
          threadId || '',
          cwd || '',
          permissionMode || '',
          model || '',
          baseUrl || '',
          apiKey || '',
          normalizeCodexReasoningEffort(reasoningEffort),
          serviceTier || '',
          attachments || []  // Pass attachments to message service
        );
      } else {
        await sendMessage(args[0], args[1], args[2], args[3], args[4]);
      }
      break;
    }

    case 'getMcpServerTools': {
      const serverId = stdinData?.serverId || args[0] || null;
      const serverConfig = stdinData?.serverConfig || null;
      await getMcpServerTools(serverId, serverConfig);
      break;
    }

    default:
      throw new Error(`Unknown Codex command: ${command}`);
  }
}

export function getCodexCommandList() {
  return ['send', 'getMcpServerTools'];
}
