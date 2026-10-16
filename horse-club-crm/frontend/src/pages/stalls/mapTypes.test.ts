import { describe, expect, it } from 'vitest'
import { feedingRows } from './mapTypes'
describe('stall sign feeding', () => {
  it('keeps meals, multiline instructions, hay and supplements', () => {
    const result = feedingRows('Особый рацион\nУтро: овёс 1 кг\nзамочить\nДень: 0.5 кг\nВечер: 1 кг\nСено: 8 кг\nПодкормки: соль')
    expect(result.rows.map(row => row.value)).toEqual(['овёс 1 кг\nзамочить', '0.5 кг', '1 кг', 'Сено: 8 кг\nПодкормки: соль'])
    expect(result.rest).toBe('Особый рацион')
  })
  it('preserves unstructured rations and represents missing data', () => {
    expect(feedingRows('Только сено').rest).toBe('Только сено')
    expect(feedingRows(null).rows.every(row => !row.value)).toBe(true)
  })
})
