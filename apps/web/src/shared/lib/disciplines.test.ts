import { describe, expect, it } from 'vitest';
import { DISCIPLINES, MAIN_DISCIPLINE, SECONDARY_DISCIPLINES, isStandardDiscipline, matchesDiscipline } from './disciplines';

describe('disciplines', () => {
  it('has Gym as the only main discipline followed by the four secondary ones', () => {
    expect(MAIN_DISCIPLINE.name).toBe('Gym');
    expect(DISCIPLINES.filter((discipline) => discipline.tier === 'main')).toHaveLength(1);
    expect(SECONDARY_DISCIPLINES.map((discipline) => discipline.name)).toEqual(['Bơi lội', 'Boxing', 'Tennis', 'Cầu lông', 'Yoga']);
  });

  it.each([
    ['Olympic Strength', 'Gym', true],
    ['Thermal Aquatics', 'Bơi lội', true],
    ['Bơi sải nâng cao', 'Bơi lội', true],
    ['Boxing & Kickfit', 'Boxing', true],
    ['Cầu lông', 'Cầu lông', true],
    ['Badminton', 'Cầu lông', true],
    ['Tennis', 'Tennis', true],
    ['Mindful Yoga', 'Yoga', true],
    ['Yoga cơ bản', 'Gym', false],
    ['Tennis', 'Gym', false],
    ['Bơi lội', 'Boxing', false],
  ])('matches catalog name "%s" against filter "%s" -> %s', (name, filter, expected) => {
    expect(matchesDiscipline(name, filter)).toBe(expected);
  });

  it.each([
    ['Gym', true],
    ['Olympic Strength', true],
    ['Mindful Yoga', true],
    ['Boxing & Kickfit', true],
    ['Pilates', false],
    ['Zumba', false],
    ['', false],
    [null, false],
  ])('treats "%s" as standard discipline -> %s', (name, expected) => {
    expect(isStandardDiscipline(name)).toBe(expected);
  });
});
