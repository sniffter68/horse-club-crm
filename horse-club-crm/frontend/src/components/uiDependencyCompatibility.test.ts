import { describe, expect, it, vi } from 'vitest'
import isEqual from 'rc-util/es/isEqual'

describe('UI dependency comparison with shared form values', () => {
  it('compares shared sibling objects without reporting a cycle', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      const shared = { enabled: true, interval: ['09:00', '21:00'] }
      expect(isEqual({ monday: shared, tuesday: shared }, {
        monday: { enabled: true, interval: ['09:00', '21:00'] },
        tuesday: { enabled: true, interval: ['09:00', '21:00'] },
      })).toBe(true)
      expect(error).not.toHaveBeenCalled()
    } finally { error.mockRestore() }
  })

  it('still detects a changed value in a shared branch', () => {
    const shared = { enabled: true }
    expect(isEqual({ monday: shared, tuesday: shared }, {
      monday: { enabled: true }, tuesday: { enabled: false },
    })).toBe(false)
  })

  it('preserves shallow comparison and equal reference behavior', () => {
    const shared = { enabled: true }
    expect(isEqual(shared, shared)).toBe(true)
    expect(isEqual({ value: shared }, { value: { enabled: true } }, true)).toBe(false)
  })
})
