import { describe, expect, it } from 'vitest'
import { describeWeather, formatTemperature, parseWeather, parseWeatherCache, WEATHER_CACHE_TTL } from './useClubWeather'

describe('club weather', () => {
  it.each([[4.4, '+4°C'], [4.6, '+5°C'], [0, '0°C'], [-0.4, '0°C'], [-3.2, '-3°C']])('formats %s as %s', (value, expected) => {
    expect(formatTemperature(value)).toBe(expected)
  })
  it.each([
    [[0, 1], 'sun', 'ясно'], [[2, 3], 'cloud', 'облачно'], [[45, 48], 'cloud', 'туман'],
    [[51, 53, 55, 56, 57], 'rain', 'морось'], [[61, 63, 65, 66, 67, 80, 81, 82], 'rain', 'дождь'],
    [[71, 73, 75, 77, 85, 86], 'snow', 'снег'], [[95, 96, 97, 99], 'rain', 'гроза'],
  ])('maps WMO codes %s', (codes, icon, label) => {
    for (const code of codes) expect(describeWeather(code)).toEqual({ icon, label })
  })
  it('rejects malformed API data and unknown codes', () => {
    for (const value of [null, {}, { current: null }, { current: { temperature_2m: '4', weather_code: 0 } },
      { current: { temperature_2m: Infinity, weather_code: 0 } }, { current: { temperature_2m: 4, weather_code: 100 } }]) {
      expect(parseWeather(value)).toBeNull()
    }
    expect(parseWeather({ current: { temperature_2m: -3.2, weather_code: 73 } })).toEqual({ temperature: -3.2, code: 73 })
  })
  it('uses a valid cache only within its 20 minute lifetime', () => {
    const entry = { temperature: 4, code: 0, fetchedAt: 1000 }
    const raw = JSON.stringify(entry)
    expect(parseWeatherCache(raw, 1000 + WEATHER_CACHE_TTL - 1)).toEqual(entry)
    expect(parseWeatherCache(raw, 1000 + WEATHER_CACHE_TTL)).toBeNull()
    expect(parseWeatherCache(raw, 999)).toBeNull()
    for (const invalid of [null, '{broken', '{}', 'null', JSON.stringify({ ...entry, code: 100 })]) {
      expect(parseWeatherCache(invalid, 2000)).toBeNull()
    }
  })
})
