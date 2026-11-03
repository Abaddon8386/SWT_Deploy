import { useEffect, useRef, useState, type FormEvent } from 'react';
import { listHealthMetrics, addHealthMetric, type HealthMetric } from '../member/profileApi';
import { Select } from '../../shared/ui/Select';
import { LoadingSkeleton } from '../../shared/ui/LoadingSkeleton';
import { formatCenterDateTime } from '../../shared/lib/centerTime';
import { errorMessage } from '../../shared/lib/errorMessage';
import { notify } from '../../shared/lib/portalNotices';
const fields = {
 weight: { label: 'Cân nặng', unit: 'kg' }, height: { label: 'Chiều cao', unit: 'cm' },
 bmi: { label: 'BMI', unit: '' }, body_fat: { label: 'Tỷ lệ mỡ', unit: '%' }, muscle_mass: { label: 'Khối lượng cơ', unit: 'kg' },
};
/** Remount for each selected member to isolate drafts and in-flight requests. */
export function CoachHealthMetrics({ memberId, memberName, intakeOnly = false }: { memberId: number; memberName: string; intakeOnly?: boolean }) {
 return <HealthMetricsForm key={String(memberId) + String(intakeOnly)} memberId={memberId} memberName={memberName} intakeOnly={intakeOnly} />;
}
function HealthMetricsForm({ memberId, memberName, intakeOnly }: { memberId: number; memberName: string; intakeOnly: boolean }) {
 const [rows, setRows] = useState<HealthMetric[]>([]);
 const [loading, setLoading] = useState(true);
 const [loadError, setLoadError] = useState('');
 const [saveError, setSaveError] = useState('');
 const [attempt, setAttempt] = useState(0);
 const [name, setName] = useState<keyof typeof fields>('weight');
 const [value, setValue] = useState('');
 const [saving, setSaving] = useState(false);
 const busy = useRef(false);
 const alive = useRef(false);
 useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
 useEffect(() => {
  let active = true; setLoading(true); setLoadError('');
  if(intakeOnly) { setLoading(false); return () => { active = false; }; }
  listHealthMetrics(memberId).then(data => { if(active) setRows(data); })
   .catch(err => { if(active) setLoadError(errorMessage(err, 'Không thể tải lịch sử số đo.')); })
   .finally(() => { if(active) setLoading(false); });
  return () => { active = false; };
 }, [memberId, attempt, intakeOnly]);
 async function submit(event: FormEvent) {
  event.preventDefault(); if(busy.current || loading || loadError) return;
  const number = Number(value);
  if(!value.trim() || !Number.isFinite(number) || number < 0.01 || (name === 'body_fat' && number > 100)) {
   setSaveError('Nhập giá trị hợp lệ lớn hơn 0; tỷ lệ mỡ không vượt 100%.'); return;
  }
  busy.current = true; setSaving(true); setSaveError('');
  try {
   await addHealthMetric(memberId, { metricName: name, metricValue: number, unit: fields[name].unit || null });
   if(alive.current) { setValue(''); setAttempt(n => n + 1); notify('Đã ghi nhận số đo sức khỏe.', 'success'); }
  } catch(err) { if(alive.current) setSaveError(errorMessage(err, 'Không thể lưu số đo.')); }
  finally { busy.current = false; if(alive.current) setSaving(false); }
 }
 return <section className="portal-card" aria-label="Chỉ số sức khỏe học viên">
  <h2 className="portal-card-title">Chỉ số sức khỏe · {memberName}</h2>
  {intakeOnly && <p className="muted">Chỉ thêm số đo cho hội viên do bạn check-in hôm nay, chưa checkout. Không xem hoặc sửa lịch sử.</p>}
  {loading ? <LoadingSkeleton label="Đang tải số đo" count={2} /> : loadError ? <div role="alert">{loadError} <button type="button" className="btn-secondary" onClick={() => setAttempt(n => n + 1)}>Thử lại</button></div> : <>
   <form onSubmit={event => void submit(event)}>
    <div className="grid-2">
     <div className="portal-form-group"><label className="portal-label" htmlFor="coach-metric-name">Chỉ số</label><Select id="coach-metric-name" value={name} disabled={saving} onChange={e => setName(e.target.value as keyof typeof fields)}>{Object.entries(fields).map(([key, field]) => <option key={key} value={key}>{field.label}{field.unit ? ' (' + field.unit + ')' : ''}</option>)}</Select></div>
     <div className="portal-form-group"><label className="portal-label" htmlFor="coach-metric-value">Giá trị{fields[name].unit ? ' (' + fields[name].unit + ')' : ''}</label><input id="coach-metric-value" className="portal-input" type="number" min="0.01" max={name === 'body_fat' ? 100 : undefined} step="0.01" required value={value} disabled={saving} onChange={e => setValue(e.target.value)} /></div>
    </div>
    {saveError && <p role="alert" className="form-error">{saveError}</p>}
    <button type="submit" className="btn-primary" disabled={saving}>{saving ? 'Đang lưu…' : 'Thêm số đo'}</button>
   </form>
   <p className="muted">Ngày ghi nhận là thời điểm lưu tại trung tâm. BMI được nhập từ kết quả đo, không tự tính.</p>
   {intakeOnly ? null : rows.length === 0 ? <p>Chưa có số đo được ghi nhận.</p> : <div className="portal-table-wrapper"><table className="portal-table"><thead><tr><th scope="col">Ngày ghi nhận</th><th scope="col">Chỉ số</th><th scope="col">Giá trị</th></tr></thead><tbody>{rows.map(row => <tr key={row.id}><td>{formatCenterDateTime(row.recordedAt)}</td><td>{fields[row.metricName as keyof typeof fields]?.label ?? row.metricName}</td><td>{row.metricValue} {row.unit}</td></tr>)}</tbody></table></div>}
  </>}
 </section>;
}
