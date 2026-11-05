import type { Trainer } from '../catalogs/types'
import { peakOccupancy, type ScheduleEntry } from './triad'

export interface ScheduleMove { startTime: string; endTime: string; trainerId: string; arenaId?: string }

export function moveConflict(entry: ScheduleEntry, move: ScheduleMove, entries: ScheduleEntry[], trainers: Trainer[]): string | undefined {
  const from = +new Date(move.startTime), to = +new Date(move.endTime)
  const others = entries.filter(e => !(e.id === entry.id && e.source === entry.source) && e.active)
  if (others.some(e => +new Date(e.startTime) < to && +new Date(e.endTime) > from && e.horses.some(h => entry.horses.some(own => own.id === h.id)))) return 'Лошадь уже занята в это время'
  if (others.some(e => e.horses.some(h => entry.horses.some(own => own.id === h.id && +new Date(e.startTime) < to + own.restMinutes * 60000 && +new Date(e.endTime) + own.restMinutes * 60000 > from)))) return 'Лошади нужен отдых между тренировками'
  const limit = trainers.find(t => t.id === move.trainerId)?.maxParallelLessons ?? 4
  if (peakOccupancy(others.filter(e => e.trainerId === move.trainerId), from, to) + Math.max(1, entry.riders.length) > limit) return `У тренера достигнут максимум одновременных всадников (${limit})`
}
