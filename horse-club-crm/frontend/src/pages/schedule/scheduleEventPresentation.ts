import { DateTime } from 'luxon'
import { CLUB_TIME_ZONE } from './time'
import { entryStatusLabel, type ScheduleEntry } from './triad'

const clock = (value: string) => DateTime.fromISO(value, { zone: CLUB_TIME_ZONE }).toFormat('HH:mm')
export const eventTime = (entry: ScheduleEntry) => `${clock(entry.startTime)} - ${clock(entry.endTime)}`
export const eventTrainer = (entry: ScheduleEntry) => entry.trainerName || (entry.participantsCount != null ? `Экскурсия (${entry.participantsCount} чел.)` : 'Без тренера')
export const eventSummary = (entry: ScheduleEntry) => [eventTime(entry), eventTrainer(entry), entry.riders.join(', ') || 'Нет участников', entry.horses.map(h => h.name).join(', ') || 'Без лошади', entry.paymentSummary, entry.discipline, entryStatusLabel(entry)].filter(Boolean).join(' | ')

