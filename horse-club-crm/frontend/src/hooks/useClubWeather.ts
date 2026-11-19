import { useEffect, useState } from 'react'

export const CLUB_WEATHER_URL = 'https://api.open-meteo.com/v1/forecast?latitude=52.7212&longitude=41.4523&current=temperature_2m,weather_code&timezone=Europe%2FMoscow'
export const WEATHER_CACHE_KEY = 'horsecrm.weather.tambov.v1'
export const WEATHER_CACHE_TTL = 20 * 60 * 1000

export interface ClubWeather { temperature: number; code: number }
interface CachedWeather extends ClubWeather { fetchedAt: number }

export function formatTemperature(value: number): string {
  const rounded = Math.round(value)
  return `${rounded > 0 ? '+' : ''}${rounded === 0 ? 0 : rounded}°C`
}

// WMO interpretation: https://open-meteo.com/en/docs#weather_variable_documentation
export function describeWeather(code: number): { icon: 'sun' | 'cloud' | 'rain' | 'snow'; label: string } | null {
  if (code === 0 || code === 1) return { icon: 'sun', label: 'ясно' }
  if (code === 2 || code === 3) return { icon: 'cloud', label: 'облачно' }
  if (code === 45 || code === 48) return { icon: 'cloud', label: 'туман' }
  if ([51, 53, 55, 56, 57].includes(code)) return { icon: 'rain', label: 'морось' }
  if ([61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return { icon: 'rain', label: 'дождь' }
  if ([71, 73, 75, 77, 85, 86].includes(code)) return { icon: 'snow', label: 'снег' }
  if ([95, 96, 97, 99].includes(code)) return { icon: 'rain', label: 'гроза' }
  return null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

export function parseWeather(value: unknown): ClubWeather | null {
  if (!isRecord(value) || !isRecord(value.current)) return null
  const { temperature_2m: temperature, weather_code: code } = value.current
  return typeof temperature === 'number' && Number.isFinite(temperature)
    && typeof code === 'number' && describeWeather(code) ? { temperature, code } : null
}

export function parseWeatherCache(raw: string | null, now = Date.now()): CachedWeather | null {
  try {
    const value: unknown = JSON.parse(raw ?? 'null')
    if (!isRecord(value) || typeof value.fetchedAt !== 'number' || !Number.isFinite(value.fetchedAt)
      || value.fetchedAt > now || now - value.fetchedAt >= WEATHER_CACHE_TTL) return null
    const weather = parseWeather({ current: { temperature_2m: value.temperature, weather_code: value.code } })
    return weather ? { ...weather, fetchedAt: value.fetchedAt } : null
  } catch { return null }
}

function readCache(): CachedWeather | null {
  try { return parseWeatherCache(sessionStorage.getItem(WEATHER_CACHE_KEY)) } catch { return null }
}

export function useClubWeather(): ClubWeather | null {
  const [weather, setWeather] = useState<ClubWeather | null>(readCache)
  useEffect(() => {
    let disposed = false
    let timer: ReturnType<typeof setTimeout> | undefined
    let controller: AbortController | undefined
    const update = async () => {
      const cached = readCache()
      if (cached) {
        setWeather(cached)
        timer = setTimeout(() => { void update() }, WEATHER_CACHE_TTL - (Date.now() - cached.fetchedAt))
        return
      }
      setWeather(null)
      controller = new AbortController()
      const timeout = setTimeout(() => controller?.abort(), 8000)
      try {
        const response = await fetch(CLUB_WEATHER_URL, { signal: controller.signal })
        const payload: unknown = response.ok ? await response.json() : null
        const current = parseWeather(payload)
        if (disposed) return
        if (current) {
          try { sessionStorage.setItem(WEATHER_CACHE_KEY, JSON.stringify({ ...current, fetchedAt: Date.now() })) } catch { /* Storage may be disabled. */ }
        }
        setWeather(current)
      } catch { /* Weather is optional, including when offline or blocked. */ }
      finally {
        clearTimeout(timeout)
        if (!disposed) timer = setTimeout(() => { void update() }, WEATHER_CACHE_TTL)
      }
    }
    void update()
    return () => { disposed = true; clearTimeout(timer); controller?.abort() }
  }, [])
  return weather
}
