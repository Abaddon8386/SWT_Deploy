export interface ExerciseValues {
  exerciseName: string;
  description?: string | null;
  dayOfWeek?: number | null;
  sets?: number | null;
  reps?: number | null;
  durationMinutes?: number | null;
  restSeconds?: number | null;
}

export function validateExercise(values: ExerciseValues, required = false): string | null {
  if (!values.exerciseName.trim() || values.exerciseName.trim().length > 150) return 'Tên bài tập phải có từ 1 đến 150 ký tự.';
  const fields = [[values.dayOfWeek, 1, 'Ngày tập'], [values.sets, 1, 'Số hiệp'], [values.reps, 1, 'Số reps'], [values.durationMinutes, 1, 'Thời lượng'], [values.restSeconds, 0, 'Thời gian nghỉ']] as const;
  for (const [value, min, label] of fields) {
    if (value == null && !required) continue;
    if (value == null || !Number.isInteger(value) || value < min) return `${label} phải là số nguyên từ ${min} trở lên.`;
  }
  if (values.dayOfWeek != null && values.dayOfWeek > 7) return 'Ngày tập phải từ thứ 2 đến Chủ nhật.';
  return null;
}

