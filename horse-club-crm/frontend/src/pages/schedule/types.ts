import type { Arena, Client, Horse, Service, Trainer } from '../catalogs/types'
export type Status = 'SCHEDULED' | 'COMPLETED' | 'NO_SHOW' | 'CANCELLED'
export interface Lesson {
  id: string; startTime: string; endTime: string; status: Status;
  trainer: Trainer; service: Service; arena: Arena | null;
  bookings: { id: string; client: Client; horse: Horse | null; membership: MembershipSummary | null }[];
}
export interface MembershipSummary {
  type?: 'fixed_lessons' | 'deposit' | 'boarding'; title?: string; initialUnits?: number | string; remainingUnits?: number | string;
  validFrom?: string; validTo?: string; status?: 'active' | 'frozen' | 'expired' | 'exhausted';
  id: string; totalLessons: number; remainedLessons: number; validUntil: string; isActive?: boolean;
  pricingPlan?: { id: string; name: string } | null;
}
export interface ClientWithMemberships extends Client { memberships: MembershipSummary[] }
export interface ClubSchedule { openTime: string; closeTime: string; daysOfWeekOff: number[] }
export interface Workload { maxDailyMinutes: number; usedMinutes: number; remainingMinutes: number }
export interface DailyHorseWorkload {
  horseId: string; horseName: string; currentWorkloadMinutes: number; maxDailyWorkloadMinutes: number;
  status: 'AVAILABLE' | 'AT_LIMIT' | 'OVERLOADED' | 'UNAVAILABLE';
}
export interface BookingParticipantValues {
  clientId?: string; membershipId?: string; horseId?: string;
}
export interface BookingValues {
  participants: BookingParticipantValues[]; serviceId: string; trainerId: string; arenaId?: string; startTime: string; durationMinutes: number;
}
export const statuses: Record<Status, { background: string; text: string; event: string; label: string }> = {
  SCHEDULED: { background: '#EFECE8', text: '#3A2F2B', event: '#724C39', label: 'Запланировано' },
  COMPLETED: { background: '#EDF4EF', text: '#3E5F48', event: '#3E5F48', label: 'Проведено' },
  NO_SHOW: { background: '#FBF4E8', text: '#8C6527', event: '#8C6527', label: 'Неявка' },
  CANCELLED: { background: '#FBEFEF', text: '#8C3838', event: '#8C3838', label: 'Отменено' },
}
