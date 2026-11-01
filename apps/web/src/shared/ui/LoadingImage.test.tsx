import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { LoadingImage } from './LoadingImage';

const host = document.createElement('div');
let root: ReturnType<typeof createRoot>;
afterEach(async () => { await act(async () => root.unmount()); host.replaceChildren(); vi.unstubAllGlobals(); });

it('shows an image placeholder only while loading, resets on source change and settles errors immediately', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  root = createRoot(host);
  const render = (src: string) => act(async () => root.render(<LoadingImage src={src} alt="Phòng tập" className="existing-photo" />));
  await render('/first.jpg');
  let image = host.querySelector('img')!;
  expect(image.getAttribute('aria-busy')).toBe('true');
  expect(image.classList.contains('existing-photo')).toBe(true);
  await act(async () => image.dispatchEvent(new Event('load')));
  expect(image.getAttribute('aria-busy')).toBe('false');
  await render('/second.jpg');
  image = host.querySelector('img')!;
  expect(image.getAttribute('aria-busy')).toBe('true');
  await act(async () => image.dispatchEvent(new Event('error')));
  expect(image.getAttribute('aria-busy')).toBe('false');
  expect(image.alt).toBe('Phòng tập');
});
