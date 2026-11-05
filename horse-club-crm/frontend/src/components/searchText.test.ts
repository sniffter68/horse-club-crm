import { describe, expect, it } from 'vitest'
import { matchRange, phoneDigits, recordSuggestion } from './searchText'

describe('search matching', () => {
  it('matches Cyrillic without case sensitivity and treats punctuation literally', () => {
    expect(matchRange('Анна (клиент)', 'анН')).toEqual([0, 3])
    expect(matchRange('Анна (клиент)', '(')).toEqual([5, 6])
    expect(matchRange('Анна', '')).toBeUndefined()
  })
  it('highlights masked phone ranges for either Russian prefix', () => {
    expect(phoneDigits('8 (900) 123-45-67')).toBe('9001234567')
    expect(matchRange('+7 (900) 123-45-67', '8 900 123 45 67')).toEqual([4, 18])
    expect(matchRange('+7 (900) 123-45-67', '12345')).toEqual([9, 15])
    expect(matchRange('Анна', '999')).toBeUndefined()
  })
  it('extracts list suggestions and related clients without exposing unknown fields', () => {
    expect(recordSuggestion({ id: '1', name: 'Анна', phone: '123' })).toEqual({ id: '1', text: 'Анна', detail: '123' })
    expect(recordSuggestion({ id: '2', client: { id: '1', name: 'Анна' } })?.text).toBe('Анна')
    expect(recordSuggestion(null)).toBeUndefined()
    expect(recordSuggestion({ id: '3', name: 'Буран', owner: { name: 'Анна' } })?.detail).toBe('Анна')
  })
})
