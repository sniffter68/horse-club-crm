import { DateTime } from 'luxon'
import { API_URL, httpClient } from '../../httpClient'
import { tmaRequest } from '../../tma/api'

export const bookingZone = 'Europe/Moscow'
export interface QuickClient { id: string; name: string; phone: string | null }
export interface QuickService { id: string; name: string; title?: string; durationMinutes: number; allowMembership: boolean }
export interface QuickPermissions { lessonCreateOwn: boolean; lessonCreateAny: boolean }
export interface QuickEntry { startTime: string; endTime: string; trainerId: string; arenaId: string | null; horseIds: string[] }
export interface QuickHorse { id: string; name: string; status: string; healthStatus: string; isUnavailable: boolean; maxDailyMinutes: number; usedMinutes: number }
export interface QuickContext {
  permissions: QuickPermissions
  services: QuickService[]
  trainers: { id: string; name: string; fullName?: string }[]
  horses: QuickHorse[]
  arenas: { id: string; name: string }[]
  entries: QuickEntry[]
  openTime: string; closeTime: string; daysOfWeekOff: number[]
}
export function defaultQuickService(services: QuickService[]) {
  const valid = services.filter(row => row.durationMinutes > 0)
  return valid.find(row => /индивидуаль/i.test(`${row.title} ${row.name}`))
    ?? valid.find(row => row.allowMembership)
    ?? valid.filter(row => row.durationMinutes >= 45 && row.durationMinutes <= 60).sort((a, b) => a.durationMinutes - b.durationMinutes)[0]
    ?? valid[0]
}
export function quickSlots(context: QuickContext, date: string, duration: number) {
  const day = DateTime.fromISO(date, { zone: bookingZone })
  if (context.daysOfWeekOff.includes(day.weekday % 7)) return []
  const minute = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3))
  const first = Math.ceil(minute(context.openTime) / 30) * 30
  const last = minute(context.closeTime) - duration
  return Array.from({ length: Math.max(0, Math.floor((last - first) / 30) + 1) }, (_, index) => day.startOf('day').plus({ minutes: first + index * 30 }).toFormat('HH:mm'))
}
export function quickOverlaps(entry: QuickEntry, start: string, duration: number) {
  return +new Date(entry.startTime) < +new Date(start) + duration * 60000 && +new Date(entry.endTime) > +new Date(start)
}
export function quickHorseReason(horse: QuickHorse, entries: QuickEntry[], start: string, duration: number) {
  if (horse.healthStatus === 'TREATMENT') return 'На лечении'
  if (horse.healthStatus === 'QUARANTINE') return 'Карантин'
  if (horse.isUnavailable || horse.status !== 'active' || horse.healthStatus !== 'HEALTHY') return 'Недоступна'
  if (entries.some(row => row.horseIds.includes(horse.id) && quickOverlaps(row, start, duration))) return 'Занята'
  if (horse.usedMinutes + duration > horse.maxDailyMinutes) return 'Лимит нагрузки'
  return undefined
}
export async function quickRequest<T>(path: string, token?: string, signal?: AbortSignal, body?: unknown): Promise<T> {
  if (token) return tmaRequest<T>(`quick-booking/${path}`, token, { signal, ...(body ? { method: 'POST', body: JSON.stringify(body) } : {}) })
  const url = `${API_URL}/${body ? path : `workspace/quick-booking/${path}`}`
  return (body ? await httpClient.post<T>(url, body, { signal }) : await httpClient.get<T>(url, { signal })).data
}
