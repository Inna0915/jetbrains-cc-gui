/**
 * Agy channel command handler.
 */
import { sendMessage as agySendMessage } from '../services/agy/message-service.js';

export async function handleAgyCommand(command, args, stdinData) {
  switch (command) {
    case 'send': {
      if (stdinData && stdinData.message !== undefined) {
        const {
          message,
          conversationId,
          threadId,
          sessionId,
          cwd,
          permissionMode,
          model,
          apiKey,
          attachments,
          pythonPath,
          saveDir,
          agentPrompt,
          reasoningEffort
        } = stdinData;
        await agySendMessage(
          message,
          conversationId || threadId || sessionId || '',
          cwd || '',
          permissionMode || '',
          model || '',
          apiKey || '',
          attachments || [],
          { pythonPath, saveDir, agentPrompt, reasoningEffort }
        );
      } else {
        await agySendMessage(args[0], args[1], args[2], args[3], args[4]);
      }
      break;
    }
    default:
      throw new Error(`Unknown Agy command: ${command}`);
  }
}

export function getAgyCommandList() {
  return ['send'];
}
