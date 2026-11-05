import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { MemberCheckInPage } from './MemberCheckInPage';

const camera = vi.hoisted(() => ({ decode: null as null | ((value: { data: string }) => void) }));
vi.mock('qr-scanner', () => ({ default: class {
  constructor(_video: unknown, decode: typeof camera.decode) { camera.decode = decode; }
  start = async () => {};
  destroy = () => {};
} }));
let host: HTMLDivElement; let root: Root;
beforeEach(() => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.stubGlobal('isSecureContext', true);
  Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia: vi.fn() } });
  vi.stubGlobal('fetch', vi.fn(async (url: string) => new Response(JSON.stringify({ success: true, data: url.includes('/self') ? {
    id: 1, memberId: 10, memberName: 'An', checkInTime: '2026-10-29T14:00:00', gate: 'Sảnh chính', status: 'GRANTED', method: 'qr',
  } : [] }))));
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.unstubAllGlobals(); });
async function render() { await act(async () => root.render(<MemoryRouter><MemberCheckInPage /></MemoryRouter>)); }
it('submits the decoded gate code once and waits for the server before showing success', async () => {
  await render();
  const button = [...host.querySelectorAll('button')].find((item) => item.textContent === 'Bật camera')!;
  await act(async () => button.click());
  const code = `SOL:GATE:1:A1:1793256000000:${'a'.repeat(64)}`;
  await act(async () => { camera.decode!({ data: code }); camera.decode!({ data: code }); });
  const posts = vi.mocked(fetch).mock.calls.filter((call) => String(call[0]).includes('/self'));
  expect(posts).toHaveLength(1);
  expect(JSON.parse(posts[0][1]?.body as string)).toEqual({ gateQr: code });
  expect(host.textContent).toContain('Check-in thành công');
});
it('rejects unrelated QR content without sending a check-in', async () => {
  await render();
  await act(async () => [...host.querySelectorAll('button')].find((item) => item.textContent === 'Bật camera')!.click());
  await act(async () => camera.decode!({ data: 'https://example.com' }));
  expect(host.textContent).toContain('Đây không phải mã QR cổng SÖL');
  expect(vi.mocked(fetch).mock.calls.filter((call) => String(call[0]).includes('/self'))).toHaveLength(0);
});
it('sends the gate code to the checkout endpoint in check-out mode', async () => {
  await render();
  await act(async () => [...host.querySelectorAll('button')].find((item) => item.textContent === 'Check-out')!.click());
  await act(async () => [...host.querySelectorAll('button')].find((item) => item.textContent === 'Bật camera')!.click());
  const code = `SOL:GATE:1:A1:1793256000000:${'a'.repeat(64)}`;
  await act(async () => camera.decode!({ data: code }));
  expect(vi.mocked(fetch).mock.calls.filter((call) => String(call[0]).includes('/self/checkout'))).toHaveLength(1);
});
it('requests a date range when a longer history window is chosen', async () => {
  await render();
  await act(async () => [...host.querySelectorAll('button')].find((item) => item.textContent === '7 ngày')!.click());
  expect(vi.mocked(fetch).mock.calls.some((call) => String(call[0]).includes('fromDate='))).toBe(true);
});
