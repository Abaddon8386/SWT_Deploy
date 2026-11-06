import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, expect, it, vi } from 'vitest';
import { CatalogPackages, CatalogSchedule, CatalogTrainers } from './components/CatalogSections';
import { usePublicCatalog } from './publicCatalog';
import type { PublicCatalog } from './publicCatalog';

const catalog: PublicCatalog = {
  packages: [{ id: 1, name: 'Gói mới', price: 789000, durationDays: 45, classCreditLimit: 8, description: 'Quyền lợi mới', status: 'active' }],
  coaches: [{ id: 2, name: 'HLV An', specialization: 'Yoga', bio: 'Hồ sơ mới', certification: 'Yoga 200h', avatarUrl: null }],
  sessions: [{ id: 3, classId: 1, className: 'Yoga sáng', disciplineId: 1, disciplineName: 'Yoga', coachId: 2, coachName: 'HLV An', roomId: 1, roomName: 'Phòng 1', sessionDate: '2026-10-24', startTime: '09:00:00', endTime: '10:00:00', status: 'scheduled', cancelReason: null, capacity: 12, bookedCount: 5 }],
};
const host = document.createElement('div');
let root: ReturnType<typeof createRoot>;
afterEach(async () => { if (root) await act(async () => root.unmount()); host.replaceChildren(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it('renders API price, duration, benefits, coaches and actual session seats without sample identities', async () => {
  root = createRoot(host);
  await act(async () => root.render(<MemoryRouter>
    <CatalogPackages catalog={catalog} joinPath="/member/packages" />
    <CatalogTrainers catalog={catalog} />
    <CatalogSchedule catalog={catalog} joinPath="/member/classes" />
  </MemoryRouter>));
  expect(host.textContent).toContain('789.000');
  expect(host.textContent).toContain('45 ngày');
  expect(host.textContent).toContain('Quyền lợi mới');
  expect(host.textContent).toContain('HLV An');
  expect(host.textContent).toContain('Ảnh minh họa');
  expect(host.textContent).toContain('Yoga sáng');
  expect(host.textContent).toContain('7 chỗ trống');
  expect(host.querySelector('a[href="/trainers/2"]')).not.toBeNull();
  expect(host.textContent).not.toMatch(/Derek|1\.200\.000/);
});

it('shows empty states when no public packages, coaches or sessions exist', async () => {
  root = createRoot(host);
  const empty = { packages: [], coaches: [], sessions: [] };
  await act(async () => root.render(<MemoryRouter>
    <CatalogPackages catalog={empty} joinPath="/register" />
    <CatalogTrainers catalog={empty} />
    <CatalogSchedule catalog={empty} joinPath="/login" />
  </MemoryRouter>));
  expect(host.textContent).toContain('Chưa có gói tập');
  expect(host.textContent).toContain('Chưa có huấn luyện viên');
  expect(host.textContent).toContain('Chưa có lịch lớp');
});

it('falls back to all sessions when a refresh removes the selected discipline', async () => {
  root = createRoot(host);
  const tennis = { ...catalog.sessions[0], id: 4, disciplineName: 'Tennis', className: 'Tennis mới' };
  const render = (sessions: PublicCatalog['sessions']) => <MemoryRouter><CatalogSchedule catalog={{ ...catalog, sessions }} joinPath="/login" /></MemoryRouter>;
  await act(async () => root.render(render([...catalog.sessions, tennis])));
  const yoga = [...host.querySelectorAll('button')].find(button => button.textContent === 'Yoga')!;
  await act(async () => yoga.click());
  expect(host.textContent).not.toContain('Tennis mới');
  await act(async () => root.render(render([tennis])));
  expect(host.textContent).toContain('Tennis mới');
});

it('ignores older responses and hides stale prices on a failed refresh, then retries', async () => {
  const responses: ((response: Response) => void)[] = [];
  vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(resolve => responses.push(resolve))));
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
  function Probe() {
    const { catalog: data, error, retry } = usePublicCatalog();
    return <><p>{error ? 'error' : data?.packages[0]?.price ?? 'loading'}</p><button onClick={retry}>retry</button></>;
  }
  const reply = (price: number) => new Response(JSON.stringify({ data: { ...catalog, packages: [{ ...catalog.packages[0], price }] } }), { status: 200 });
  root = createRoot(host);
  await act(async () => root.render(<Probe />));
  await act(async () => window.dispatchEvent(new Event('focus')));
  await act(async () => responses[1](reply(990000)));
  await act(async () => responses[0](reply(100000)));
  expect(host.textContent).toContain('990000');
  expect(host.textContent).not.toContain('100000');
  await act(async () => window.dispatchEvent(new Event('focus')));
  await act(async () => responses[2](new Response('{}', { status: 503 })));
  expect(host.textContent).toContain('error');
  expect(host.textContent).not.toContain('990000');
  await act(async () => host.querySelector('button')!.click());
  expect(host.textContent).toContain('loading');
  expect(host.textContent).not.toContain('error');
  await act(async () => responses[3](reply(1100000)));
  expect(host.textContent).toContain('1100000');
});

it('excludes trial packages from the public catalog pricing grid', async () => {
  root = createRoot(host);
  const catalogWithTrial: PublicCatalog = {
    ...catalog,
    packages: [
      ...catalog.packages,
      { id: 99, name: 'Gói Trải Nghiệm 3 Ngày', price: 0, durationDays: 3, classCreditLimit: 3, description: 'Gói trải nghiệm', status: 'active' },
    ],
  };
  await act(async () => root.render(<MemoryRouter>
    <CatalogPackages catalog={catalogWithTrial} joinPath="/register" />
  </MemoryRouter>));
  expect(host.textContent).toContain('Gói mới');
  expect(host.textContent).not.toContain('Gói Trải Nghiệm 3 Ngày');
  expect(host.textContent).not.toContain('0 đ');
});
