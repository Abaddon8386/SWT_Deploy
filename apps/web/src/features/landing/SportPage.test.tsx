import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { SportPage } from './SportPage';
import { SPORT_PAGES, sportIdFromPath } from './sportPages';

vi.mock('./publicCatalog', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./publicCatalog')>()),
  usePublicCatalog: () => ({ catalog: {
    packages: [], coaches: [],
    sessions: [
      { id: 1, classId: 1, className: 'Boxing căn bản', disciplineId: 1, disciplineName: 'Boxing & Kickfit', coachId: 1, coachName: 'HLV A', roomId: 1, roomName: 'Phòng 1', sessionDate: '2999-01-01', startTime: '18:00:00', endTime: '19:00:00', status: 'scheduled', capacity: 10, bookedCount: 2 },
      { id: 2, classId: 2, className: 'Cầu lông đôi', disciplineId: 2, disciplineName: 'Cầu lông', coachId: 2, coachName: 'HLV B', roomId: 2, roomName: 'Sân 1', sessionDate: '2999-01-01', startTime: '19:00:00', endTime: '20:00:00', status: 'scheduled', capacity: 10, bookedCount: 2 },
    ],
  }, error: false, retry: vi.fn() }),
}));

let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('IntersectionObserver', class { observe() {} unobserve() {} disconnect() {} });
  vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener() {}, removeEventListener() {} }));
  host = document.createElement('div'); document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.unstubAllGlobals(); });

const render = (path: string) => act(async () => root.render(
  <MemoryRouter initialEntries={[path]}><Routes>
    <Route path="/sports/:sportId" element={<SportPage />} />
    <Route path="/:any" element={<SportPage />} />
  </Routes></MemoryRouter>));

it.each([
  ['/boxing', 'Phòng Tập Boxing', 'Boxing căn bản', 'Boxing'],
  ['/badminton', 'Sân Cầu Lông', 'Cầu lông đôi', 'Cầu lông'],
])('renders the %s page with its own programs and only its own classes', async (path, title, className, name) => {
  await render(path);
  expect(host.querySelector('h1')?.textContent).toContain(title);
  expect(host.textContent).toContain(className);
  const other = className === 'Boxing căn bản' ? 'Cầu lông đôi' : 'Boxing căn bản';
  expect(host.textContent).not.toContain(other);
  expect(host.querySelectorAll('.fit-sport-page-program-card')).toHaveLength(3);
  expect(host.querySelector('.fit-trainer-stats-row')).toBeNull();
  // Chưa đăng nhập: nút đặt lịch dẫn tới đăng nhập
  expect([...host.querySelectorAll('a.fit-pill')].map((link) => link.textContent)).toContain(`Đặt lịch ${name}`);
  expect([...host.querySelectorAll('a.fit-pill')].find((link) => link.textContent?.startsWith('Đặt lịch'))?.getAttribute('href')).toBe('/login');
  expect([...host.querySelectorAll('.fit-trainer-switch-pill')].map((link) => link.getAttribute('href')))
    .toEqual(['/swimming', '/boxing', '/tennis', '/badminton']);
  expect(host.querySelector('[aria-current="page"]')?.getAttribute('href')).toBe(path);
});

it('resolves sport ids from both route shapes', () => {
  expect(sportIdFromPath('/boxing')).toBe('boxing');
  expect(sportIdFromPath('/sports/badminton')).toBe('badminton');
  expect(sportIdFromPath('/')).toBeUndefined();
  expect(Object.keys(SPORT_PAGES)).toEqual(['swimming', 'boxing', 'tennis', 'badminton']);
});
