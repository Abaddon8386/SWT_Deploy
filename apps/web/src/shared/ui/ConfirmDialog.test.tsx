import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useConfirm, type ConfirmOptions } from './ConfirmDialog';
import { toast } from './toast';

let host: HTMLDivElement, root: Root;
const results: Promise<boolean>[] = [];
let pending: ConfirmOptions;
function Harness() {
  const [confirm, dialog] = useConfirm();
  return <><button type="button" data-open onClick={() => { results.push(confirm(pending)); }}>open</button>{dialog}</>;
}
async function ask(options: ConfirmOptions) {
  pending = options;
  await act(async () => host.querySelector<HTMLButtonElement>('[data-open]')!.click());
  return { result: results.at(-1)! };
}
beforeEach(async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
  await act(async () => root.render(<Harness />));
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); document.querySelectorAll('.sol-toast').forEach((n) => n.remove()); vi.unstubAllGlobals(); });
const button = (text: string) => Array.from(host.querySelectorAll('button')).find((b) => b.textContent === text)!;

it('resolves true when confirmed and uses the danger style for destructive actions', async () => {
  const { result } = await ask({ title: 'Khóa tài khoản?', message: 'Không thể đăng nhập.', confirmLabel: 'Khóa', danger: true });
  expect(host.querySelector('dialog')?.textContent).toContain('Khóa tài khoản?');
  expect(button('Khóa').className).toBe('btn-danger');
  await act(async () => button('Khóa').click());
  await expect(result).resolves.toBe(true);
  expect(host.querySelector('dialog')).toBeNull();
});

it('resolves false when cancelled', async () => {
  const { result } = await ask({ title: 'Ẩn bản ghi?', message: 'Chỉ trên trình duyệt này.' });
  await act(async () => button('Hủy').click());
  await expect(result).resolves.toBe(false);
});

it('shows a corner toast without covering the page and closes it with Escape', () => {
  toast('Đã lưu.', 'success');
  const el = document.querySelector('.sol-toast')!;
  expect(el.getAttribute('role')).toBe('status');
  expect(el.querySelector('.sol-toast__close')).not.toBeNull();
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
  expect(document.querySelector('.sol-toast')).toBeNull();
});
