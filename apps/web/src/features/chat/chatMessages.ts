import { sourceMessage, type SourceMessage } from '../../shared/i18n';

export type ChatError = Error | SourceMessage;
/** Preserve server messages; only the client-owned fallback has a translation pair. */
export function chatError(cause: unknown, vi: string, en: string): ChatError {
  return cause instanceof Error && cause.name === 'Error' && cause.message ? cause : sourceMessage(vi, en);
}
