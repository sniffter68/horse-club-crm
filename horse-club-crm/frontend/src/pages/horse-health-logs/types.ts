import type { Dayjs } from 'dayjs'

export type HealthLogType = 'VACCINATION' | 'FARRIER' | 'DEWORMING' | 'INSPECTION'

export interface HorseHealthLogValues {
  horseId: string
  type: HealthLogType
  occurredAt: Dayjs | string
  nextDueAt?: Dayjs | string | null
  notes?: string | null
}

export interface HorseHealthLog extends Omit<HorseHealthLogValues, 'occurredAt' | 'nextDueAt'> {
  id: string
  occurredAt: string
  nextDueAt: string | null
  horse: { id: string; name: string }
  createdAt: string
  updatedAt: string
}
