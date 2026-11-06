import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { beforeEach, afterEach, it, expect, vi } from 'vitest';
import { TrainingPlanResults, type PlanResults } from './TrainingPlanResults';
import { apiFetch } from '../../shared/api/client';
vi.mock('../../shared/api/client',()=>({apiFetch:vi.fn()}));
let host:HTMLDivElement;let root:Root;
beforeEach(()=>{vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);host=document.createElement('div');document.body.append(host);root=createRoot(host);vi.mocked(apiFetch).mockResolvedValue({planId:1,exerciseDate:'2026-11-03',items:[]});});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();vi.resetAllMocks();vi.unstubAllGlobals();});
async function render(id=1){await act(async()=>root.render(<TrainingPlanResults planId={id}/>));}
it('renders authoritative completed and unfinished items',async()=>{vi.mocked(apiFetch).mockResolvedValue({planId:1,exerciseDate:'2026-11-03',items:[{itemId:5,exerciseName:'Squat',completed:true},{itemId:6,exerciseName:'Run',completed:false}]});await render();expect(host.textContent).toContain('1/2');expect(host.textContent).toContain('Squat · Đã hoàn thành');expect(host.textContent).toContain('Run · Chưa hoàn thành');expect(apiFetch).toHaveBeenCalledWith(expect.stringMatching(/^\/coaching\/training-plans\/1\/completions\?exerciseDate=/));});
it('shows GET error and retries rather than inventing results',async()=>{vi.mocked(apiFetch).mockRejectedValueOnce(new Error('forbidden'));await render();expect(host.querySelector('[role="alert"]')).not.toBeNull();await act(async()=>[...host.querySelectorAll('button')].find(b=>b.textContent==='Thử lại')!.click());expect(host.textContent).toContain('Không có bài tập');});
it('ignores old plan responses',async()=>{let finish!:(value:PlanResults)=>void;vi.mocked(apiFetch).mockImplementationOnce(()=>new Promise(r=>{finish=r;}));await render(1);await render(2);await act(async()=>finish({planId:1,exerciseDate:'2026-11-03',items:[{itemId:5,exerciseName:'Old member',completed:true}]}));expect(host.textContent).not.toContain('Old member');});
