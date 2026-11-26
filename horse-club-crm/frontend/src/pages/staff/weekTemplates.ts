import { DateTime } from 'luxon'
import type { ClubSchedule } from '../schedule/types'
import { clubHoursForDate } from '../schedule/clubHours'

export const weekTemplates = { '2/2': '2 через 2', '5/2': '5 через 2', '6/1': '6 через 1', OFF: 'Выходные на всю неделю', VACATION: 'Отпуск' }
export type WeekTemplate = keyof typeof weekTemplates
export type WeekDay = { date: string; kind: 'WORK' | 'OFF' | 'VACATION'; startTime: string; endTime: string }
export function intervalHours(start: string, end: string): number {
  const minutes = (time: string) => { const [h, m] = time.split(':').map(Number); return h * 60 + m }
  return Math.max(0, minutes(end) - minutes(start)) / 60
}
export function generateWeek(date: string, template: WeekTemplate, schedule: ClubSchedule, cycleStart = date): WeekDay[] {
  const monday = DateTime.fromISO(date, { zone: 'Europe/Moscow' }).startOf('week')
  const anchor = DateTime.fromISO(cycleStart, { zone: 'Europe/Moscow' }).startOf('day')
  return Array.from({ length: 7 }, (_, index) => {
    const day = monday.plus({ days: index }), iso = day.toISODate()!
    const hours = clubHoursForDate(schedule, iso)
    const phase = ((Math.round(day.diff(anchor, 'days').days) % 4) + 4) % 4
    const working = hours.isWorkingDay && (template === '2/2' ? phase < 2 : template === '5/2' ? index < 5 : template === '6/1' && index < 6)
    return { date: iso, kind: template === 'VACATION' ? 'VACATION' : working ? 'WORK' : 'OFF', startTime: hours.openTime, endTime: hours.closeTime }
  })
}
export const weekHours = (days: WeekDay[]) => days.reduce((sum, day) => sum + (day.kind === 'WORK' ? intervalHours(day.startTime, day.endTime) : 0), 0)
export const plannedDayLabel = (day: WeekDay) => day.kind === 'WORK' ? `${day.startTime}–${day.endTime}` : day.kind === 'VACATION' ? 'Отпуск' : 'Выходной'
