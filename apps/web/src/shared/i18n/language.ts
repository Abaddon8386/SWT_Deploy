import { englishLabels } from './translations';
import { useCallback, useEffect, useSyncExternalStore, type RefObject } from 'react';

export type Language = 'vi' | 'en';

export const LANGUAGE_STORAGE_KEY = 'scms_lang';

const listeners = new Set<() => void>();

function normalizeLanguage(value: string | null | undefined): Language {
  if (value && /^en(?:[-_]|$)/i.test(value)) {
    return 'en';
  }
  return 'vi';
}

export function getLanguage(): Language {
  if (typeof window === 'undefined') {
    return 'vi';
  }
  try {
    return normalizeLanguage(window.localStorage.getItem(LANGUAGE_STORAGE_KEY));
  } catch {
    return 'vi';
  }
}

function applyDocumentLanguage(lang: Language): void {
  if (typeof document !== 'undefined' && document.documentElement) {
    document.documentElement.lang = lang;
    document.documentElement.setAttribute('data-lang', lang);
  }
}

export function setLanguage(next: Language): void {
  const normalized = normalizeLanguage(next);
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(LANGUAGE_STORAGE_KEY, normalized);
    } catch {
      // ignore storage errors in restricted environments
    }
  }
  applyDocumentLanguage(normalized);
  listeners.forEach((listener) => listener());
  if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
    window.dispatchEvent(new CustomEvent('scms:language-changed', { detail: { lang: normalized } }));
  }
}

export function subscribeLanguage(listener: () => void): () => void {
  listeners.add(listener);
  if (typeof window !== 'undefined') {
    const onStorage = (event: StorageEvent) => {
      if (event.key === null || event.key === LANGUAGE_STORAGE_KEY) {
        applyDocumentLanguage(getLanguage());
        listener();
      }
    };
    window.addEventListener('storage', onStorage);
    return () => {
      listeners.delete(listener);
      window.removeEventListener('storage', onStorage);
    };
  }
  return () => {
    listeners.delete(listener);
  };
}

export function useLanguage() {
  const lang = useSyncExternalStore(subscribeLanguage, getLanguage, () => 'vi' as Language);

  useEffect(() => {
    applyDocumentLanguage(lang);
  }, [lang]);

  const toggleLanguage = () => {
    setLanguage(lang === 'vi' ? 'en' : 'vi');
  };

  return {
    lang,
    setLanguage,
    toggleLanguage,
  };
}

export function useI18n() {
  const { lang, setLanguage: updateLanguage, toggleLanguage } = useLanguage();

  const t = useCallback((viText: string | Error | SourceMessage, enText?: string): string => {
    if (viText instanceof Error) {
      const translation = (viText as Error & { translation?: SourceMessage }).translation;
      return translation ? (lang === 'en' ? translation.en : translation.vi) : viText.message;
    }
    if (typeof viText !== 'string') return lang === 'en' ? viText.en : viText.vi;
    // Explicit pairs own their spacing; catalog lookups preserve the source boundaries.
    if (enText !== undefined) return lang === 'en' ? enText : viText;
    return translateSource(viText, undefined, lang);
  }, [lang]);

  return {
    lang,
    setLanguage: updateLanguage,
    toggleLanguage,
    t,
  };
}

// Legacy compatibility for unmigrated screens only. New UI translates during React rendering.
const VI_TO_EN_PHRASES: ReadonlyArray< readonly [string, string] > = [
  ['Trang chủ', 'Home'],
  ['Khám phá', 'Explore'],
  ['Gói tập', 'Memberships'],
  ['Lớp học & Huấn luyện viên', 'Classes & Coaches'],
  ['Câu hỏi thường gặp', 'FAQ'],
  ['Liên hệ', 'Contact'],
  ['Bảng điều khiển', 'Dashboard'],
  ['Vào bảng điều khiển', 'Go to dashboard'],
  ['Đăng nhập', 'Sign in'],
  ['Đăng ký', 'Register'],
  ['Đăng ký ngay', 'Join now'],
  ['Đăng xuất', 'Sign out'],
  ['Hồ sơ cá nhân', 'My profile'],
  ['Hồ sơ', 'Profile'],
  ['Lịch tập', 'Schedule'],
  ['Sân tập', 'Courts'],
  ['Huấn luyện', 'Training'],
  ['Chỉ số cơ thể', 'Body metrics'],
  ['Trợ lý AI', 'AI assistant'],
  ['Tin nhắn', 'Messages'],
  ['Thông báo', 'Notifications'],
  ['Hỗ trợ', 'Support'],
  ['Hóa đơn', 'Invoices'],
  ['Lịch dạy', 'Teaching schedule'],
  ['Học viên', 'Members'],
  ['Giáo án', 'Training plans'],
  ['Đánh giá', 'Reviews'],
  ['Đơn nội bộ', 'Internal requests'],
  ['Quầy lễ tân', 'Front desk'],
  ['Điểm danh', 'Attendance'],
  ['Khách tập thử', 'Trial guests'],
  ['Hội viên', 'Members'],
  ['Nhân sự', 'Staff'],
  ['Phân công HLV', 'Coach assignments'],
  ['Lớp học', 'Classes'],
  ['Phòng tập', 'Rooms'],
  ['Thiết bị', 'Equipment'],
  ['Bộ môn', 'Disciplines'],
  ['Báo cáo', 'Reports'],
  ['Nhật ký', 'Audit logs'],
  ['Tài khoản', 'Accounts'],
  ['Vai trò', 'Roles'],
  ['Cấu hình', 'Configuration'],
  ['Đang tải dữ liệu...', 'Loading data...'],
  ['Đang tải...', 'Loading...'],
  ['Lưu thay đổi', 'Save changes'],
  ['Hủy bỏ', 'Cancel'],
  ['Xác nhận', 'Confirm'],
  ['Đóng', 'Close'],
  ['Tìm kiếm', 'Search'],
  ['Làm mới', 'Refresh'],
  ['Xem chi tiết', 'View details'],
  ['Xem tất cả', 'View all'],
  ['Hoạt động', 'Active'],
  ['Đang hoạt động', 'Active'],
  ['Tạm ngưng', 'Paused'],
  ['Đã hủy', 'Cancelled'],
  ['Đã hoàn thành', 'Completed'],
  ['Chờ duyệt', 'Pending'],
  ['Chờ thanh toán', 'Pending payment'],
];

const VI_TO_EN_MAP = new Map<string, string>(VI_TO_EN_PHRASES);

const originalTextMap = new WeakMap<Text, string>();

function translateDomSubtree(root: ParentNode, lang: Language): void {
  if (typeof document === 'undefined' || typeof NodeFilter === 'undefined') {
    return;
  }
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let current = walker.nextNode() as Text | null;
  while (current) {
    const parentTag = current.parentElement?.tagName;
    if (!current.parentElement?.closest('[data-i18n-managed]') && parentTag !== 'SCRIPT' && parentTag !== 'STYLE' && parentTag !== 'TEXTAREA') {
      const raw = current.nodeValue ?? '';
      const trimmed = raw.trim();
      if (trimmed.length > 0) {
        if (lang === 'en') {
          const mappedEn = VI_TO_EN_MAP.get(trimmed);
          if (mappedEn) {
            if (!originalTextMap.has(current)) {
              originalTextMap.set(current, raw);
            }
            current.nodeValue = raw.replace(trimmed, mappedEn);
          }
        } else {
          const original = originalTextMap.get(current);
          if (original !== undefined) {
            current.nodeValue = original;
            originalTextMap.delete(current);
          }
        }
      }
    }
    current = walker.nextNode() as Text | null;
  }
}

export function useDomLanguageSync(containerRef?: RefObject<HTMLElement | null>): void {
  const { lang } = useLanguage();

  useEffect(() => {
    if (typeof document === 'undefined') {
      return;
    }
    const target = containerRef?.current ?? document.body;
    if (!target) {
      return;
    }
    translateDomSubtree(target, lang);

    if (lang !== 'en' || typeof MutationObserver === 'undefined') {
      return;
    }

    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType === Node.ELEMENT_NODE) {
            translateDomSubtree(node as Element, 'en');
          } else if (node.nodeType === Node.TEXT_NODE && node.parentElement) {
            translateDomSubtree(node.parentElement, 'en');
          }
        });
      }
    });

    observer.observe(target, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [lang, containerRef]);
}

export interface SourceMessage { vi: string; en: string }
/** Explicit provenance for source-owned notices; never infer translations from API content. */
export function sourceMessage(vi: string, en?: string): SourceMessage {
  return { vi, en: en ?? translateSource(vi, undefined, 'en') };
}

/** Missing source-owned translations are observable in QA instead of silently passing as English. */
const missingTranslations = new Set<string>();
export const getMissingTranslations = (): readonly string[] => [...missingTranslations];
export const clearMissingTranslations = () => missingTranslations.clear();

/** Only call for source-owned text; API content and user input must remain verbatim. */
export function translateSource(vi: string, en?: string, lang: Language = getLanguage()): string {
  const key = vi.trim();
  const translated = en ?? (Object.hasOwn(englishLabels, key) ? englishLabels[key] : undefined);
  if (lang === 'en' && translated === undefined && /[\u00c0-\u1ef9\u0110\u0111]/u.test(key)) {
    if (!missingTranslations.has(key)) {
      missingTranslations.add(key);
      if (import.meta.env.DEV) console.warn('[i18n] Missing English UI translation:', key);
    }
  }
  return lang === 'en' && translated !== undefined ? vi.replace(key, translated) : vi;
}
export const getIntlLocale = (lang: Language = getLanguage()) => lang === 'en' ? 'en-GB' : 'vi-VN';
