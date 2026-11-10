import { DateTime } from 'luxon'
export const tmaDay = () => DateTime.now().setZone('Europe/Moscow').toISODate()!
export const tmaWeek = (date: string) => {
  const start = DateTime.fromISO(date, { zone: 'Europe/Moscow' }).startOf('week')
  return Array.from({ length: 7 }, (_, index) => start.plus({ days: index }))
}
export const tmaTime = (date: string) => DateTime.fromISO(date).setZone('Europe/Moscow').toFormat('HH:mm')
