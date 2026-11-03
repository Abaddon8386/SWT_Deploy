/** Generated portraits illustrate a discipline or coach profile. */
export function coachIllustration(specialization: string | null, coachName?: string | null) {
  const name = coachName || '';
  if (/trâm|tram|tâm|tam|mỹ|my/i.test(name)) return '/images/fitness/coach-my-tram.jpg';
  if (/quân|quan/i.test(name)) return '/images/fitness/coach-minh-quan.jpg';
  if (/tài|tai/i.test(name)) return '/images/fitness/coach-personal.jpg';
  const value = specialization || '';
  if (/tennis/i.test(value)) return '/images/fitness/coach-tennis.jpg';
  if (/bơi|swim|aquatic/i.test(value)) return '/images/fitness/coach-aquatics.jpg';
  if (/movement|mobility|core|yoga|giãn|chuyển động/i.test(value)) return '/images/fitness/coach-my-tram.jpg';
  if (/strength|barbell|tạ|sức mạnh|boxing|gym/i.test(value)) return '/images/fitness/coach-minh-quan.jpg';
  return '/images/fitness/coach-personal.jpg';
}
