import { memberText, memberMessage, memberRenderMessage } from './memberI18n';
import type { SourceMessage } from '../../shared/i18n/language';
import { useLanguage } from '../../shared/i18n/language';
import { useEffect, useRef, useState } from 'react';
import { PageHeader } from '../../shared/ui/PageHeader';
import { LoadingSkeleton } from '../../shared/ui/LoadingSkeleton';
import { getMyCompletedItemIds, getMyProgressMetrics, getMyTrainingPlans, setTrainingItemCompleted, type ProgressMetric, type TrainingPlan } from './memberProgressApi';
import { dailyExercises, weeklyMeasurements, type WeeklyPoint } from './progressPresentation';
import './member-progress.css';
import { centerNowParts } from '../../shared/lib/centerTime';
import { CoachEvaluations } from './CoachEvaluations';
import { WorkoutHistory } from './WorkoutHistory';

type LoadState<T> = { kind: 'loading' } | { kind: 'error' } | { kind: 'ready'; data: T };

function WeeklyChart({ points, metric, label, unit }: { points: WeeklyPoint[]; metric: 'weight' | 'bmi'; label: string; unit: string }) {
  useLanguage();
  const values = points.map((point) => point[metric]);
  const available = values.filter((value): value is number => value != null);
  if (available.length === 0) return <p className="portal-empty">{memberText("Chưa có số đo ")}{label.toLowerCase()}.</p>;
  const min = Math.min(...available);
  const max = Math.max(...available);
  const span = Math.max(max - min, 1);
  const x = (index: number) => 34 + index * 84;
  const y = (value: number) => 148 - ((value - min) / span) * 110;
  const width = Math.max(350, 68 + (points.length - 1) * 84);
  const segments: string[][] = [];
  let current: string[] = [];
  values.forEach((value, index) => {
    if (value == null) { if (current.length) segments.push(current); current = []; }
    else current.push(`${x(index)},${y(value)}`);
  });
  if (current.length) segments.push(current);
  return <div className="member-progress-chart-scroll"><svg className="member-progress-chart" width={width} height="205" viewBox={`0 0 ${width} 205`} role="img" aria-label={memberText(`${label} theo tuần, ${unit}`, `${label} by week, ${unit}`)}>
    <line x1="34" y1="160" x2={width - 24} y2="160" stroke="currentColor" opacity=".3" />
    {segments.map((segment, index) => <polyline key={index} points={segment.join(' ')} fill="none" stroke="var(--portal-salmon)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />)}
    {points.map((point, index) => <g key={point.weekStart}>
      {point[metric] != null && <circle cx={x(index)} cy={y(point[metric])} r="5" fill="var(--portal-salmon)"><title>{`${point.weekStart}: ${point[metric]} ${unit}`}</title></circle>}
      <text x={x(index)} y="187" textAnchor="middle" fill="currentColor" fontSize="11">{`${point.weekStart.slice(8, 10)}/${point.weekStart.slice(5, 7)}`}</text>
    </g>)}
  </svg></div>;
}

export function MemberProgressPage() {
  useLanguage();
 const [tab, setTab] = useState<'progress' | 'history'>('progress');
 const [date, setDate] = useState(() => centerNowParts().date);
 useEffect(() => {
  const update = () => setDate(centerNowParts().date);
  const timer = window.setInterval(update, 30000);
  window.addEventListener('focus', update);
  return () => { window.clearInterval(timer); window.removeEventListener('focus', update); };
 }, []);
 return <div data-i18n-managed className="portal-container member-progress">
   <PageHeader eyebrow={memberText("Hội viên")} title={memberText("Tiến độ thể lực")} />
   <div className="workout-tabs" role="group" aria-label={memberText("Nội dung tiến độ")}>
     <button type="button" className={tab === 'progress' ? 'btn-primary' : 'btn-secondary'} aria-pressed={tab === 'progress'} onClick={() => setTab('progress')}>{memberText("Tiến độ & Giáo án")}</button>
     <button type="button" className={tab === 'history' ? 'btn-primary' : 'btn-secondary'} aria-pressed={tab === 'history'} onClick={() => setTab('history')}>{memberText("Lịch sử tập luyện")}</button>
   </div>
   <div hidden={tab !== 'progress'}><DailyProgress key={date} today={date} /></div>
   {tab === 'history' && <WorkoutHistory />}
 </div>;
}
function DailyProgress({ today }: { today: string }) {
  useLanguage();
  const [metrics, setMetrics] = useState<LoadState<ProgressMetric[]>>({ kind: 'loading' });
  const [plans, setPlans] = useState<LoadState<TrainingPlan[]>>({ kind: 'loading' });
  const [completions, setCompletions] = useState<LoadState<number[]>>({ kind: 'loading' });
  const [completionError, setCompletionError] = useState<string | SourceMessage>('');
  const [savingItemId, setSavingItemId] = useState<number | null>(null);
  const savingRef = useRef<number | null>(null);
  const [metricRetry, setMetricRetry] = useState(0);
  const [planRetry, setPlanRetry] = useState(0);
  const [completionRetry, setCompletionRetry] = useState(0);

  useEffect(() => {
    let active = true;
    getMyProgressMetrics().then((data) => { if (active) setMetrics({ kind: 'ready', data }); })
      .catch(() => { if (active) setMetrics({ kind: 'error' }); });
    return () => { active = false; };
  }, [metricRetry]);
  useEffect(() => {
    let active = true;
    getMyTrainingPlans().then((data) => { if (active) setPlans({ kind: 'ready', data }); })
      .catch(() => { if (active) setPlans({ kind: 'error' }); });
    return () => { active = false; };
  }, [planRetry]);
  useEffect(() => {
    let active = true;
    getMyCompletedItemIds(today).then((data) => { if (active) setCompletions({ kind: 'ready', data }); })
      .catch(() => { if (active) setCompletions({ kind: 'error' }); });
    return () => { active = false; };
  }, [today, completionRetry]);

  async function updateCompletion(itemId: number, completed: boolean) {
    if (savingRef.current != null || completions.kind !== 'ready') return;
    savingRef.current = itemId;
    setSavingItemId(itemId); setCompletionError('');
    try {
      await setTrainingItemCompleted(itemId, today, completed);
      setCompletions((previous) => previous.kind === 'ready' ? {
        kind: 'ready', data: completed
          ? [...new Set([...previous.data, itemId])]
          : previous.data.filter((id) => id !== itemId),
      } : previous);
    } catch {
      setCompletionError(memberMessage("Không thể lưu trạng thái bài tập. Vui lòng thử lại."));
    } finally {
      savingRef.current = null; setSavingItemId(null);
    }
  }

  const points = metrics.kind === 'ready' ? weeklyMeasurements(metrics.data) : [];
  const exercises = plans.kind === 'ready' ? dailyExercises(plans.data, today) : [];
  return <div className="member-progress">
    <CoachEvaluations />
    <section data-i18n-managed className="portal-card" aria-labelledby="progress-metrics-title">
      <div className="portal-card-header"><h2 id="progress-metrics-title" className="portal-card-title">{memberText("Thay đổi qua các tuần")}</h2></div>
      {metrics.kind === 'loading' ? <LoadingSkeleton label={memberText("Đang tải số đo…")} variant="cards" count={2} /> : metrics.kind === 'error' ? <div role="alert">{memberText("Không thể tải số đo. ")}<button type="button" className="member-progress-link" onClick={() => { setMetrics({ kind: 'loading' }); setMetricRetry((value) => value + 1); }}>{memberText("Thử lại")}</button></div> : points.length === 0 ? <p className="portal-empty">{memberText("Chưa có số đo cân nặng hoặc BMI.")}</p> : <div className="member-progress-charts">
        <div><h3>{memberText("Cân nặng ")}<small>kg</small></h3><WeeklyChart points={points} metric="weight" label={memberText("Cân nặng ")} unit="kg" /></div>
        <div><h3>{memberText("Chỉ số BMI")}</h3><WeeklyChart points={points} metric="bmi" label="BMI" unit="BMI" /></div>
        <div className="member-progress-values">{points.map((point) => <p key={point.weekStart}><time dateTime={point.weekStart}>{memberText("Tuần ")}{`${point.weekStart.slice(8, 10)}/${point.weekStart.slice(5, 7)}`}</time><span>{point.weight == null ? '—' : `${point.weight} kg`}</span><span>{point.bmi == null ? '—' : `BMI ${point.bmi}`}</span></p>)}</div>
      </div>}
    </section>
    <section data-i18n-managed className="portal-card" aria-labelledby="progress-plan-title">
      <div className="portal-card-header"><h2 id="progress-plan-title" className="portal-card-title">{memberText("Bài tập hôm nay")}</h2></div>
      {plans.kind === 'loading' ? <LoadingSkeleton label={memberText("Đang tải giáo án…")} count={3} /> : plans.kind === 'error' ? <div role="alert">{memberText("Không thể tải giáo án. ")}<button type="button" className="member-progress-link" onClick={() => { setPlans({ kind: 'loading' }); setPlanRetry((value) => value + 1); }}>{memberText("Thử lại")}</button></div> : exercises.length === 0 ? <p className="portal-empty">{plans.data.length === 0 ? memberText("Chưa có giáo án đang hoạt động được giao.") : plans.data.some(plan => plan.status === 'active' && plan.startDate <= today && plan.endDate >= today) ? memberText("Hôm nay là ngày nghỉ hoặc chưa có bài tập được lên lịch.") : memberText("Chưa có giáo án có hiệu lực trong hôm nay.")}</p> : <>
        {completions.kind === 'loading' && <LoadingSkeleton label={memberText("Đang tải trạng thái hoàn thành…")} count={1} />}
        {completions.kind === 'error' && <div role="alert">{memberText("Không thể tải trạng thái hoàn thành. ")}<button type="button" className="member-progress-link" onClick={() => { setCompletions({ kind: 'loading' }); setCompletionRetry((value) => value + 1); }}>{memberText("Thử lại")}</button></div>}
        {completionError && <p role="alert">{memberRenderMessage(completionError)}</p>}
        {completions.kind === 'ready' && <p className="muted">{memberText("Đã hoàn thành ")}{exercises.filter(({item}) => completions.data.includes(item.id)).length}/{exercises.length}{memberText(" bài tập")}</p>}
        <ol className="member-progress-exercises">{exercises.map(({ plan, item }) => <li key={`${plan.id}-${item.id}`}>
        {completions.kind === 'ready' && <label className="member-progress-check"><input type="checkbox" aria-label={memberText(`Hoàn thành ${item.exerciseName}`, `Complete ${item.exerciseName}`)} checked={completions.data.includes(item.id)} disabled={savingItemId != null} onChange={(event) => void updateCompletion(item.id, event.target.checked)} />{savingItemId === item.id && <span>{memberText("Đang lưu…")}</span>}</label>}
        <div><span className="member-progress-day">{plan.coachName || memberText("Huấn luyện viên")}</span><h3>{item.exerciseName}</h3>{item.description && <p>{item.description}</p>}</div>
        <div className="member-progress-dose">{item.sets != null && item.reps != null && <span>{item.sets}{memberText(" hiệp × ")}{item.reps}{memberText(" lần")}</span>}{item.durationMinutes != null && <span>{item.durationMinutes}{memberText(" phút")}</span>}{item.restSeconds != null && <span>{memberText("Nghỉ ")}{item.restSeconds}{memberText(" giây")}</span>}</div>
      </li>)}</ol></>}
    </section>
  </div>;
}
