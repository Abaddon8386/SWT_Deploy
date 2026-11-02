import { afterEach, describe, expect, it, vi } from 'vitest';
import { aiApi } from './aiApi';

describe('aiApi errors', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('does not report a successful recommendation or save when the server fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => new Response(JSON.stringify({ message: 'Server error' }), { status: 500 })));
    await expect(aiApi.generateWorkoutPlan({ memberId: 1 })).rejects.toThrow('Server error');
    await expect(aiApi.saveTrainingPlan({ memberId: 1, title: 'Plan', goal: 'Goal', startDate: '2026-10-19', endDate: '2026-10-25', items: [] })).rejects.toThrow('Server error');
  });

  it('starts every class roster request together and keeps class order while ignoring a failed roster', async () => {
    const finish = new Map<string, (response: Response) => void>();
    const fetch = vi.fn((url: string) => url === '/api/v1/classes'
      ? Promise.resolve(new Response(JSON.stringify([{ id: 1 }, { id: 2 }, { id: 3 }])))
      : new Promise<Response>(resolve => { finish.set(url, resolve); }));
    vi.stubGlobal('fetch', fetch);

    const members = aiApi.getCoachMembers();
    await vi.waitFor(() => expect([...finish.keys()]).toEqual([
      '/api/v1/classes/1/students', '/api/v1/classes/2/students', '/api/v1/classes/3/students',
    ]), { timeout: 300 });

    finish.get('/api/v1/classes/3/students')!(new Response(JSON.stringify([
      { memberId: 7, fullName: 'Tên ở lớp sau' }, { memberId: 9, fullName: 'Học viên thứ ba' },
    ])));
    finish.get('/api/v1/classes/2/students')!(new Response(JSON.stringify({ message: 'offline' }), { status: 500 }));
    finish.get('/api/v1/classes/1/students')!(new Response(JSON.stringify([
      { memberId: 7, fullName: 'Học viên đầu tiên' }, { memberId: 8, fullName: 'Học viên thứ hai' },
    ])));

    const result = await members;
    expect(result.map(member => member.id)).toEqual([7, 8, 9]);
    expect(result[0].fullName).toBe('Học viên đầu tiên');
  });

  it('returns an empty list instead of sample members when no class has enrolled members', async () => {
    vi.stubGlobal('fetch', vi.fn((url: string) => Promise.resolve(url === '/api/v1/classes'
      ? new Response(JSON.stringify([{ id: 1 }]))
      : new Response(JSON.stringify([])))));
    expect(await aiApi.getCoachMembers()).toEqual([]);
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(new Response(JSON.stringify([])))));
    expect(await aiApi.getCoachMembers()).toEqual([]);
  });

  it('surfaces a load failure instead of inventing members when every roster or the class list fails', async () => {
    vi.stubGlobal('fetch', vi.fn((url: string) => Promise.resolve(url === '/api/v1/classes'
      ? new Response(JSON.stringify([{ id: 1 }, { id: 2 }]))
      : new Response(JSON.stringify({ message: 'roster offline' }), { status: 500 }))));
    await expect(aiApi.getCoachMembers()).rejects.toThrow('roster offline');

    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(new Response(JSON.stringify({ message: 'classes offline' }), { status: 500 }))));
    await expect(aiApi.getCoachMembers()).rejects.toThrow('classes offline');
  });

  it('sends coach_id only when a manager chooses the responsible coach', async () => {
    const fetch = vi.fn(() => Promise.resolve(new Response(JSON.stringify({ data: { id: 5, status: 'active' } }))));
    vi.stubGlobal('fetch', fetch);
    const base = { memberId: 8, title: 'Plan', goal: 'Goal', startDate: '2026-11-03', endDate: '2026-11-30', items: [] };
    await aiApi.saveTrainingPlan({ ...base, coachId: 12 });
    await aiApi.saveTrainingPlan(base);
    const bodies = (fetch.mock.calls as unknown as Array<[string, RequestInit]>).map(([, init]) => JSON.parse(String(init.body)));
    expect(bodies[0].coach_id).toBe(12);
    expect(bodies[1]).not.toHaveProperty('coach_id');
  });
});
