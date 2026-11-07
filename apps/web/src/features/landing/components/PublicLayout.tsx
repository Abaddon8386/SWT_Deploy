import { sourceText, useSourceLanguage } from "../../shop/shopI18n";
import { LoadingImage } from '../../../shared/ui/LoadingImage';
import { purchaseAuthPath } from '../../../shared/lib/purchaseIntent';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { getCurrentUser, homePath } from '../../../shared/api/client';
import { LanguageSetting, useI18n } from '../../../shared/i18n';
import { useComponentReveal } from '../hooks/useComponentReveal';
import { ThemeToggle } from '../../../shared/ui/ThemeToggle';
import { ChatWidget } from '../../chat/ChatWidget';
import { CartButton } from '../../shop/components/CartButton';
import '../fitness-public.css';
import { SPORT_PAGES, sportIdFromPath } from '../sportPages';

const links: { to: string; hash?: string; label: string; labelEn: string }[] = [
  { to: '/#about', hash: 'about', get label() { return sourceText('Về SÖL'); }, labelEn: 'About SÖL' },
  { to: '/#multisport', hash: 'multisport', label: 'Bộ môn', labelEn: 'Disciplines' },
  { to: '/#trainers', hash: 'trainers', get label() { return sourceText('Huấn luyện viên'); }, labelEn: 'Coaches' },
  { to: '/#packages', hash: 'packages', label: 'Gói tập', labelEn: 'Memberships' },
  { to: '/products', get label() { return sourceText('Sản phẩm'); }, labelEn: 'Products' },
];

const scrollToSection = (targetId: string) => {
  const element = document.getElementById(targetId);
  if (!element) return false;
  element.scrollIntoView({ behavior: 'smooth', block: 'start' });
  return true;
};

export function RoundArrow({ diagonal = false }: { diagonal?: boolean }) {
  useSourceLanguage();
  return <span className="fit-round-arrow" aria-hidden="true">
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
      {diagonal ? <path d="M4.5 11.5L11.5 4.5M6 4.5h5.5V10" /> : <path d="M3.5 8h9M8.5 4l4 4-4 4" />}
    </svg>
  </span>;
}

export function PublicLayout({ children }: { children: ReactNode }) {
  useSourceLanguage();
  const { lang, t } = useI18n();
  const [menuOpen, setMenuOpen] = useState(false);
  const { pathname, hash, search } = useLocation();
  const user = getCurrentUser();
  const root = useRef<HTMLDivElement>(null);
  useComponentReveal(root, pathname);
  const isNavActive = (to: string, target?: string) => {
    const sportTarget = sportIdFromPath(to);
    if (sportTarget && to === SPORT_PAGES[sportTarget].path) return sportIdFromPath(pathname) === sportTarget;
    if (target === 'trainers') return pathname.startsWith('/trainers') || (pathname === '/' && hash === '#trainers');
    if (target) return pathname === '/' && hash === `#${target}`;
    if (to === '/products') return pathname.startsWith('/products');
    return pathname === to;
  };

  useEffect(() => {
    const pageTitle = pathname === '/login'
      ? (lang === 'en' ? 'Sign In' : 'Đăng nhập')
      : pathname === '/register'
        ? (lang === 'en' ? 'Member Registration' : 'Đăng ký hội viên')
        : sportIdFromPath(pathname)
          ? SPORT_PAGES[sportIdFromPath(pathname)!].title
          : pathname.startsWith('/trainers')
            ? (lang === 'en' ? 'Coaches' : 'Huấn luyện viên')
            : pathname.startsWith('/products')
              ? (lang === 'en' ? 'Products' : 'Sản phẩm')
              : pathname.startsWith('/checkout')
                ? (lang === 'en' ? 'Checkout' : 'Thanh toán')
                : 'Build your body. Find your balance.';
    document.title = `${pageTitle} · SÖL Fitness`;
    if (hash) {
      const targetId = hash.slice(1);
      let attempts = 0;
      let timerId = 0;
      const tryScroll = () => {
        if (scrollToSection(targetId) || attempts >= 10) return;
        attempts += 1;
        timerId = window.setTimeout(tryScroll, 50);
      };
      const frame = requestAnimationFrame(tryScroll);
      return () => {
        cancelAnimationFrame(frame);
        window.clearTimeout(timerId);
      };
    }
    window.scrollTo(0, 0);
  }, [pathname, hash, lang]);

  return <div data-i18n-managed className={`fit-site${pathname === '/' ? ' fit-site--landing' : ''}`} ref={root}>
    <div className="fit-scroll-progress" aria-hidden="true" />
    <a className="fit-skip" href="#public-main">{t('Đến nội dung chính', 'Skip to main content')}</a>
    <div className="fit-canvas">
      <header className="fit-header">
        <Link className="fit-brand" to="/" aria-label={t('SÖL Fitness · Trang chủ', 'SÖL Fitness · Home')} onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}><span>{"SÖL"}</span>Fitness<span className="fit-brand-dot" aria-hidden="true">®</span></Link>
        <nav className={`fit-nav ${menuOpen ? 'is-open' : ''}`} id="public-navigation" aria-label={t('Điều hướng chính', 'Main navigation')}>
          {links.map(({ to, hash: target, label, labelEn }) => <Link
            key={label}
            to={to}
            data-nav-target={target}
            aria-current={!target && to === '/products' && pathname.startsWith('/products') ? 'page' : undefined}
            className={isNavActive(to, target) ? 'is-active' : undefined}
            onClick={(event) => {
              setMenuOpen(false);
              if (target && pathname === '/') {
                if (hash === `#${target}`) {
                  event.preventDefault();
                }
                scrollToSection(target);
              } else if (!target && pathname === to) {
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }
            }}
          >{lang === 'en' ? labelEn : label}</Link>)}
        </nav>
        <div className="fit-header-actions">
          <ThemeToggle />
          <CartButton />
          <Link to={user ? homePath(user.role) : pathname === '/login' ? purchaseAuthPath('/register', search) : purchaseAuthPath('/login', search)} className="fit-pill fit-header-cta">
            <span className="fit-header-cta-label">{user ? t('Vào portal', 'Enter portal') : pathname === '/login' ? t('Tham gia ngay', 'Join now') : t('Đăng nhập', 'Sign in')}</span><RoundArrow />
          </Link>
          <button type="button" className="fit-menu" aria-controls="public-navigation" aria-expanded={menuOpen} aria-label={menuOpen ? t('Đóng menu', 'Close menu') : t('Mở menu', 'Open menu')} onClick={() => setMenuOpen(!menuOpen)}>
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
              {menuOpen ? <path d="M4.5 4.5l7 7M11.5 4.5l-7 7" /> : <path d="M3.5 5h9M3.5 8h9M3.5 11h9" />}
            </svg>
          </button>
        </div>
      </header>
      {children}
      <footer className="fit-footer" id="contact">
        <div className="fit-footer-main">
          <div>
            <Link to="/" className="fit-brand" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}><span>{"SÖL"}</span>Fitness<span className="fit-brand-dot" aria-hidden="true">®</span></Link>
            <p>{t('Mạnh mẽ hơn mỗi ngày.', 'Stronger every day.')}<br />{t('Cân bằng theo cách của bạn.', 'Balanced your way.')}</p>
          </div>
          <nav aria-label={t('Điều hướng chân trang', 'Footer navigation')}>{links.map(({ to, hash: target, label, labelEn }) => <Link
            key={label}
            to={to}
            onClick={(event) => {
              if (target && pathname === '/') {
                if (hash === `#${target}`) {
                  event.preventDefault();
                }
                scrollToSection(target);
              } else if (!target && pathname === to) {
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }
            }}
          >{lang === 'en' ? labelEn : label}</Link>)}</nav>
          <address><span>{"120 Hai Bà Trưng, Quận 1, TP.HCM"}</span><a href="tel:19006868">1900 6868 ↗</a><a href="mailto:concierge@sol-wellness.vn">concierge@sol-wellness.vn</a></address>
        </div>
        <div className="fit-footer-bottom">
          <span>{"© 2026 SÖL Fitness"}</span>
          <span>{t('06:00 — 22:00 mỗi ngày', '06:00 — 22:00 daily')}</span>
          <LanguageSetting variant="footer" />
          <Link to={user ? homePath(user.role) : '/login'}>{user ? t('Không gian hội viên', 'Member workspace') : t('Đăng nhập hội viên', 'Member sign in')} ↗</Link>
        </div>
        <div className="fit-footer-watermark" aria-hidden="true">{"SÖL FITNESS"}</div>
      </footer>
    </div>
    <ChatWidget />
  </div>;
}

export function AuthLayout({ children, mode }: { children: ReactNode; mode: 'login' | 'register' }) {
  useSourceLanguage();
  const { lang, t } = useI18n();
  return <PublicLayout>
    <main id="public-main" className="fit-auth">
      <div className="fit-auth-story" data-reveal="soft">
        <h1>
          {mode === 'login'
            ? (lang === 'en' ? <>Return to<br /><em>your training schedule.</em></> : <>{sourceText("Trở lại")}<br /><em>{sourceText("lịch tập của bạn.")}</em></>)
            : (lang === 'en' ? <>Begin<br /><em>{"with SÖL."}</em></> : <>{sourceText("Bắt đầu")}<br /><em>{sourceText("cùng SÖL.")}</em></>)}
        </h1>
        <p>{mode === 'login' ? t('Đăng nhập để xem gói tập, đặt lịch lớp và theo dõi lịch tập của bạn.', 'Sign in to view your memberships, book classes, and track your schedule.') : t('Tạo tài khoản và xác thực email để bắt đầu chọn gói tập.', 'Create an account and verify your email to start choosing a membership.')}</p>
        <div className="fit-auth-photo"><LoadingImage src="/images/fitness/strength-session.jpg" alt={t('Vận động viên tập luyện sức mạnh với tạ tại phòng gym', 'Athlete performing strength training in the gym')} /><span>{sourceText("SHOW UP FOR YOURSELF.")}<RoundArrow diagonal /></span></div>
      </div>
      <div className="fit-auth-form" data-reveal="lift">{children}</div>
    </main>
  </PublicLayout>;
}
