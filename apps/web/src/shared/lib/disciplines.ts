/**
 * Danh mục bộ môn chuẩn của SÖL, dùng chung cho landing, lịch lớp và bộ lọc portal.
 * Gym là bộ môn chính; Bơi lội, Boxing, Tennis, Cầu lông và Yoga là bộ môn phụ.
 */
export const DISCIPLINES = [
  { id: 'gym', name: 'Gym', tier: 'main' },
  { id: 'swimming', name: 'Bơi lội', tier: 'secondary' },
  { id: 'boxing', name: 'Boxing', tier: 'secondary' },
  { id: 'tennis', name: 'Tennis', tier: 'secondary' },
  { id: 'badminton', name: 'Cầu lông', tier: 'secondary' },
  { id: 'yoga', name: 'Yoga', tier: 'secondary' },
] as const;

export type DisciplineId = typeof DISCIPLINES[number]['id'];

export const MAIN_DISCIPLINE = DISCIPLINES[0];
export const SECONDARY_DISCIPLINES = DISCIPLINES.filter((discipline) => discipline.tier === 'secondary');

/** Tên bộ môn trong catalog có thể khác tên chuẩn (ví dụ "Olympic Strength" thuộc Gym). */
const ALIASES: Record<DisciplineId, RegExp> = {
  gym: /\bgym\b|\bstrength\b|olympic|thể hình|tập tạ/i,
  swimming: /bơi|swim|aquatic|pool/i,
  boxing: /boxing|kickfit|đấm bốc/i,
  tennis: /tennis/i,
  badminton: /cầu lông|badminton/i,
  yoga: /yoga|mindful/i,
};

export function matchesDiscipline(name: string, selected: string): boolean {
  const value = name.toLocaleLowerCase('vi');
  const filter = selected.toLocaleLowerCase('vi');
  const known = DISCIPLINES.find((discipline) => discipline.name.toLocaleLowerCase('vi') === filter);
  if (known) return ALIASES[known.id].test(value);
  return value.includes(filter);
}

/** Bộ môn thuộc danh mục chuẩn của SÖL; bộ môn cũ còn sót trong CSDL (ví dụ Pilates) bị loại khỏi giao diện. */
export function isStandardDiscipline(name: string | null | undefined): boolean {
  const value = (name ?? '').toLocaleLowerCase('vi');
  return DISCIPLINES.some((discipline) => ALIASES[discipline.id].test(value));
}
