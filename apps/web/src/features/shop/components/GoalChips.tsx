import { GOAL_LABELS } from '../shopFormat';
import type { ProductGoal } from '../shopTypes';

const GOALS: Array<{ key: ProductGoal | ''; label: string }> = [
  { key: '', label: 'Tất cả' },
  { key: 'muscle_gain', label: GOAL_LABELS.muscle_gain },
  { key: 'recovery', label: GOAL_LABELS.recovery },
  { key: 'energy', label: GOAL_LABELS.energy },
  { key: 'weight_management', label: GOAL_LABELS.weight_management },
  { key: 'wellness', label: GOAL_LABELS.wellness },
];

export function GoalChips({
  value,
  onChange,
}: {
  value: ProductGoal | '';
  onChange: (goal: ProductGoal | '') => void;
}) {
  return (
    <div className="fit-pricing-switch shop-goal-chips" role="group" aria-label="Lọc theo mục tiêu tập luyện">
      {GOALS.map((item) => (
        <button
          key={item.key || 'all'}
          type="button"
          aria-pressed={value === item.key}
          onClick={() => onChange(item.key)}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}
