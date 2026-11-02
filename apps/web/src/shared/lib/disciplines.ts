/** Core groups shown on the landing and in the member booking filters. */
export const PRIMARY_DISCIPLINES = [
  { id: 'gym', name: 'Gym' },
  { id: 'yoga', name: 'Yoga' },
  { id: 'pilates', name: 'Pilates' },
  { id: 'boxing', name: 'Boxing' },
] as const;

export type PrimaryDisciplineId = typeof PRIMARY_DISCIPLINES[number]['id'];

export function matchesDiscipline(name: string, selected: string): boolean {
  const value = name.toLocaleLowerCase('vi');
  const filter = selected.toLocaleLowerCase('vi');
  // The portal catalog also names its Gym classes "Olympic Strength".
  if (filter === 'gym') return /\bgym\b|\bstrength\b|thể hình|tập tạ/i.test(value);
  return value.includes(filter);
}
