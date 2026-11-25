import { describe, expect, it } from 'vitest'
import { disciplineDirection, horseServiceDirection, horseServiceWarning } from './serviceAvailability'

describe('horse service availability', () => {
  it('uses the explicit direction before name and group capacity', () => {
    expect(horseServiceDirection({ title: 'Фотосессия', maxCapacity: 4, serviceDirection: 'allowIndividual' })).toBe('allowIndividual')
    expect(horseServiceDirection({ title: 'Тренировка', maxCapacity: 1, serviceDirection: 'allowWalk' })).toBe('allowWalk')
    expect(horseServiceDirection({ title: 'Прогулка', maxCapacity: 4, serviceDirection: null })).toBe('allowWalk')
  })
  it.each([
    ['Индивидуальная тренировка', 1, 'allowIndividual'], ['Выездка', 1, 'allowIndividual'],
    ['Групповое занятие', 5, 'allowGroup'], ['Тренировка', 3, 'allowGroup'],
    ['Прогулка', 4, 'allowWalk'], ['Полевой выезд', 1, 'allowWalk'],
    ['Фотосессия', 4, 'allowSpecial'], ['Иппотерапия', 1, 'allowSpecial'], ['Праздник', 1, 'allowSpecial'],
  ])('maps %s using names and capacity', (title, maxCapacity, expected) => {
    expect(horseServiceDirection({ title, maxCapacity })).toBe(expected)
  })
  it('warns only for explicitly disabled directions and preserves old horse responses', () => {
    expect(horseServiceWarning({}, 'allowWalk')).toBeUndefined()
    expect(horseServiceWarning({ allowWalk: true }, 'allowWalk')).toBeUndefined()
    expect(horseServiceWarning({ allowWalk: false }, 'allowIndividual')).toBeUndefined()
    expect(horseServiceWarning({ allowWalk: false }, 'allowWalk')).toContain('отключено')
    expect(disciplineDirection('walks')).toBe('allowWalk')
    expect(disciplineDirection('photoshoot')).toBe('allowSpecial')
    expect(disciplineDirection('dressage')).toBe('allowIndividual')
  })
})
