import { sourceText, useSourceLanguage } from "../shopI18n";
import { GOAL_LABELS } from '../shopFormat';
import type { ProductGoal } from '../shopTypes';

const GOALS: Array<{ key: ProductGoal | ''; label: string }> = [
  { key: '', get label() { return sourceText('Tất cả'); } },
  { key: 'muscle_gain', get label() { return GOAL_LABELS.muscle_gain; } },
  { key: 'recovery', get label() { return GOAL_LABELS.recovery; } },
  { key: 'energy', get label() { return GOAL_LABELS.energy; } },
  { key: 'weight_management', get label() { return GOAL_LABELS.weight_management; } },
  { key: 'wellness', get label() { return GOAL_LABELS.wellness; } },
];

export function GoalChips({
  value,
  onChange,
}: {
  value: ProductGoal | '';
  onChange: (goal: ProductGoal | '') => void;
}) {
  useSourceLanguage();
  return (
    <div className="shop-goal-chips" role="group" aria-label={sourceText("Lọc theo mục tiêu tập luyện")}>
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
