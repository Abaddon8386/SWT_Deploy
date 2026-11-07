import { memberText } from './memberI18n';
import { useLanguage } from '../../shared/i18n/language';
import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { getMyEvaluations, type CoachEvaluation } from './memberProgressApi';
import { formatCenterDateTime } from '../../shared/lib/centerTime';
import { LoadingSkeleton } from '../../shared/ui/LoadingSkeleton';

export function CoachEvaluations() {
  useLanguage();
  const location = useLocation();
  const [data, setData] = useState<CoachEvaluation[] | null>(null);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    getMyEvaluations().then((items) => { if (active) setData(items); })
      .catch(() => { if (active) setError(true); });
    return () => { active = false; };
  }, [retry, location.key]);
  useEffect(() => {
    if (data && location.hash === '#coach-evaluations') {
      document.getElementById('coach-evaluations')?.scrollIntoView({ behavior: 'instant', block: 'start' });
    }
  }, [data, location.hash]);
  return <section data-i18n-managed id="coach-evaluations" className="portal-card" aria-labelledby="coach-evaluations-title" style={{ scrollMarginTop: 100 }}>
    <div className="portal-card-header"><h2 id="coach-evaluations-title" className="portal-card-title">{memberText("Đánh giá từ huấn luyện viên")}</h2></div>
    {error ? <div role="alert">{memberText("Không thể tải đánh giá. ")}<button type="button" className="member-progress-link" onClick={() => { setError(false); setRetry((value) => value + 1); }}>{memberText("Thử lại")}</button></div>
      : data === null ? <LoadingSkeleton label={memberText("Đang tải đánh giá…")} count={2} />
      : data.length === 0 ? <p className="portal-empty">{memberText("Chưa có đánh giá từ huấn luyện viên.")}</p>
      : <ol className="member-progress-exercises">{data.map((item) => <li key={item.id}>
        <div><time dateTime={item.evaluatedAt}>{formatCenterDateTime(item.evaluatedAt)}</time><h3>{memberText("Điểm tiến độ: ")}{item.progressScore}/100</h3>
          {item.performanceNotes && <p>{item.performanceNotes}</p>}{item.feedback && <p>{item.feedback}</p>}</div>
      </li>)}</ol>}
  </section>;
}
