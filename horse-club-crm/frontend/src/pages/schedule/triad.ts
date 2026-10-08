import { DateTime } from 'luxon'
import type { ApiError } from '../../httpClient'
import type { Arena, Client, Horse, Trainer } from '../catalogs/types'
import type { DailyHorseWorkload, Lesson, MembershipSummary } from './types'
import { CLUB_TIME_ZONE } from './time'

export const disciplines = { dressage: 'Выездка', jumping: 'Конкур', walks: 'Прогулка шагом', beginners: 'Начинающие', photoshoot: 'Фотосессия', corde: 'Корда' } as const
export type Discipline = keyof typeof disciplines
export type TriadStatus = 'scheduled' | 'completed' | 'no_show' | 'cancelled_client' | 'cancelled_club' | 'penalty_cancellation'
export interface TriadBooking {
  id: string; clientId: string; horseId: string; trainerId: string; arenaId: string; membershipId: string | null;
  startTime: string; endTime: string; serviceType: Discipline; costAmount: string | number; status: TriadStatus;
  client: Pick<Client, 'id' | 'name' | 'firstName' | 'lastName' | 'phone' | 'weightKg'>;
  horse: Pick<Horse, 'id' | 'name' | 'maxRiderWeight' | 'maxDailyWorkloadMinutes' | 'requiredRestMinutes' | 'status' | 'isUnavailable'>;
  trainer: Pick<Trainer, 'id' | 'name' | 'fullName' | 'specializations' | 'isActive'>;
  arena: Pick<Arena, 'id' | 'name' | 'maxRidersCapacity' | 'isActive' | 'isUnavailable'>;
}
export interface TriadAvailability {
  date: string; horseWorkloads: DailyHorseWorkload[];
  arenaOccupancy: { arenaId: string; occupied: number; maxRidersCapacity: number }[];
}
export interface TriadValues {
  clientId: string; horseId: string; trainerId: string; arenaId: string; membershipId?: string;
  startTime: string; endTime: string; serviceType: Discipline; costAmount: number;
}
export interface ScheduleEntry {
  id: string; source: 'lesson' | 'booking'; startTime: string; endTime: string;
  trainerId: string; trainerName: string; arenaId?: string; arenaName?: string;
  horses: { id: string; name: string; restMinutes: number }[];
  riders: string[]; discipline: string; status: string; active: boolean; completed: boolean;
}
export const clientName = (client: Pick<Client, 'id' | 'firstName' | 'lastName' | 'name'>) => [client.firstName, client.lastName].filter(Boolean).join(' ') || client.name || client.id
export const bookingStatusLabels: Record<TriadStatus, string> = { scheduled: 'Запланировано', completed: 'Проведено', no_show: 'Неявка', cancelled_client: 'Отменено клиентом', cancelled_club: 'Отменено клубом', penalty_cancellation: 'Штрафная отмена' }
export function entryStatusLabel(entry: ScheduleEntry): string {
  return bookingStatusLabels[entry.status.toLowerCase() as TriadStatus] ?? (entry.status === 'CANCELLED' ? 'Отменено' : entry.status)
}
export function scheduleEntries(lessons: Lesson[], bookings: TriadBooking[]): ScheduleEntry[] {
  return [
    ...lessons.map(l => ({ id: l.id, source: 'lesson' as const, startTime: l.startTime, endTime: l.endTime,
      trainerId: l.trainer.id, trainerName: l.trainer.fullName || l.trainer.name, arenaId: l.arena?.id, arenaName: l.arena?.name,
      horses: [...new Map(l.bookings.flatMap(b => b.horse ? [[b.horse.id, { id: b.horse.id, name: b.horse.name, restMinutes: b.horse.requiredRestMinutes ?? b.horse.minRestMinutes ?? 45 }] as const] : [])).values()],
      riders: l.bookings.map(b => clientName(b.client)), discipline: l.service.title || l.service.name || 'Занятие', status: l.status,
      active: ['SCHEDULED', 'COMPLETED'].includes(l.status), completed: l.status === 'COMPLETED' })),
    ...bookings.map(b => ({ id: b.id, source: 'booking' as const, startTime: b.startTime, endTime: b.endTime,
      trainerId: b.trainerId, trainerName: b.trainer.fullName || b.trainer.name, arenaId: b.arenaId, arenaName: b.arena.name,
      horses: [{ id: b.horseId, name: b.horse.name, restMinutes: b.horse.requiredRestMinutes ?? 45 }], riders: [clientName(b.client)],
      discipline: disciplines[b.serviceType], status: b.status, active: ['scheduled', 'completed'].includes(b.status), completed: b.status === 'completed' })),
  ]
}
export function peakOccupancy(entries: ScheduleEntry[], from: number, to: number): number {
  const events = entries.filter(e => e.active && +new Date(e.startTime) < to && +new Date(e.endTime) > from).flatMap(e => [
    { at: Math.max(from, +new Date(e.startTime)), delta: e.riders.length }, { at: Math.min(to, +new Date(e.endTime)), delta: -e.riders.length },
  ]).sort((a, b) => a.at - b.at || a.delta - b.delta)
  let count = 0, peak = 0
  for (const event of events) { count += event.delta; peak = Math.max(peak, count) }
  return peak
}
export function dayBounds(date: string): { from: string; to: string } {
  const day = DateTime.fromISO(date, { zone: CLUB_TIME_ZONE }).startOf('day')
  if (!day.isValid) throw new Error('Укажите дату')
  return { from: day.toUTC().toISO()!, to: day.plus({ days: 1 }).toUTC().toISO()! }
}
export function membershipBalance(m: MembershipSummary): { remaining: number; total: number; until: string; label: string; active: boolean } {
  const legacy = m.type !== 'deposit' && (m.totalLessons > 0 || m.initialUnits === undefined)
  const remaining = Number(legacy ? m.remainedLessons : m.remainingUnits ?? 0)
  const total = Number(legacy ? m.totalLessons : m.initialUnits ?? 0)
  const until = legacy ? m.validUntil : m.validTo || m.validUntil
  const active = m.type !== 'boarding' && (legacy ? m.status !== 'frozen' : !m.status || m.status === 'active') && remaining > 0 && +new Date(until) >= Date.now()
    && (!m.validFrom || +new Date(m.validFrom) <= Date.now())
  const label = m.type === 'deposit' ? `${remaining.toLocaleString('ru-RU')} ₽ на депозите` : `${remaining} / ${total} занятий`
  return { remaining, total, until, label, active }
}
const reasons: Record<string, { field?: keyof TriadValues; message: string }> = {
  HORSE_OVERLOADED: { field: 'horseId', message: 'Превышен суточный лимит нагрузки лошади. Выберите другую лошадь или дату.' },
  HORSE_REST_VIOLATION: { field: 'horseId', message: 'Лошади нужен отдых между тренировками. Измените время или выберите другую лошадь.' },
  RIDER_WEIGHT_EXCEEDED: { field: 'horseId', message: 'Вес всадника превышает допустимый лимит для выбранной лошади.' },
  TRAINER_BUSY: { field: 'trainerId', message: 'Тренер занят в выбранное время. Выберите другого тренера или интервал.' },
  ARENA_FULL: { field: 'arenaId', message: 'Вместимость локации исчерпана. Выберите другую локацию или время.' },
  HORSE_UNAVAILABLE: { field: 'horseId', message: 'Лошадь недоступна для тренировок.' },
  TRAINER_UNAVAILABLE: { field: 'trainerId', message: 'Тренер недоступен для тренировок.' },
  ARENA_UNAVAILABLE: { field: 'arenaId', message: 'Локация недоступна для тренировок.' },
  MEMBERSHIP_INVALID: { field: 'membershipId', message: 'Абонемент не принадлежит клиенту. Выберите другой абонемент.' },
  BOOKING_NOT_EDITABLE: { message: 'Запись уже изменена. Обновите расписание перед редактированием.' },
  BOOKING_CONTENTION: { message: 'Ресурсы изменились одновременно. Проверьте доступность и повторите сохранение.' },
}
export function bookingFailure(error: ApiError) { return reasons[error.code ?? ''] ?? { message: error.message } }
