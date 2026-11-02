/** Generated portraits illustrate a discipline, not the identity of a real coach. */
export function coachIllustration(specialization: string | null) {
  const value = specialization || '';
  if (/tennis/i.test(value)) return '/images/fitness/coach-tennis.jpg';
  if (/bơi|swim|aquatic/i.test(value)) return '/images/fitness/coach-aquatics.jpg';
  if (/movement|mobility|core|giãn|chuyển động/i.test(value)) return '/images/fitness/coach-movement.png';
  if (/strength|barbell|tạ|sức mạnh/i.test(value)) return '/images/fitness/coach-strength.png';
  return '/images/fitness/coach-personal.jpg';
}
