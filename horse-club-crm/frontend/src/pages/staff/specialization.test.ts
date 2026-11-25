import { describe, expect, it } from 'vitest'
import { trainerServiceSettings, trainerServiceWarning } from './specialization'
import { horseServiceDirection } from '../horses/serviceAvailability'

describe('trainer specialization warnings', () => {
  for (const { key, title } of trainerServiceSettings) it(`warns softly for ${key}`, () => {
    expect(trainerServiceWarning({ [key]: false }, key)).toContain(title)
    expect(trainerServiceWarning({ [key]: false }, key)).toContain('Сохранение доступно')
    expect(trainerServiceWarning({ [key]: true }, key)).toBeUndefined()
    expect(trainerServiceWarning({}, key)).toBeUndefined()
  })
  it('ignores missing selection and respects explicit service direction', () => {
    expect(trainerServiceWarning(undefined, 'allowIndividual')).toBeUndefined()
    expect(trainerServiceWarning({ allowWalk: false })).toBeUndefined()
    const direction = horseServiceDirection({ title: 'Тренировка', maxCapacity: 1, serviceDirection: 'allowWalk' })
    expect(trainerServiceWarning({ allowWalk: false }, direction)).toContain('Прогулки и выезды')
  })
})
