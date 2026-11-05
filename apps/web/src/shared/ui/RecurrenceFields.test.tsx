import { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { RecurrenceFields, RecurrenceSummary } from './RecurrenceFields';
import type { RecurrenceChoice } from '../lib/recurrence';

let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.unstubAllGlobals(); });

function Harness({ onChange }: { onChange: (value: RecurrenceChoice) => void }) {
  const [value, setValue] = useState<RecurrenceChoice>({ period: 'once', days: [] });
  return <RecurrenceFields startDate="2026-11-02" value={value} onChange={(next) => { setValue(next); onChange(next); }} />;
}
const press = (label: string) => act(async () => {
  [...host.querySelectorAll('button')].find((b) => b.textContent === label || b.getAttribute('aria-label')?.startsWith(label))!.click();
});

it('hides weekdays for a one-off booking and previews the dates of a standing week or month', async () => {
  const seen: RecurrenceChoice[] = [];
  await act(async () => root.render(<Harness onChange={(value) => seen.push(value)} />));
  expect(host.textContent).not.toContain('T2');
  await press('Cả tuần');
  expect(seen.at(-1)).toEqual({ period: 'week', days: [1] });
  expect(host.textContent).toContain('Sẽ đặt 1 buổi: 02/11');
  await press('T4');
  await press('T6');
  expect(host.textContent).toContain('Sẽ đặt 3 buổi: 02/11, 04/11, 06/11');
  await press('Cả tháng');
  expect(host.textContent).toContain('Sẽ đặt 13 buổi');
});

it('never lets the last weekday be unselected', async () => {
  const seen: RecurrenceChoice[] = [];
  await act(async () => root.render(<Harness onChange={(value) => seen.push(value)} />));
  await press('Cả tuần');
  await press('T2');
  expect(seen.at(-1)?.days).toEqual([1]);
});

it('summarises booked and skipped dates, or says nothing could be booked', async () => {
  await act(async () => root.render(<RecurrenceSummary booked={['A']} skipped={[{ date: '2026-11-04', code: 'X', message: '' }]} describe={(item) => `Buổi ${item}`} />));
  expect(host.textContent).toContain('Đã đặt 1 buổi, bỏ qua 1 buổi');
  expect(host.textContent).toContain('Buổi A');
  expect(host.textContent).toContain('04/11: X');
  await act(async () => root.render(<RecurrenceSummary booked={[]} skipped={[]} describe={() => ''} />));
  expect(host.textContent).toContain('Không đặt được buổi nào');
});

it('filters out disallowed periods such as month when allowedPeriods is specified', async () => {
  await act(async () => {
    root.render(
      <RecurrenceFields
        startDate="2026-11-02"
        value={{ period: 'once', days: [] }}
        onChange={() => {}}
        allowedPeriods={['once', 'week']}
      />
    );
  });
  expect(host.textContent).toContain('Một buổi');
  expect(host.textContent).toContain('Hàng tuần');
  expect(host.textContent).not.toContain('Hàng tháng');
  expect(host.textContent).not.toContain('Cả tháng');
});

it('keeps the selected start weekday when the last weekday is toggled off', async () => {
  let currentVal: RecurrenceChoice = { period: 'week', days: [4] };
  await act(async () => {
    root.render(
      <RecurrenceFields
        startDate="2026-11-05"
        value={currentVal}
        onChange={(next) => { currentVal = next; }}
      />
    );
  });
  await press('T5');
  expect(currentVal.days).toEqual([4]);
});


it('previews the selected start weekday when a recurring choice has no explicit days', async () => {
  await act(async () => root.render(<RecurrenceFields startDate="2026-11-05" value={{ period: 'week', days: [] }} onChange={() => {}} />));
  expect(host.textContent).toContain('Sẽ đặt 1 buổi: 05/11');
  expect(host.querySelector('button[aria-label="T5, đã chọn"]')).not.toBeNull();
});
