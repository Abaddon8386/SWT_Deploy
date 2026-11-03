/** Only explicitly supplied profiles use named portraits; other images are illustrations. */
const profilePortraits = new Map([
  ['huynh dac tai', '/images/fitness/coach-personal.jpg'],
  ['nguyen minh quan', '/images/fitness/coach-minh-quan.jpg'],
  ['tran thi my tram', '/images/fitness/coach-my-tram.jpg'],
]);

export function coachPortrait(coachName?: string | null) {
  const name = (coachName || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[đĐ]/g, 'd').toLowerCase().trim().replace(/\s+/g, ' ')
    .replace(/^(hlv|coach)\s+/, '');
  return profilePortraits.get(name);
}

export function coachIllustration(specialization: string | null, coachName?: string | null) {
  const portrait = coachPortrait(coachName);
  if (portrait) return portrait;
  const value = specialization || '';
  if (/tennis/i.test(value)) return '/images/fitness/coach-tennis.jpg';
  if (/bơi|swim|aquatic/i.test(value)) return '/images/fitness/coach-aquatics.jpg';
  if (/movement|mobility|core|yoga|giãn|chuyển động/i.test(value)) return '/images/fitness/coach-movement.webp';
  if (/strength|barbell|tạ|sức mạnh/i.test(value)) return '/images/fitness/coach-strength.webp';
  return '/images/fitness/coach-generic.jpg';
}
