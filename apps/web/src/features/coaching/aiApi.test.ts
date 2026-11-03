import { afterEach, describe, expect, it, vi } from 'vitest';
import { aiApi } from './aiApi';

describe('aiApi errors', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('does not report a successful recommendation or save when the server fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => new Response(JSON.stringify({ message: 'Server error' }), { status: 500 })));
    await expect(aiApi.generateWorkoutPlan({ memberId: 1 })).rejects.toThrow('Server error');
    await expect(aiApi.saveTrainingPlan({ memberId: 1, title: 'Plan', goal: 'Goal', startDate: '2026-10-19', endDate: '2026-10-25', items: [] })).rejects.toThrow('Server error');
  });

  it('loads assigned members from the authoritative directory including PT-only members', async () => {
 const fetch=vi.fn().mockResolvedValue(new Response(JSON.stringify([{id:7,memberCode:'TEST-7',fullName:'PT-only'}])));vi.stubGlobal('fetch',fetch);
 expect((await aiApi.getCoachMembers()).map(member=>member.id)).toEqual([7]);
 expect(fetch).toHaveBeenCalledWith('/api/v1/coaching/members',expect.anything());
 });
 it('keeps empty assignment and error states distinct without falling back to all members',async()=>{
 vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response('[]')));expect(await aiApi.getCoachMembers()).toEqual([]);
 vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response(JSON.stringify({message:'Denied'}),{status:403})));await expect(aiApi.getCoachMembers()).rejects.toThrow('Denied');
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
  it('persists rest seconds when creating a plan and keeps exercise IDs on edit', async () => {
    const fetch=vi.fn(()=>Promise.resolve(new Response(JSON.stringify({data:{id:5,status:'active'}}))));vi.stubGlobal('fetch',fetch);
    await aiApi.saveTrainingPlan({memberId:8,title:'Plan',goal:'Goal',startDate:'2026-11-03',endDate:'2026-11-30',items:[{dayOfWeek:1,exerciseName:'Squat',sets:3,reps:10,restSeconds:0}]});
    await aiApi.updateTrainingPlan(5,{goal:'Goal',startDate:'2026-11-03',endDate:'2026-11-30',items:[{id:501,exerciseName:'Squat',sets:5,reps:8,restSeconds:90}]});
    const bodies=(fetch.mock.calls as unknown as Array<[string,RequestInit]>).map(([,init])=>JSON.parse(String(init.body)));
    expect(bodies[0].items[0].rest_seconds).toBe(0);expect(bodies[1].items[0]).toMatchObject({id:501,sets:5,reps:8,restSeconds:90});
  });

});
