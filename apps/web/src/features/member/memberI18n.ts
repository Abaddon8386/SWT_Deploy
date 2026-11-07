import { getLanguage, sourceMessage, translateSource, type SourceMessage } from '../../shared/i18n/language';
import { englishLabels } from '../../shared/i18n/translations';
import { memberLabels } from './memberLabels';

/** Only call with source-owned copy, never API or user text. */
export function memberText(source: string, english?: string): string {
  if (getLanguage() !== 'en') return source;
  const key = source.trim().replace(/\s+/g, ' ');
  const translated = english ?? memberLabels[key] ?? englishLabels[key];
  return translateSource(source, translated);
}
export function memberMessage(source: string, english?: string): SourceMessage {
  return sourceMessage(source, english ?? memberLabels[source.trim().replace(/\s+/g, ' ')] ?? englishLabels[source.trim()]);
}
export function memberRenderMessage(message: string | SourceMessage | null | undefined): string {
  if (!message) return '';
  return typeof message === 'string' ? message : getLanguage() === 'en' ? message.en : message.vi;
}
export function memberError(reason: unknown, fallback: string): string | SourceMessage {
  if (reason instanceof Error && reason.name === 'Error' && reason.message) {
    const translated = (reason as Error & { translation?: SourceMessage }).translation;
    return translated ?? reason.message;
  }
  return memberMessage(fallback);
}
import { notify, type PortalNoticeType } from '../../shared/lib/portalNotices';

/** Explicit bilingual provenance keeps an open notice synchronized with the selected language. */
export function memberNotify(message: SourceMessage | string, type: PortalNoticeType, options: Parameters<typeof notify>[2] = {}) {
  const translation = typeof message === 'string' ? memberMessage(message) : message;
  notify(memberRenderMessage(translation), type, { ...options, translation });
}
