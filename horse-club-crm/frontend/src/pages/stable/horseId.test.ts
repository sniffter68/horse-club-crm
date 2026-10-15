import { expect, it } from 'vitest'
import { canRequestStableList, isHorseUuid } from './horseId'

const horseId = '3b241101-e2bb-4255-8caf-4136c566a962'
it.each([undefined, null, '', ' ', 123, {}, { id: horseId }, 'undefined', 'null', 'h1', `${horseId}?`, ` ${horseId}`, '3b241101-e2bb-9255-8caf-4136c566a962'])('rejects invalid horseId %j', value => {
  expect(isHorseUuid(value)).toBe(false)
})
it.each([horseId, horseId.toUpperCase(), '00000000-0000-0000-0000-000000000000', 'ffffffff-ffff-ffff-ffff-ffffffffffff'])('accepts a backend-compatible UUID %s', value => {
  expect(isHorseUuid(value)).toBe(true)
  expect(canRequestStableList(new URLSearchParams({ horseId: value }), true)).toBe(true)
})
it('blocks a scoped request until an ID exists, while allowing the unfiltered calendar', () => {
  expect(canRequestStableList(new URLSearchParams(), true)).toBe(false)
  expect(canRequestStableList(new URLSearchParams())).toBe(true)
})
it.each(['', 'undefined', 'null', 'NaN', '123', '[object Object]', 'h1'])('blocks invalid serialized horseId=%s even when the ID is optional', value => {
  const params = new URLSearchParams({ horseId: value })
  expect(canRequestStableList(params)).toBe(false)
  expect(canRequestStableList(params, true)).toBe(false)
})
