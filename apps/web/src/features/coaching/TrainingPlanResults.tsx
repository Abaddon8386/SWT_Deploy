import { useStaffI18n, type StaffMessage, staffError as errorMessage } from '../operations/staffI18n';
import { useEffect, useState } from 'react';
import { apiFetch } from '../../shared/api/client';
import { centerNowParts } from '../../shared/lib/centerTime';
import { LoadingSkeleton } from '../../shared/ui/LoadingSkeleton';
import { DatePicker } from '../../shared/ui/DatePicker';
export interface PlanResults { planId: number; exerciseDate: string; items: { itemId:number;exerciseName:string;completed:boolean }[] }
export function TrainingPlanResults({planId}:{planId:number}) {
  const { t } = useStaffI18n();
 const [date,setDate]=useState(()=>centerNowParts().date);
 const [result,setResult]=useState<PlanResults|null>(null);
 const [loading,setLoading]=useState(true);
 const [error,setError]=useState<StaffMessage>(''); const [attempt,setAttempt]=useState(0);
 useEffect(()=>{let active=true;setLoading(true);setError('');setResult(null);
 apiFetch<PlanResults>('/coaching/training-plans/'+planId+'/completions?exerciseDate='+encodeURIComponent(date))
 .then(data=>{if(active)setResult(data);}).catch(err=>{if(active)setError(errorMessage(err,'Không thể tải kết quả bài tập.'));})
 .finally(()=>{if(active)setLoading(false);});return()=>{active=false;};},[planId,date,attempt]);
 return <div data-i18n-managed><label className="portal-label" htmlFor="completion-date">{t("Ngày tập")}</label><DatePicker id="completion-date" required max={centerNowParts().date} value={date} onChange={e=>{if(e.target.value)setDate(e.target.value);}} />
 {loading?<LoadingSkeleton label={t("Đang tải kết quả")} count={2}/>:error?<p role="alert">{t(error)} <button className="btn-secondary" onClick={()=>setAttempt(n=>n+1)}>{t("Thử lại")}</button></p>:result?.items.length?<><p data-i18n-managed>{t("Đã hoàn thành ")}{result.items.filter(item=>item.completed).length}/{result.items.length} {t(" bài tập")}</p><ul data-i18n-managed>{result.items.map(item=><li key={item.itemId}>{item.exerciseName} · {item.completed?t('Đã hoàn thành'):t('Chưa hoàn thành')}</li>)}</ul></>:<p>{t("Không có bài tập được lên lịch trong ngày này.")}</p>}
 </div>;
}
