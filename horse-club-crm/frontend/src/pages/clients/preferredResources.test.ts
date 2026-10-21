import { describe, expect, it } from 'vitest'
import { preferredValue, activePreferredHorse } from './preferredResources'
import type { Horse } from '../catalogs/types'

const first = '00000000-0000-4000-8000-000000000001'
const second = '00000000-0000-4000-8000-000000000002'
describe('client resource defaults', () => {
  it('fills empty values, follows another client and clears absent defaults', () => {
    expect(preferredValue(undefined, undefined, false, first, true)).toBe(first)
    expect(preferredValue(first, first, false, second, true)).toBe(second)
    expect(preferredValue(first, first, false, null, true)).toBeUndefined()
  })
  it('preserves manual selections, including an explicit clear and seeded resources', () => {
    expect(preferredValue(second, first, true, first, true)).toBe(second)
    expect(preferredValue(undefined, first, true, first, true)).toBeUndefined()
    expect(preferredValue(second, undefined, false, first, true)).toBe(second)
  })
  it('rejects malformed or unavailable defaults', () => {
    expect(preferredValue(undefined, undefined, false, 'invalid', true)).toBeUndefined()
    expect(preferredValue(undefined, undefined, false, first, false)).toBeUndefined()
    for (const healthStatus of ['TREATMENT', 'QUARANTINE', 'RETIRED']) {
      expect(activePreferredHorse({ status: 'active', healthStatus } as Horse)).toBe(false)
    }
  })
})
