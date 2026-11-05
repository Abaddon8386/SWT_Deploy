import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WeeklyTimetable } from './WeeklyTimetable';
import type { TimetableEvent } from './timetable';

const event: TimetableEvent = {
  id: '7', date: '2099-01-05', startTime: '08:00:00', endTime: '09:30:00',
  title: 'Yoga Flow', meta: 'Studio · HLV An', badge: '3/12 chỗ', tone: 'open', ariaLabel: 'Yoga Flow 08:00',
};
const legend = [{ tone: 'open' as const, label: 'Còn chỗ' }];

describe('WeeklyTimetable', () => {
  let host: HTMLDivElement;
  let root: Root;
  beforeEach(() => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    host = document.createElement('div'); document.body.append(host); root = createRoot(host);
  });
  afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.unstubAllGlobals(); });
  const render = (props: Partial<React.ComponentProps<typeof WeeklyTimetable>> = {}) => act(async () => root.render(
    <WeeklyTimetable label="Tuần" weekStart="2099-01-05" events={[event]} legend={legend}
      onWeekChange={() => {}} onEventClick={() => {}} {...props} />,
  ));

  it('fits a view-only week to the hours that have sessions and can expand to 06:00–22:00', async () => {
    await render();
    expect(host.querySelectorAll('.tt__day')).toHaveLength(7);
    // Buổi 08:00–09:30 -> khung tối thiểu 8 giờ, kẹp trong 06:00–22:00: 06:00–14:00.
    expect(host.querySelectorAll('.tt__day.is-first .tt__slot')).toHaveLength(8);
    // Không còn giờ ở mép trái: không cột giờ, không nhãn mốc giờ.
    expect(host.querySelector('.tt__gutter')).toBeNull();
    expect(host.querySelector('.tt__mark')).toBeNull();
    const toggle = host.querySelector<HTMLButtonElement>('.tt__span')!;
    expect(toggle.textContent).toBe('Hiện đủ 06:00–22:00');
    expect(toggle.getAttribute('aria-pressed')).toBe('false');
    await act(async () => toggle.click());
    expect(toggle.getAttribute('aria-pressed')).toBe('true');
    expect(toggle.textContent).toBe('Thu gọn 06:00–14:00');
    expect(host.querySelectorAll('.tt__day.is-first .tt__slot')).toHaveLength(16);
    expect(host.textContent).toContain('05/01 – 11/01/2099');
  });

  it('shows the full 06:00–22:00 range for an empty week without a toggle', async () => {
    await render({ events: [] });
    expect(host.querySelectorAll('.tt__day.is-first .tt__slot')).toHaveLength(16);
    expect(host.querySelector('.tt__span')).toBeNull();
  });

  it('positions events against the fitted range', async () => {
    await render({ events: [{ ...event, startTime: '18:00', endTime: '19:00' }] });
    // 18:00–19:00 -> 14:00–22:00 (8 giờ, chạm đáy 22:00 nên mở về phía trên); buổi bắt đầu ở 4/8 chiều cao.
    expect(host.querySelector<HTMLElement>('.tt__event')!.style.top).toBe('calc(50% + 2px)');
  });

  it('renders the event and reports clicks', async () => {
    const onEventClick = vi.fn();
    await render({ onEventClick });
    const button = host.querySelector<HTMLButtonElement>('.tt__event')!;
    expect(button.textContent).toContain('Yoga Flow');
    await act(async () => button.click());
    expect(onEventClick).toHaveBeenCalledWith('7');
  });

  it('has no clickable empty slots without onSlotClick', async () => {
    await render();
    expect(host.querySelectorAll('button.tt__slot')).toHaveLength(0);
  });

  it('lets a manager click an empty future slot and marks occupied slots', async () => {
    const onSlotClick = vi.fn();
    await render({ onSlotClick });
    expect(host.querySelectorAll('button.tt__slot')).toHaveLength(7 * 16);
    expect(host.querySelectorAll('.tt__slot.is-busy')).toHaveLength(2);
    const free = host.querySelector<HTMLButtonElement>('[data-slot="2099-01-06|10"]')!;
    await act(async () => free.click());
    expect(onSlotClick).toHaveBeenCalledWith({ date: '2099-01-06', startTime: '10:00', endTime: '11:00' });
  });

  it('ignores clicks on past slots', async () => {
    const onSlotClick = vi.fn();
    await render({ onSlotClick, weekStart: '2020-01-06', events: [] });
    const past = host.querySelector<HTMLButtonElement>('[data-slot="2020-01-06|10"]')!;
    expect(past.getAttribute('aria-disabled')).toBe('true');
    await act(async () => past.click());
    expect(onSlotClick).not.toHaveBeenCalled();
  });

  it('moves between slots with arrow keys (roving tabindex)', async () => {
    await render({ onSlotClick: () => {} });
    const first = host.querySelector<HTMLButtonElement>('[data-slot="2099-01-05|6"]')!;
    expect(first.tabIndex).toBe(0);
    first.focus();
    await act(async () => { first.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true })); });
    expect(document.activeElement).toBe(host.querySelector('[data-slot="2099-01-05|7"]'));
    expect(host.querySelectorAll('button.tt__slot[tabindex="0"]')).toHaveLength(1);
  });

  it('navigates weeks', async () => {
    const onWeekChange = vi.fn();
    await render({ onWeekChange });
    const next = [...host.querySelectorAll('button')].find((b) => b.textContent === 'Tuần sau')!;
    await act(async () => next.click());
    expect(onWeekChange).toHaveBeenCalledWith('2099-01-12');
  });

  it('shows an empty hint, an error with retry, and a loading status', async () => {
    await render({ events: [] });
    expect(host.textContent).toContain('chưa có buổi học nào');
    const onRetry = vi.fn();
    await render({ error: 'Lỗi mạng', onRetry });
    expect(host.querySelector('[role="alert"]')!.textContent).toContain('Lỗi mạng');
    await act(async () => [...host.querySelectorAll('button')].find((b) => b.textContent === 'Thử lại')!.click());
    expect(onRetry).toHaveBeenCalled();
    await render({ loading: true });
    expect(host.querySelector('[aria-busy="true"]')).not.toBeNull();
  });

  it('shows one day at a time with a day picker on narrow screens', async () => {
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: query.includes('max-width'), media: query, addEventListener: () => {}, removeEventListener: () => {},
    }));
    const onSlotClick = vi.fn();
    await render({ onSlotClick, events: [event, { ...event, id: '8', date: '2099-01-07', title: 'Boxing' }] });
    expect(host.querySelectorAll('.tt__day')).toHaveLength(1);
    expect(host.querySelector('.tt__day')!.getAttribute('aria-label')).toContain('05/01');
    const chips = [...host.querySelectorAll<HTMLButtonElement>('.tt__daychip')];
    expect(chips).toHaveLength(7);
    expect(chips[0].textContent).toContain('1 buổi');
    expect(chips[1].textContent).toContain('Trống');
    await act(async () => chips[2].click());
    expect(host.querySelector('.tt__day')!.getAttribute('aria-label')).toContain('07/01');
    expect(host.querySelector('.tt__event')!.textContent).toContain('Boxing');
    expect(host.querySelectorAll('button.tt__slot')).toHaveLength(16);
  });

  it('opens on the day of the selected block on narrow screens', async () => {
    vi.stubGlobal('matchMedia', () => ({ matches: true, addEventListener: () => {}, removeEventListener: () => {} }));
    await render({ events: [event, { ...event, id: '8', date: '2099-01-09', title: 'Boxing' }], selectedId: '8' });
    expect(host.querySelector('.tt__day')!.getAttribute('aria-label')).toContain('09/01');
  });

  it('shows name, status, time and room in each block since there is no hour column', async () => {
    await render();
    const body = host.querySelector('.tt__event-body')!;
    expect([...body.children].map((node) => node.textContent)).toEqual(['Yoga Flow', '3/12 chỗ', '08:00–09:00 · Studio · HLV An']);
    expect(host.querySelector('.tt__event')!.getAttribute('title')).toContain('08:00–10:00');
  });

  it('draws one block per hour, rounded out to whole hours, and every block opens the same session', async () => {
    const onEventClick = vi.fn();
    await render({ onEventClick, events: [{ ...event, startTime: '11:00', endTime: '14:30' }] });
    const blocks = [...host.querySelectorAll<HTMLButtonElement>('.tt__event')];
    expect(blocks.map((block) => block.querySelector('.tt__event-meta')!.textContent!.slice(0, 11)))
      .toEqual(['11:00–12:00', '12:00–13:00', '13:00–14:00', '14:00–15:00']);
    expect(blocks[1].getAttribute('aria-label')).toContain('giờ 2/4');
    await act(async () => blocks[2].click());
    expect(onEventClick).toHaveBeenCalledWith('7');
  });
});
