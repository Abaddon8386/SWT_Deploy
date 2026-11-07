import { notify } from '../../shared/lib/portalNotices';
import { toast } from '../../shared/ui/toast';
import { getLanguage, translateSource, useI18n, type SourceMessage } from '../../shared/i18n';
import { englishShopPublicLabels, vietnamesePublicLabels } from './shopTranslations';


function translatedSource(value: string, lang: 'vi' | 'en'): string {
  const trimmed = value.trim();
  if (!trimmed) return value;
  const key = trimmed.replace(/\s+/g, ' ');
  const translated = Object.hasOwn(vietnamesePublicLabels, key)
    ? translateSource(vietnamesePublicLabels[key], key, lang)
    : translateSource(key, englishShopPublicLabels[key] ?? englishShopPublicLabels[value], lang);
  // Keep intentional separators in fragments such as " and {0} other items".
  return value.slice(0, value.indexOf(trimmed)) + translated.trim() + value.slice(value.indexOf(trimmed) + trimmed.length);
}

/** Only call for source-owned copy; API errors and catalog/user fields stay verbatim. */
export function sourceText(value: string | Error | SourceMessage): string {
  if (value instanceof Error) {
    const pair = (value as Error & { translation?: SourceMessage }).translation;
    return pair ? (getLanguage() === 'en' ? pair.en : pair.vi) : value.message;
  }
  if (typeof value !== 'string') return getLanguage() === 'en' ? value.en : value.vi;
  return translatedSource(value, getLanguage());
}

export function sourceFormat(source: string, ...values: unknown[]): string {
  return sourceText(source).replace(/\{(\d+)\}/g, (_, index: string) => String(values[Number(index)] ?? ''));
}

export function sourcePair(source: string): SourceMessage {
  return { vi: translatedSource(source, 'vi'), en: translatedSource(source, 'en') };
}

/** Preserve backend messages, while retaining bilingual provenance for client fallbacks. */
export function sourceError(error: unknown, fallback: string): Error {
  if (error instanceof Error && error.name === 'Error' && error.message) return error;
  return Object.assign(new Error(fallback), { translation: sourcePair(fallback) });
}

/** A subscription for source-owned static tables whose getters resolve during rendering. */
export function useSourceLanguage(): void {
  useI18n();
}

export function sourceFormatPair(source: string, ...values: unknown[]): SourceMessage {
  const pair = sourcePair(source);
  const fill = (text: string) => text.replace(/\{(\d+)\}/g, (_, index: string) => String(values[Number(index)] ?? ''));
  return { vi: fill(pair.vi), en: fill(pair.en) };
}

function noticePair(value: string | Error | SourceMessage): SourceMessage | undefined {
  if (value instanceof Error) return (value as Error & { translation?: SourceMessage }).translation;
  if (typeof value !== 'string') return value;
  return Object.hasOwn(englishShopPublicLabels, value) ? sourcePair(value) : undefined;
}

export function sourceNotify(value: string | Error | SourceMessage, type?: Parameters<typeof notify>[1], options?: Parameters<typeof notify>[2]): void {
  const translation = noticePair(value);
  const message = value instanceof Error ? value.message : typeof value === 'string' ? value : value.vi;
  if (translation) notify(message, type, { ...options, translation });
  else if (options !== undefined) notify(message, type, options);
  else notify(message, type);
}

export function sourceToast(value: string | Error | SourceMessage, type: 'success' | 'error' = 'success'): void {
  const translation = noticePair(value);
  const message = value instanceof Error ? value.message : typeof value === 'string' ? value : value.vi;
  if (translation) toast(message, type, translation);
  else toast(message, type);
}
function sourceToastMethod(value: string | Error | SourceMessage, type: 'success' | 'error'): void {
  const translation = noticePair(value);
  const message = value instanceof Error ? value.message : typeof value === 'string' ? value : value.vi;
  if (translation) toast[type](message, translation);
  else toast[type](message);
}
sourceToast.success = (value: string | Error | SourceMessage) => sourceToastMethod(value, 'success');
sourceToast.error = (value: string | Error | SourceMessage) => sourceToastMethod(value, 'error');
