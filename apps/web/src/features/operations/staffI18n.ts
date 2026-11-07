import { useCallback } from 'react';
import { getLanguage, sourceMessage, useI18n, translateSource, type SourceMessage } from '../../shared/i18n/language';
import { staffSourceCatalog } from './staffSourceCatalog';
import { notify as portalNotify } from '../../shared/lib/portalNotices';

export type StaffMessage = string | Error | SourceMessage;

/** Only call with source-owned copy or an explicitly preserved error. */
export function staffTranslation(source: string): string {
  const trimmed = source.trim().replace(/\s+/g, ' ');
  const english = staffSourceCatalog[trimmed];
  return english === undefined ? source : source.replace(source.trim(), english);
}

export function useStaffI18n() {
  const { lang, t: translate } = useI18n();
  // Render translations follow locale changes; data effects keep source messages and do not depend on t.
  const t = useCallback((source: StaffMessage | null | undefined, english?: string): string => {
    if (source == null) return '';
    if (typeof source !== 'string') {
      if (source instanceof Error) {
        const message = (source as Error & { translation?: SourceMessage }).translation;
        return message ? (lang === 'en' ? message.en : message.vi) : source.message;
      }
      return lang === 'en' ? source.en : source.vi;
    }
    return translateSource(source, english ?? staffSourceCatalog[source.trim().replace(/\s+/g, ' ')], lang);
  }, [lang]);
  return { lang, locale: lang === 'en' ? 'en-GB' : 'vi-VN', t, translate };
}

/** Keep backend/business Error content verbatim; translate only the source fallback. */
export function staffError(error: unknown, fallback: string): StaffMessage {
  return error instanceof Error && error.name === 'Error' && error.message ? error : fallback;
}

export function staffMessage(vi: string, en: string): SourceMessage {
  return sourceMessage(vi, en);
}

/** Source provenance survives toast/inbox storage and later preference changes. */
export const staffNotify = (message: StaffMessage, type: Parameters<typeof portalNotify>[1] = 'info', options?: Parameters<typeof portalNotify>[2]) => {
  const translation = typeof message === 'string'
    ? sourceMessage(message, staffTranslation(message))
    : message instanceof Error ? (message as Error & { translation?: SourceMessage }).translation : message;
  const text = message instanceof Error ? message.message : typeof message === 'string' ? message : message.vi;
  if (translation) portalNotify(text, type, { ...options, translation });
  else if (options === undefined) portalNotify(text, type);
  else portalNotify(text, type, options);
};

export const staffLocale = () => getLanguage() === 'en' ? 'en-GB' : 'vi-VN';
export const staffText = (source: string, english?: string) => translateSource(source, english ?? staffSourceCatalog[source.trim().replace(/\s+/g, ' ')]);
export function staffSourceError(vi: string, en: string): Error {
  return Object.assign(new Error(vi), { translation: sourceMessage(vi, en) });
}
