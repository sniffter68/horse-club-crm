import type { Arena, Client, Horse, Service, Trainer } from '../catalogs/types'
export type Status = 'SCHEDULED' | 'COMPLETED' | 'NO_SHOW' | 'CANCELLED'
export interface Lesson {
  id: string; startTime: string; endTime: string; status: Status;
  trainer: Trainer; service: Service; arena: Arena | null;
  bookings: { id: string; client: Client; horse: Horse | null; membership: MembershipSummary | null }[];
}
export interface MembershipSummary {
  id: string; totalLessons: number; remainedLessons: number; validUntil: string; isActive?: boolean;
  pricingPlan?: { id: string; name: string } | null;
}
export interface ClientWithMemberships extends Client { memberships: MembershipSummary[] }
export interface ClubSchedule { openTime: string; closeTime: string; daysOfWeekOff: number[] }
export interface Workload { maxDailyMinutes: number; usedMinutes: number; remainingMinutes: number }
export interface BookingValues {
  clientId: string; membershipId?: string; serviceId: string; trainerId: string; horseId?: string; arenaId?: string; startTime: string; durationMinutes: number;
}
export const statuses: Record<Status, { color: string; label: string }> = {
  SCHEDULED: { color: '#1677ff', label: 'Запланировано' },
  COMPLETED: { color: '#389e0d', label: 'Проведено' },
  NO_SHOW: { color: '#d46b08', label: 'Неявка' },
  CANCELLED: { color: '#737373', label: 'Отменено' },
}
