import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { DatePicker } from './DatePicker';
import { TimePicker } from './TimePicker';
let host: HTMLDivElement;
let root: Root;
beforeEach(() => { vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true); host = document.createElement('div'); document.body.append(host); root = createRoot(host); });
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.unstubAllGlobals(); });
it('associates a date label with the visible trigger and preserves the submitted value', async () => {
  await act(async () => root.render(<form><label htmlFor="session-date">Ngày học</label><DatePicker id="session-date" value="2026-10-31" onChange={() => {}} /></form>));
  const trigger = host.querySelector('button')!;
  expect(host.querySelector('label')!.control).toBe(trigger);
  expect(new FormData(host.querySelector('form')!).get('session-date')).toBe('2026-10-31');
});
it.each(['date', 'time'])('consumes Escape inside an open %s picker and restores trigger focus', async (kind) => {
  const Picker = kind === 'date' ? DatePicker : TimePicker;
  await act(async () => root.render(<Picker value={kind === 'date' ? '2026-10-21' : '08:00'} onChange={() => {}} />));
  const trigger = host.querySelector('button')!;
  await act(async () => trigger.click());
  expect(host.querySelector('[role=dialog]')).not.toBeNull();
  const escape = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
  await act(async () => document.dispatchEvent(escape));
  expect(escape.defaultPrevented).toBe(true);
  expect(host.querySelector('[role=dialog]')).toBeNull();
  expect(document.activeElement).toBe(trigger);
});
it('allows existing schedules at any minute instead of rounding to five-minute intervals', async () => {
  await act(async () => root.render(<TimePicker value="08:03" onChange={() => {}} />));
  await act(async () => host.querySelector('button')!.click());
  expect([...host.querySelectorAll('.ltp-col:last-child .ltp-col-scroll button')].some(b => b.textContent === '03')).toBe(true);
});
