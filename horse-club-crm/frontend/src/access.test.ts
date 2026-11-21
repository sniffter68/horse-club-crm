import { expect, it } from 'vitest'
import { fullAccess, mayReplaceHorse, type AccessSnapshot } from './access'
const trainer: AccessSnapshot = { role: 'TRAINER', userId: 'u1', trainerId: 't1', permissions: { ...fullAccess, horseReplaceAny: false } }
it('allows only the assigned trainer and fails closed until server identity arrives', () => {
  expect(mayReplaceHorse('TRAINER', trainer, 't1')).toBe(true)
  expect(mayReplaceHorse('TRAINER', trainer, 't2')).toBe(false)
  expect(mayReplaceHorse('TRAINER', undefined, 't1')).toBeFalsy()
  expect(mayReplaceHorse('TRAINER', trainer, undefined)).toBe(false)
})
it('revoking both permissions blocks own and colleague lessons', () => {
  const revoked = { ...trainer, permissions: { ...trainer.permissions, horseReplaceOwn: false } }
  expect(mayReplaceHorse('TRAINER', revoked, 't1')).toBe(false)
  expect(mayReplaceHorse('TRAINER', revoked, 't2')).toBe(false)
})
it('the server all-lesson permission allows colleague lessons independently of ownership', () => {
  const granted = { ...trainer, permissions: { ...fullAccess, horseReplaceOwn: false } }
  expect(mayReplaceHorse('TRAINER', granted, 't1')).toBe(true)
  expect(mayReplaceHorse('TRAINER', granted, 't2')).toBe(true)
  expect(mayReplaceHorse('TRAINER', granted, undefined)).toBe(true)
  expect(mayReplaceHorse('STABLE_WORKER', granted, 't2')).toBe(false)
  expect(mayReplaceHorse('TRAINER', { ...granted, role: 'ADMIN' }, 't2')).toBe(false)
})
it('administrator and manager retain all-lesson replacement', () => {
  expect(mayReplaceHorse('ADMIN', undefined, 't2')).toBe(true)
  expect(mayReplaceHorse('MANAGER', undefined, 't2')).toBe(true)
})
it('supports the account UUID fallback only without a trainer binding', () => {
  expect(mayReplaceHorse('TRAINER', { ...trainer, trainerId: null }, 'u1')).toBe(true)
  expect(mayReplaceHorse('TRAINER', trainer, 'u1')).toBe(false)
})
