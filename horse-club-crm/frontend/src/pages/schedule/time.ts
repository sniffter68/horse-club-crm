import { DateTime } from 'luxon'

export const CLUB_TIME_ZONE = import.meta.env.VITE_CLUB_TIME_ZONE || 'Europe/Moscow'
export function toLocalInput(date: Date): string {
  return DateTime.fromJSDate(date, { zone: CLUB_TIME_ZONE }).toFormat("yyyy-MM-dd'T'HH:mm")
}
export function toInstant(value: string): string {
  const date = DateTime.fromISO(value, { zone: CLUB_TIME_ZONE })
  if (!date.isValid || date.toFormat("yyyy-MM-dd'T'HH:mm") !== value || date.getPossibleOffsets().length !== 1) {
    throw new Error('Укажите однозначное время начала в часовом поясе клуба')
  }
  return date.toUTC().toISO()!
}
export function formatTime(value: string): string {
  return DateTime.fromISO(value, { zone: CLUB_TIME_ZONE }).setLocale('ru').toFormat('dd LLL yyyy, HH:mm')
}
