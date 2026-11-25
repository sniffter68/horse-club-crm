import { DateTime } from 'luxon'
import type { ClubSchedule } from './types'
import { CLUB_TIME_ZONE } from './time'

export function clubHoursForDate(schedule: ClubSchedule, date: string) {
  const weekday = DateTime.fromISO(date, { zone: CLUB_TIME_ZONE }).weekday
  const day = schedule.weekDays?.find(day => day.dayOfWeek === weekday)
  return { openTime: day?.openTime ?? schedule.openTime, closeTime: day?.closeTime ?? schedule.closeTime,
    isWorkingDay: day?.isWorkingDay ?? !schedule.daysOfWeekOff.includes(weekday % 7) }
}

export function clubWeekDays(schedule: ClubSchedule) {
  return schedule.weekDays ?? Array.from({ length: 7 }, (_, index) => ({ dayOfWeek: index + 1,
    isWorkingDay: !schedule.daysOfWeekOff.includes((index + 1) % 7), openTime: schedule.openTime, closeTime: schedule.closeTime }))
}
