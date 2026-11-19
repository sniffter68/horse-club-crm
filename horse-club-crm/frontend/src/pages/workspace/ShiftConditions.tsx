import { useEffect, useState } from 'react'
import { Cloud, CloudRain, CloudSnow, Sun } from 'lucide-react'
import { DateTime } from 'luxon'
import { describeWeather, formatTemperature, useClubWeather } from '../../hooks/useClubWeather'

const icons = { sun: Sun, cloud: Cloud, rain: CloudRain, snow: CloudSnow }

export function ShiftConditions() {
  const [now, setNow] = useState(() => DateTime.now().setZone('Europe/Moscow'))
  const weather = useClubWeather()
  useEffect(() => {
    const timer = setInterval(() => setNow(DateTime.now().setZone('Europe/Moscow')), 15_000)
    return () => clearInterval(timer)
  }, [])
  const condition = weather && describeWeather(weather.code)
  const Icon = icons[condition?.icon ?? 'cloud']
  return <div className="shift-conditions">
    <span>{now.setLocale('ru').toFormat('cccc, d MMMM')}</span>
    <span aria-hidden="true">·</span>
    <time className="tabular-nums" dateTime={now.toISO() ?? undefined}>{now.toFormat('HH:mm')} МСК</time>
    {weather && condition && <span className="shift-weather" aria-label="Погода в Тамбове">
      <span aria-hidden="true">·</span>
      <Icon size={18} strokeWidth={1.75} aria-hidden="true" />
      <span className="tabular-nums">{formatTemperature(weather.temperature)}</span>
      <span>{condition.label}</span>
    </span>}
  </div>
}
