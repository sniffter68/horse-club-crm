import { describe, expect, it } from 'vitest'
import { formatPhone, phonePayload } from './formatPhone'

describe('phone editing', () => {
  it('formats pasted Russian numbers and keeps the last digit while typing', () => {
    expect(formatPhone('89991234567')).toBe('+7 (999) 123-45-67')
    expect(formatPhone('9991234567')).toBe('+7 (999) 123-45-67')
    expect(formatPhone('+7 (999) 123-45-6')).toBe('+7 (999) 123-45-6')
    expect(formatPhone('')).toBe('')
  })
  it('sends canonical contact values and supports clearing optional phones', () => {
    expect(phonePayload('+7 (999) 123-45-67')).toBe('+79991234567')
    expect(phonePayload('89991234567')).toBe('+79991234567')
    expect(phonePayload('+44 20 7123 4567')).toBe('+442071234567')
    expect(phonePayload('')).toBeNull()
  })
})
