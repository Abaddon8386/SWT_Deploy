import { apiFetch } from '../../shared/api/client';

export interface ProgressMetric {
  id: number;
  metricName: string;
  metricValue: number;
  unit: string | null;
  recordedAt: string;
}

export interface TrainingItem {
  id: number;
  dayOfWeek: number | null;
  exerciseName: string;
  description: string | null;
  sets: number | null;
  reps: number | null;
  durationMinutes: number | null;
  restSeconds?: number | null;
  orderIndex: number;
}

export interface TrainingPlan {
  id: number;
  status: string;
  startDate: string;
  endDate: string;
  goal: string | null;
  coachName: string | null;
  items: TrainingItem[];
}

export const getMyProgressMetrics = () => apiFetch<ProgressMetric[]>('/health/metrics/my');
export const getMyTrainingPlans = () => apiFetch<TrainingPlan[]>('/coaching/training-plans/my');

export interface TrainingCompletion { itemId: number; exerciseDate: string; completed: boolean }

export const getMyCompletedItemIds = (exerciseDate: string) =>
  apiFetch<number[]>(`/coaching/training-completions/my?exerciseDate=${exerciseDate}`);

export const setTrainingItemCompleted = (itemId: number, exerciseDate: string, completed: boolean) =>
  apiFetch<TrainingCompletion>(`/coaching/training-completions/my/${itemId}?exerciseDate=${exerciseDate}`, {
    method: completed ? 'PUT' : 'DELETE',
  });

export interface CoachEvaluation {
  id: number;
  sessionId: number | null;
  coachId: number;
  progressScore: number;
  performanceNotes: string | null;
  feedback: string | null;
  evaluatedAt: string;
}
export const getMyEvaluations = () => apiFetch<CoachEvaluation[]>('/coaching/evaluations/my');
