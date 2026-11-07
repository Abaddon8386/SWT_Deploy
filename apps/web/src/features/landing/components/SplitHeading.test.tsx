import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { SplitHeading } from './SplitHeading';
import { setLanguage } from '../../../shared/i18n';

vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
afterEach(() => { setLanguage('vi'); });

it('renders original-English public heading source in both locales without DOM replacement', async () => {
  const host = document.createElement('div'); document.body.append(host);
  const root = createRoot(host);
  setLanguage('vi');
  await act(async () => root.render(<SplitHeading id="heading" lines={['Our Trainers']} />));
  expect(host.textContent).toContain('Đội ngũ huấn luyện viên');
  const heading = host.querySelector('h2');
  await act(async () => setLanguage('en'));
  expect(host.textContent).toContain('Our Trainers');
  expect(host.querySelector('h2')).toBe(heading);
  await act(async () => setLanguage('vi'));
  expect(host.textContent).toContain('Đội ngũ huấn luyện viên');
  await act(async () => root.unmount()); host.remove();
});
