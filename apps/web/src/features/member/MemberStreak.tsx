import { memberMessage, memberError, memberText, memberRenderMessage } from './memberI18n';
import type { SourceMessage } from '../../shared/i18n/language';
import { useLanguage } from '../../shared/i18n/language';
import { useEffect, useId, useState } from 'react';
import { LoadingSkeleton } from '../../shared/ui/LoadingSkeleton';
import { formatCenterDate } from '../../shared/lib/centerTime';
import { memberCheckinApi, type WorkoutStreak } from './memberCheckinApi';
import './member-streak.css';

const DAY_MS = 86_400_000;
const CELLS = 91;
const STEP = 16;
const snakePoints = Array.from({ length: 13 }, (_, column) =>
  Array.from({ length: 7 }, (_, row) => `${5 + column * STEP},${5 + (column % 2 ? 6 - row : row) * STEP}`),
).flat();
const SNAKE_PATH = `M${snakePoints.join(' L')} L213,101 L213,119 L-7,119 L-7,5 Z`;

/** The server owns streak counts and dates; the chart is fetched only on the dedicated member page. */
export function MemberStreak() {
  useLanguage();
  const [data, setData] = useState<WorkoutStreak | null>(null);
  const [error, setError] = useState<string | null | SourceMessage>(null);
  const [attempt, setAttempt] = useState(0);
  const titleId = useId();
  const graphId = useId();

  useEffect(() => {
    let active = true;
    void memberCheckinApi.streak().then(result => {
      if (!result || !Array.isArray(result.activeDates)
        || !/^\d{4}-\d{2}-\d{2}$/.test(result.startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(result.endDate)
        || ![result.currentStreak, result.longestStreak, result.workoutDays].every(value => Number.isInteger(value) && value >= 0)) {
        throw Object.assign(new Error('Chưa tải được streak. Vui lòng thử lại.'), { translation: memberMessage("Chưa tải được streak. Vui lòng thử lại.") });
      }
      if (active) setData(result);
    }).catch(reason => {
      if (active) setError(memberError(reason, 'Chưa tải được streak. Vui lòng thử lại.'));
    });
    return () => { active = false; };
  }, [attempt]);

  const start = data ? Date.parse(`${data.startDate}T00:00:00Z`) : 0;
  const activeDates = new Set(data?.activeDates);

  return <section data-i18n-managed className="member-streak" aria-labelledby={titleId} aria-busy={!data && !error}>
    <h3 id={titleId} className="member-streak__title">{memberText("Chuỗi ngày check-in")}</h3>
    {!data && !error && <LoadingSkeleton label={memberText("Đang tải streak…")} count={1} />}
    {error && <div className="member-streak__error">
      <p role="alert">{memberRenderMessage(error)}</p>
      <button type="button" onClick={() => { setData(null); setError(null); setAttempt(value => value + 1); }}>{memberText("Thử lại")}</button>
    </div>}
    {data && <>
      <div className="member-streak__stats">
        <div><strong className="member-streak__count">{data.currentStreak}</strong><span>{memberText("ngày liên tiếp")}</span></div>
        <div className="member-streak__record"><span>{memberText("Kỷ lục")}</span><strong>{data.longestStreak}{memberText(" ngày")}</strong></div>
      </div>
      <svg className="member-streak__grid" viewBox="-10 -10 232 140" role="img" aria-labelledby={graphId}>
        <title id={graphId}>{data.workoutDays}{memberText(" ngày tập trong 13 tuần gần nhất. Chuỗi hiện tại ")}{data.currentStreak}{memberText(" ngày, kỷ lục ")}{data.longestStreak}{memberText(" ngày.")}</title>
        {Array.from({ length: CELLS }, (_, index) => {
          const date = new Date(start + index * DAY_MS).toISOString().slice(0, 10);
          const future = date > data.endDate;
          const trained = !future && activeDates.has(date);
          return <rect key={date} data-date={date}
            className={`member-streak__day${trained ? ' is-active' : ''}${future ? ' is-future' : ''}${date === data.endDate ? ' is-today' : ''}`}
            x={Math.floor(index / 7) * STEP} y={(index % 7) * STEP} width="10" height="10" rx="2.5">
            <title>{formatCenterDate(date)} · {future ? memberText("Chưa đến ngày") : trained ? memberText("Đã tập") : memberText("Chưa check-in")}</title>
          </rect>;
        })}
        {data.workoutDays > 0 && <g className="member-streak__snake" aria-hidden="true">
          {[.22, .38, .55, .75, 1].map((opacity, index) => <rect key={index} width="10" height="10" rx="3" opacity={opacity}
            style={{ offsetPath: `path('${SNAKE_PATH}')`, animationDelay: `${-index * .22}s` }} />)}
        </g>}
      </svg>
      <div className="member-streak__caption"><span>{data.workoutDays}{memberText(" ngày tập")}</span><span>{memberText("13 tuần gần nhất")}</span></div>
      {data.workoutDays === 0 && <p className="member-streak__hint">{memberText("Check-in để bắt đầu chuỗi ngày tập.")}</p>}
    </>}
  </section>;
}
