import { describe, expect, it } from 'vitest';
import { coachIllustration, coachPortrait } from './coachIllustration';

describe('coach portraits', () => {
  it('matches only the three complete profile names, including normalized accents and spacing', () => {
    expect(coachPortrait('Huỳnh Đắc Tài')).toBe('/images/fitness/coach-personal.jpg');
    expect(coachPortrait('HLV Huỳnh Đắc Tài')).toBe('/images/fitness/coach-personal.jpg');
    expect(coachPortrait('  NGUYỄN  MINH QUÂN ')).toBe('/images/fitness/coach-minh-quan.jpg');
    expect(coachPortrait('HLV Nguyễn Minh Quân')).toBe('/images/fitness/coach-minh-quan.jpg');
    expect(coachPortrait('Tran Thi My Tram')).toBe('/images/fitness/coach-my-tram.jpg');
    expect(coachPortrait('HLV Trần Thị Mỹ Trâm')).toBe('/images/fitness/coach-my-tram.jpg');
  });
  it.each(['Nguyễn Mỹ Linh', 'Lê Quang Tâm', 'Trần Quân', 'Tai Nguyen', '', null])('does not assign another coach portrait to %s', name => {
    expect(coachPortrait(name)).toBeUndefined();
    expect(coachIllustration('Yoga', name)).toBe('/images/fitness/coach-movement.webp');
  });
  it('keeps a generic image for unknown coaches without a discipline', () => {
    expect(coachIllustration(null, 'HLV khác')).toBe('/images/fitness/coach-generic.jpg');
  });
  it('uses an explicit portrait ahead of the discipline fallback', () => {
    expect(coachIllustration('Tennis', 'Nguyễn Minh Quân')).toBe('/images/fitness/coach-minh-quan.jpg');
    expect(coachIllustration('Tennis', 'HLV An')).toBe('/images/fitness/coach-tennis.jpg');
  });
});
