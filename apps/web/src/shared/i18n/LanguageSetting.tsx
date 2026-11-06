import type { FC } from 'react';
import { useI18n } from './language';

export interface LanguageSettingProps {
  variant: 'menu' | 'footer';
  className?: string;
}

export const LanguageSetting: FC<LanguageSettingProps> = ({ variant, className = '' }) => {
  const { lang, setLanguage: selectLanguage, t } = useI18n();

  if (variant === 'menu') {
    return (
      <div
        className={`portal-avatar-settings-block notranslate ${className}`.trim()}
        data-i18n-managed
        translate="no"
        data-testid="avatar-language-setting"
        role="group"
        aria-label={t('Cài đặt ngôn ngữ', 'Language settings')}
      >
        <div className="portal-avatar-settings-head">
          <span className="portal-avatar-settings-kicker">
            {t('Cài đặt · Ngôn ngữ', 'Settings · Language')}
          </span>
          <span className="portal-avatar-settings-current">
            {lang === 'en' ? 'EN' : 'VI'}
          </span>
        </div>
        <div className="portal-avatar-lang-switch">
          <button
            type="button"
            className={`portal-avatar-lang-btn ${lang === 'vi' ? 'active' : ''}`.trim()}
            onClick={() => selectLanguage('vi')}
            aria-pressed={lang === 'vi'}
            lang="vi"
            data-testid="avatar-lang-vi"
          >
            Tiếng Việt
          </button>
          <button
            type="button"
            className={`portal-avatar-lang-btn ${lang === 'en' ? 'active' : ''}`.trim()}
            onClick={() => selectLanguage('en')}
            aria-pressed={lang === 'en'}
            lang="en"
            data-testid="avatar-lang-en"
          >
            English
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`scms-footer-lang-setting notranslate ${className}`.trim()}
      data-i18n-managed
      translate="no"
      data-testid="footer-language-setting"
      role="group"
      aria-label={t('Cài đặt ngôn ngữ', 'Language settings')}
    >
      <span className="scms-footer-lang-label">
        {t('Cài đặt ngôn ngữ:', 'Language:')}
      </span>
      <div className="scms-footer-lang-pills">
        <button
          type="button"
          className={`scms-footer-lang-btn ${lang === 'vi' ? 'active' : ''}`.trim()}
          onClick={() => selectLanguage('vi')}
          aria-pressed={lang === 'vi'}
          lang="vi"
          data-testid="footer-lang-vi"
        >
          Tiếng Việt
        </button>
        <span className="scms-footer-lang-sep" aria-hidden="true">/</span>
        <button
          type="button"
          className={`scms-footer-lang-btn ${lang === 'en' ? 'active' : ''}`.trim()}
          onClick={() => selectLanguage('en')}
          aria-pressed={lang === 'en'}
          lang="en"
          data-testid="footer-lang-en"
        >
          English
        </button>
      </div>
    </div>
  );
};
