import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { createMemoryRouter, Outlet, RouterProvider } from 'react-router-dom';
import { afterEach, expect, it, vi } from 'vitest';
import { LanguageSetting } from './LanguageSetting';
import { getLanguage, setLanguage, useDomLanguageSync, useI18n } from './language';

function Shell() {
  useDomLanguageSync();
  return <><LanguageSetting variant="menu" /><Outlet /><LanguageSetting variant="footer" /></>;
}
function Page() {
  const { t } = useI18n();
  return <main data-page-label data-i18n-managed>{t('Trang chủ', 'Home')}</main>;
}

afterEach(() => { vi.unstubAllGlobals(); localStorage.clear(); setLanguage('vi'); });

it('preserves language endonyms and button nodes through legacy translation, Member navigation and preference reload', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  setLanguage('en');
  const host = document.createElement('div');
  document.body.append(host);
  let root = createRoot(host);
  const makeRouter = () => createMemoryRouter([{ element: <Shell />, children: [
    { path: '/member/dashboard', element: <Page /> },
    { path: '/member/support', element: <Page /> },
  ] }], { initialEntries: ['/member/dashboard'] });
  let router = makeRouter();
  const button = (variant: string, locale: string) => host.querySelector<HTMLButtonElement>(`[data-testid="${variant}-lang-${locale}"]`)!;
  function assertChoices(locale: 'vi' | 'en') {
    for (const variant of ['menu', 'footer']) {
      const prefix = variant === 'menu' ? 'avatar' : variant;
      const group = host.querySelector(`[data-testid="${prefix}-language-setting"]`)!;
      expect(group.getAttribute('translate')).toBe('no');
      expect(group.hasAttribute('data-i18n-managed')).toBe(true);
      expect(group.classList.contains('notranslate')).toBe(true);
      expect(button(prefix, 'vi').textContent?.trim()).toBe('Tiếng Việt');
      expect(button(prefix, 'en').textContent?.trim()).toBe('English');
      expect(button(prefix, 'vi').lang).toBe('vi');
      expect(button(prefix, 'en').lang).toBe('en');
      expect(group.querySelectorAll('button')).toHaveLength(2);
      expect(group.querySelectorAll('button.active')).toHaveLength(1);
      expect(group.querySelectorAll('[aria-pressed="true"]')).toHaveLength(1);
      expect(button(prefix, locale).getAttribute('aria-pressed')).toBe('true');
    }
  }
  try {
    await act(async () => root.render(<RouterProvider router={router} />));
    assertChoices('en');
    const viNode = button('footer', 'vi');
    const enNode = button('footer', 'en');
    // A mapped legacy phrase inserted inside the managed controls must remain untouched.
    const probe = document.createElement('span');
    probe.textContent = 'Gói tập';
    await act(async () => { viNode.append(probe); await new Promise(resolve => setTimeout(resolve, 30)); });
    expect(probe.textContent).toBe('Gói tập');
    probe.remove();
    await act(async () => router.navigate('/member/support'));
    assertChoices('en');
    expect(button('footer', 'vi')).toBe(viNode);
    expect(button('footer', 'en')).toBe(enNode);
    await act(async () => viNode.click());
    assertChoices('vi');
    expect(host.querySelector('[data-page-label]')?.textContent).toBe('Trang chủ');
    await act(async () => button('avatar', 'en').click());
    assertChoices('en');
    expect(host.querySelector('[data-page-label]')?.textContent).toBe('Home');
    await act(async () => root.unmount());
    router.dispose();
    root = createRoot(host);
    router = makeRouter();
    await act(async () => root.render(<RouterProvider router={router} />));
    assertChoices('en');
    expect(getLanguage()).toBe('en');
    await act(async () => button('footer', 'vi').click());
    assertChoices('vi');
  } finally {
    await act(async () => root.unmount());
    router.dispose();
    host.remove();
  }
});
