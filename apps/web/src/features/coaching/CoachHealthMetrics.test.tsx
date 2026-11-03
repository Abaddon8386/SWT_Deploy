import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { beforeEach, afterEach, it, expect, vi } from 'vitest';
import { CoachHealthMetrics } from './CoachHealthMetrics';
import * as api from '../member/profileApi';
vi.mock('../member/profileApi', () => ({ listHealthMetrics: vi.fn(), addHealthMetric: vi.fn() }));
vi.mock('../../shared/lib/portalNotices', () => ({ notify: vi.fn() }));
let host: HTMLDivElement; let root: Root;
beforeEach(() => { vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);host=document.createElement('div');document.body.append(host);root=createRoot(host);vi.mocked(api.listHealthMetrics).mockResolvedValue([]);vi.mocked(api.addHealthMetric).mockResolvedValue({}); });
afterEach(async () => {await act(async()=>root.unmount());host.remove();vi.resetAllMocks();vi.unstubAllGlobals();});
async function render(id=10){await act(async()=>root.render(<CoachHealthMetrics memberId={id} memberName={'Member '+id} />));}
async function fill(){const input=host.querySelector('input')!;await act(async()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(input,'70');input.dispatchEvent(new Event('input',{bubbles:true}));});}
it('loads real history and appends a measurement then refetches', async()=>{await render();expect(host.textContent).toContain('Chưa có số đo');await fill();await act(async()=>host.querySelector('form')!.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));expect(api.addHealthMetric).toHaveBeenCalledWith(10,{metricName:'weight',metricValue:70,unit:'kg'});expect(api.listHealthMetrics).toHaveBeenCalledTimes(2);});
it('does not present failed reads as empty data and supports retry',async()=>{vi.mocked(api.listHealthMetrics).mockRejectedValueOnce(new Error('offline'));await render();expect(host.querySelector('[role="alert"]')).not.toBeNull();expect(host.querySelector('form')).toBeNull();await act(async()=>host.querySelector('button')!.click());expect(host.querySelector('form')).not.toBeNull();});
it('preserves input when saving fails',async()=>{vi.mocked(api.addHealthMetric).mockRejectedValueOnce(new Error('forbidden'));await render();await fill();await act(async()=>host.querySelector('form')!.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));expect(host.querySelector('[role="alert"]')).not.toBeNull();expect(host.querySelector('input')!.value).toBe('70');});
it('does not let an old member response replace the selected member history',async()=>{let finish!:(v:api.HealthMetric[])=>void;vi.mocked(api.listHealthMetrics).mockImplementationOnce(()=>new Promise(r=>{finish=r;}));await render(10);await render(11);await act(async()=>finish([{id:1,metricName:'weight',metricValue:999,unit:'kg',recordedAt:'2026-11-03T08:00:00'}]));expect(host.textContent).not.toContain('999');expect(host.textContent).toContain('Member 11');});

it('blocks double submit while save is pending',async()=>{let finish!:(v:unknown)=>void;vi.mocked(api.addHealthMetric).mockImplementationOnce(()=>new Promise(r=>{finish=r;}));await render();await fill();await act(async()=>{const form=host.querySelector('form')!;form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));});expect(api.addHealthMetric).toHaveBeenCalledTimes(1);await act(async()=>finish({}));});
it('old member save cannot clear the new member draft',async()=>{let finish!:(v:unknown)=>void;vi.mocked(api.addHealthMetric).mockImplementationOnce(()=>new Promise(r=>{finish=r;}));await render(10);await fill();await act(async()=>host.querySelector('form')!.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));await render(11);await fill();await act(async()=>finish({}));expect(host.querySelector('input')!.value).toBe('70');expect(api.listHealthMetrics).toHaveBeenLastCalledWith(11);});

it('reception mode appends without reading or displaying private history', async()=>{
 await act(async()=>root.render(<CoachHealthMetrics memberId={10} memberName="Intake Member" intakeOnly />));
 expect(api.listHealthMetrics).not.toHaveBeenCalled();expect(host.querySelector('table')).toBeNull();await fill();
 await act(async()=>host.querySelector('form')!.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
 expect(api.addHealthMetric).toHaveBeenCalledWith(10,{metricName:'weight',metricValue:70,unit:'kg'});expect(api.listHealthMetrics).not.toHaveBeenCalled();
});
it('reception intake denial keeps the draft and never shows success history',async()=>{
 vi.mocked(api.addHealthMetric).mockRejectedValueOnce(new Error('HEALTH_INTAKE_REQUIRED'));
 await act(async()=>root.render(<CoachHealthMetrics memberId={10} memberName="Intake Member" intakeOnly />));await fill();
 await act(async()=>host.querySelector('form')!.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
 expect(host.querySelector('[role="alert"]')).not.toBeNull();expect(host.querySelector('input')!.value).toBe('70');expect(api.listHealthMetrics).not.toHaveBeenCalled();
});
