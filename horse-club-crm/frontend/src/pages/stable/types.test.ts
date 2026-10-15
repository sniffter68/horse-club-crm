import { describe, expect, it } from 'vitest'
import { vetTypeForApi, vetTypes } from './types'

describe('veterinary procedure API contract', () => {
  it.each([
    ['Вакцинация', 'vaccination'], ['Дегельминтизация', 'deworming'], ['Ковка', 'shoeing'],
    ['Осмотр ветеринара', 'vet_check'], ['Стоматолог', 'dentist'],
  ] as const)('displays %s and serializes %s as a string', (label, key) => {
    expect(vetTypes[key]).toBe(label)
    expect(JSON.parse(JSON.stringify({ type: vetTypeForApi(key) }))).toEqual({ type: key })
  })
  it.each([undefined, null, '', 'Ковка', 'SHOEING', 'shoeing ', { label: 'Ковка', value: 'shoeing' }, 'toString', '__proto__'])('rejects invalid type %j before sending a request', value => {
    expect(() => vetTypeForApi(value)).toThrow('Выберите процедуру из списка')
  })
})
