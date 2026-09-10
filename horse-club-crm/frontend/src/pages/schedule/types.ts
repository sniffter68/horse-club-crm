import type { Client, Horse, Service, Trainer } from '../catalogs/types'
export type Status = 'SCHEDULED' | 'COMPLETED' | 'NO_SHOW' | 'CANCELLED'
export interface Lesson {
  id: string; startTime: string; endTime: string; status: Status;
  trainer: Trainer; horse: Horse; service: Service;
  bookings: { id: string; client: Client }[];
}
export interface ClubSchedule { openTime: string; closeTime: string; dayOfWeekOff: number }
export interface Workload { maxDailyMinutes: number; usedMinutes: number; remainingMinutes: number }
export interface BookingValues {
  clientId: string; serviceId: string; trainerId: string; horseId: string; startTime: string; durationMinutes: number;
}
export const statuses: Record<Status, { color: string; label: string }> = {
  SCHEDULED: { color: '#1677ff', label: 'Запланировано' },
  COMPLETED: { color: '#389e0d', label: 'Проведено' },
  NO_SHOW: { color: '#d46b08', label: 'Неявка' },
  CANCELLED: { color: '#737373', label: 'Отменено' },
}
