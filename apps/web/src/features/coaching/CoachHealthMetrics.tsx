import { useStaffI18n, type StaffMessage, staffError as errorMessage, staffNotify as notify } from '../operations/staffI18n';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { listHealthMetrics, addHealthMetric, type HealthMetric } from '../member/profileApi';
import { Select } from '../../shared/ui/Select';
import { LoadingSkeleton } from '../../shared/ui/LoadingSkeleton';
import { formatCenterDateTime } from '../../shared/lib/centerTime';
const fields = {
 weight: { label: 'Cân nặng', unit: 'kg' }, height: { label: 'Chiều cao', unit: 'cm' },
 bmi: { label: 'BMI', unit: '' }, body_fat: { label: 'Tỷ lệ mỡ', unit: '%' }, muscle_mass: { label: 'Khối lượng cơ', unit: 'kg' },
};
/** Remount for each selected member to isolate drafts and in-flight requests. */
export function CoachHealthMetrics({ memberId, memberName, intakeOnly = false }: { memberId: number; memberName: string; intakeOnly?: boolean }) {
 return <HealthMetricsForm key={String(memberId) + String(intakeOnly)} memberId={memberId} memberName={memberName} intakeOnly={intakeOnly} />;
}
function HealthMetricsForm({ memberId, memberName, intakeOnly }: { memberId: number; memberName: string; intakeOnly: boolean }) {
  const { t } = useStaffI18n();
 const [rows, setRows] = useState<HealthMetric[]>([]);
 const [loading, setLoading] = useState(true);
 const [loadError, setLoadError] = useState<StaffMessage>('');
 const [saveError, setSaveError] = useState<StaffMessage>('');
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
 return <section data-i18n-managed className="portal-card" aria-label={t("Chỉ số sức khỏe học viên")}>
  <h2 className="portal-card-title">{t("Chỉ số sức khỏe · ")}{memberName}</h2>
  {intakeOnly && <p className="muted">{t("Chỉ thêm số đo cho hội viên do bạn check-in hôm nay, chưa checkout. Không xem hoặc sửa lịch sử.")}</p>}
  {loading ? <LoadingSkeleton label={t("Đang tải số đo")} count={2} /> : loadError ? <div role="alert">{t(loadError)} <button type="button" className="btn-secondary" onClick={() => setAttempt(n => n + 1)}>{t("Thử lại")}</button></div> : <>
   <form data-i18n-managed onSubmit={event => void submit(event)}>
    <div className="grid-2">
     <div className="portal-form-group"><label className="portal-label" htmlFor="coach-metric-name">{t("Chỉ số")}</label><Select id="coach-metric-name" value={name} disabled={saving} onChange={e => setName(e.target.value as keyof typeof fields)}>{Object.entries(fields).map(([key, field]) => <option key={key} value={key}>{t(field.label)}{field.unit ? ' (' + field.unit + ')' : ''}</option>)}</Select></div>
     <div className="portal-form-group"><label className="portal-label" htmlFor="coach-metric-value">{t("Giá trị")}{fields[name].unit ? ' (' + fields[name].unit + ')' : ''}</label><input id="coach-metric-value" className="portal-input" type="number" min="0.01" max={name === 'body_fat' ? 100 : undefined} step="0.01" required value={value} disabled={saving} onChange={e => setValue(e.target.value)} /></div>
    </div>
    {saveError && <p role="alert" className="form-error">{t(saveError)}</p>}
    <button type="submit" className="btn-primary" disabled={saving}>{saving ? t('Đang lưu…') : t('Thêm số đo')}</button>
   </form>
   <p data-i18n-managed className="muted">{t("Ngày ghi nhận là thời điểm lưu tại trung tâm. BMI được nhập từ kết quả đo, không tự tính.")}</p>
   {intakeOnly ? null : rows.length === 0 ? <p>{t("Chưa có số đo được ghi nhận.")}</p> : <div className="portal-table-wrapper"><table className="portal-table"><thead><tr><th scope="col">{t("Ngày ghi nhận")}</th><th scope="col">{t("Chỉ số")}</th><th scope="col">{t("Giá trị")}</th></tr></thead><tbody>{rows.map(row => <tr key={row.id}><td>{formatCenterDateTime(row.recordedAt)}</td><td>{t(fields[row.metricName as keyof typeof fields]?.label) || row.metricName}</td><td>{row.metricValue} {row.unit}</td></tr>)}</tbody></table></div>}
  </>}
 </section>;
}
