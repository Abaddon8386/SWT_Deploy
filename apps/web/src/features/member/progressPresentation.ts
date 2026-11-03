import type { ProgressMetric, TrainingItem, TrainingPlan } from './memberProgressApi';

export interface WeeklyPoint { weekStart: string; weight: number | null; bmi: number | null }

function mondayOf(dateKey: string): string | null {
  const date = new Date(`${dateKey.slice(0, 10)}T12:00:00Z`);
  if (Number.isNaN(date.getTime())) return null;
  date.setUTCDate(date.getUTCDate() - (date.getUTCDay() + 6) % 7);
  return date.toISOString().slice(0, 10);
}

export function weeklyMeasurements(metrics: ProgressMetric[]): WeeklyPoint[] {
  const weeks = new Map<string, WeeklyPoint>();
  const sorted = [...metrics].sort((a, b) => a.recordedAt.localeCompare(b.recordedAt));
  for (const metric of sorted) {
    const isWeight = metric.metricName.toLowerCase() === 'weight' && metric.unit?.toLowerCase() === 'kg';
    const isBmi = metric.metricName.toLowerCase() === 'bmi';
    if (!isWeight && !isBmi) continue;
    const key = mondayOf(metric.recordedAt);
    const value = Number(metric.metricValue);
    if (!key || !Number.isFinite(value) || value <= 0) continue;
    const point = weeks.get(key) ?? { weekStart: key, weight: null, bmi: null };
    if (isWeight) point.weight = value;
    if (isBmi) point.bmi = value;
    weeks.set(key, point);
  }
  if (weeks.size === 0) return [];
  const ordered = [...weeks.keys()].sort();
  const cursor = new Date(`${ordered[0]}T12:00:00Z`);
  const last = ordered[ordered.length - 1];
  const points: WeeklyPoint[] = [];
  while (cursor.toISOString().slice(0, 10) <= last) {
    const key = cursor.toISOString().slice(0, 10);
    points.push(weeks.get(key) ?? { weekStart: key, weight: null, bmi: null });
    cursor.setUTCDate(cursor.getUTCDate() + 7);
  }
  return points;
}

export function dailyExercises(plans: readonly TrainingPlan[], dateKey: string): { plan: TrainingPlan; item: TrainingItem }[] {
  const day = new Date(`${dateKey}T12:00:00Z`).getUTCDay();
  const isoDay = day === 0 ? 7 : day;
  return plans.filter((plan) => plan.status === 'active' && plan.startDate <= dateKey && plan.endDate >= dateKey)
    .flatMap((plan) => plan.items.filter((item) => item.dayOfWeek === isoDay).map((item) => ({ plan, item })))
    .sort((a, b) => a.item.orderIndex - b.item.orderIndex);
}
