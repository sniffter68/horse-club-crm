import { expect, it } from 'vitest'
import { fullAccess, mayReplaceHorse, type AccessSnapshot } from './access'
const trainer: AccessSnapshot = { role: 'TRAINER', userId: 'u1', trainerId: 't1', permissions: { ...fullAccess, horseReplaceAny: false } }
it('allows only the assigned trainer and fails closed until server identity arrives', () => {
  expect(mayReplaceHorse('TRAINER', trainer, 't1')).toBe(true)
  expect(mayReplaceHorse('TRAINER', trainer, 't2')).toBe(false)
  expect(mayReplaceHorse('TRAINER', undefined, 't1')).toBeFalsy()
  expect(mayReplaceHorse('TRAINER', trainer, undefined)).toBe(false)
})
it('revocation and even a forged any-lesson flag cannot bypass ownership', () => {
  expect(mayReplaceHorse('TRAINER', { ...trainer, permissions: { ...fullAccess, horseReplaceOwn: false } }, 't1')).toBe(false)
  expect(mayReplaceHorse('TRAINER', { ...trainer, permissions: fullAccess }, 't2')).toBe(false)
})
it('administrator and manager retain all-lesson replacement', () => {
  expect(mayReplaceHorse('ADMIN', undefined, 't2')).toBe(true)
  expect(mayReplaceHorse('MANAGER', undefined, 't2')).toBe(true)
})
it('supports the account UUID fallback only without a trainer binding', () => {
  expect(mayReplaceHorse('TRAINER', { ...trainer, trainerId: null }, 'u1')).toBe(true)
  expect(mayReplaceHorse('TRAINER', trainer, 'u1')).toBe(false)
})
