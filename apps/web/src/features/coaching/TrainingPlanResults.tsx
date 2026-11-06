import { useEffect, useState } from 'react';
import { apiFetch } from '../../shared/api/client';
import { centerNowParts } from '../../shared/lib/centerTime';
import { errorMessage } from '../../shared/lib/errorMessage';
import { LoadingSkeleton } from '../../shared/ui/LoadingSkeleton';
import { DatePicker } from '../../shared/ui/DatePicker';
export interface PlanResults { planId: number; exerciseDate: string; items: { itemId:number;exerciseName:string;completed:boolean }[] }
export function TrainingPlanResults({planId}:{planId:number}) {
 const [date,setDate]=useState(()=>centerNowParts().date);
 const [result,setResult]=useState<PlanResults|null>(null);
 const [loading,setLoading]=useState(true);
 const [error,setError]=useState(''); const [attempt,setAttempt]=useState(0);
 useEffect(()=>{let active=true;setLoading(true);setError('');setResult(null);
 apiFetch<PlanResults>('/coaching/training-plans/'+planId+'/completions?exerciseDate='+encodeURIComponent(date))
 .then(data=>{if(active)setResult(data);}).catch(err=>{if(active)setError(errorMessage(err,'Không thể tải kết quả bài tập.'));})
 .finally(()=>{if(active)setLoading(false);});return()=>{active=false;};},[planId,date,attempt]);
 return <div><label className="portal-label" htmlFor="completion-date">Ngày tập</label><DatePicker id="completion-date" required max={centerNowParts().date} value={date} onChange={e=>{if(e.target.value)setDate(e.target.value);}} />
 {loading?<LoadingSkeleton label="Đang tải kết quả" count={2}/>:error?<p role="alert">{error} <button className="btn-secondary" onClick={()=>setAttempt(n=>n+1)}>Thử lại</button></p>:result?.items.length?<><p>Đã hoàn thành {result.items.filter(item=>item.completed).length}/{result.items.length} bài tập</p><ul>{result.items.map(item=><li key={item.itemId}>{item.exerciseName} · {item.completed?'Đã hoàn thành':'Chưa hoàn thành'}</li>)}</ul></>:<p>Không có bài tập được lên lịch trong ngày này.</p>}
 </div>;
}
