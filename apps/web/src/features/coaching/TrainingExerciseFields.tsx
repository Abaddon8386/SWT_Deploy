import type { ExerciseValues } from './trainingExercise';

export function TrainingExerciseFields({ prefix, value, onChange }: { prefix: string; value: ExerciseValues; onChange: (value: ExerciseValues) => void }) {
  const numbers = [
    ['sets', 'Số hiệp', 1, 'sets'], ['reps', 'Số reps / hiệp', 1, 'reps'],
    ['durationMinutes', 'Thời lượng (phút)', 1, 'duration'], ['restSeconds', 'Nghỉ giữa hiệp (giây)', 0, 'rest'],
  ] as const;
  return <div className="plan-exercise-fields">
    <label className="portal-form-group plan-exercise-fields__wide" htmlFor={`${prefix}-name`}><span className="portal-label">Tên bài tập</span><input id={`${prefix}-name`} className="portal-input" required maxLength={150} value={value.exerciseName} onChange={event => onChange({ ...value, exerciseName: event.target.value })} /></label>
    <label className="portal-form-group plan-exercise-fields__wide" htmlFor={`${prefix}-day`}><span className="portal-label">Ngày tập</span><select id={`${prefix}-day`} className="portal-select" value={value.dayOfWeek ?? ''} onChange={event => onChange({ ...value, dayOfWeek: event.target.value ? Number(event.target.value) : null })}><option value="">Chưa chọn ngày</option>{[1, 2, 3, 4, 5, 6, 7].map(day => <option key={day} value={day}>{day === 7 ? 'Chủ nhật' : `Thứ ${day + 1}`}</option>)}</select></label>
    {numbers.map(([key, label, min, suffix]) => <label key={key} className="portal-form-group" htmlFor={`${prefix}-${suffix}`}><span className="portal-label">{label}</span><input id={`${prefix}-${suffix}`} className="portal-input" type="number" min={min} step={1} aria-invalid={value[key] != null && (!Number.isInteger(value[key]) || value[key]! < min) ? true : undefined} value={value[key] ?? ''} onChange={event => onChange({ ...value, [key]: event.target.value === '' ? null : Number(event.target.value) })} /></label>)}
    <label className="portal-form-group plan-exercise-fields__wide" htmlFor={`${prefix}-description`}><span className="portal-label">Hướng dẫn / ghi chú</span><textarea id={`${prefix}-description`} className="portal-input" rows={3} value={value.description ?? ''} onChange={event => onChange({ ...value, description: event.target.value })} /></label>
  </div>;
}
