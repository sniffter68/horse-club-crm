import { expect, it } from 'vitest'
import { stableListQuery, stablePagination } from './pagination'

it.each([undefined, null, '', ' ', 'NaN', NaN, 'Infinity', Infinity, -Infinity, 'garbage', '2invalid', '-3', -1, '0', 0, {}, []])('uses offset zero for invalid page %j', value => {
  expect(stablePagination(value)).toEqual({ page: 1, limit: 20, offset: 0 })
})

it.each([[1, 0], [2, 20], ['3', 40], ['2.75', 20], ['1.01', 0], [0.9, 0], [' 4 ', 60]])('normalizes page %j to offset %i', (page, offset) => {
  expect(stablePagination(page).offset).toBe(offset)
})

it.each([undefined, null, '', 'NaN', 'Infinity', Infinity, NaN, -20, 0, {}, []])('uses a valid default limit for %j', limit => {
  expect(stablePagination(2, limit)).toEqual({ page: 2, limit: 20, offset: 20 })
})

it.each([['5.9', 5], [1000, 100], ['100', 100]])('normalizes limit %j within the API bounds', (value, limit) => {
  expect(stablePagination('3.9', value)).toEqual({ page: 3, limit, offset: 2 * limit })
})

it('bounds enormous pages before calculating offset to prevent overflow', () => {
  for (const pageValue of [Number.MAX_VALUE, Number.MAX_SAFE_INTEGER, '1e100']) {
    for (const size of [1, 20, 100]) {
      const { page, limit, offset } = stablePagination(pageValue, size)
      expect(Number.isSafeInteger(page)).toBe(true)
      expect(Number.isSafeInteger(limit)).toBe(true)
      expect(Number.isSafeInteger(offset)).toBe(true)
      expect(offset).toBeGreaterThanOrEqual(0)
      expect(offset).toBeLessThanOrEqual(2_147_483_647)
    }
  }
})

it.each([undefined, null, '', 'NaN', NaN, Infinity, 'Infinity', -1, '-20', 1.5, '2.75'])('sanitizes invalid API offset %j at the request boundary', offset => {
  expect(stableListQuery({ offset, limit: 20 })).toEqual({ offset: 0, limit: 20 })
})

it.each([undefined, null, '', 'NaN', NaN, Infinity, 'Infinity', -1, '0', 0, 1.5, '2.75'])('sanitizes invalid API limit %j at the request boundary', limit => {
  expect(stableListQuery({ offset: 40, limit })).toEqual({ offset: 40, limit: 20 })
})

it('converts valid query strings to numbers and preserves filters', () => {
  expect(stableListQuery({ offset: '40', limit: '10', horseId: 'h1', type: 'shoeing' }))
    .toEqual({ offset: 40, limit: 10, horseId: 'h1', type: 'shoeing' })
})

it('omits invalid optional query values before serialization', () => {
  expect(stableListQuery({ horseId: undefined, from: null, to: NaN, type: 'NaN', other: 'undefined', missing: 'null' }))
    .toEqual({ offset: 0, limit: 20 })
})

it('retains API pagination bounds at the request boundary', () => {
  expect(stableListQuery({ offset: Number.MAX_VALUE, limit: 1000 })).toEqual({ offset: 2_147_483_647, limit: 100 })
})
