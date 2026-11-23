import type { Arena, Client, Horse, Service, Trainer } from '../catalogs/types'
export type Status = 'SCHEDULED' | 'COMPLETED' | 'NO_SHOW' | 'CANCELLED'
export interface LessonMoney {
  participantsCount?: number | null; pricePerPerson?: number | string | null;
  cost?: number | string | null; paymentStatus?: 'UNPAID' | 'PARTIALLY_PAID' | 'PAID' | 'PAID_BY_MEMBERSHIP';
  prepaymentAmount?: number | string | null; prepaymentMethod?: string | null;
  finalPaymentAmount?: number | string | null; finalPaymentMethod?: string | null;
  service?: { id?: string; name?: string; title?: string; price?: number | string };
  bookings?: { membership?: unknown; membershipId?: string | null; costAmount?: number | string; payments?: { status: string; amount: number | string }[] }[];
}
export interface Lesson extends LessonMoney {
  id: string; startTime: string; endTime: string; status: Status;
  trainer: Trainer; service: Service; arena: Arena | null;
  bookings: { id: string; client: Client; horse: Horse | null; membership: MembershipSummary | null; costAmount?: number | string; payments?: { status: string; amount: number | string }[] }[];
}
export interface MembershipSummary {
  deletedAt?: string | null; cancelledAt?: string | null;
  serviceId?: string | null;
  isShared?: boolean; ownerName?: string; ownerClientId?: string | null;
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
  participantsCount?: number; pricePerPerson?: number;
  cost?: number; prepaymentAmount?: number; prepaymentMethod?: 'CASH' | 'CARD';
  participants: BookingParticipantValues[]; serviceId: string; trainerId: string; arenaId?: string; startTime: string; durationMinutes: number;
}
export const statuses: Record<Status, { badge: string; event: string; label: string }> = {
  SCHEDULED: { badge: 'accent', event: 'var(--crm-saddle)', label: 'Запланировано' },
  COMPLETED: { badge: 'success', event: 'var(--crm-success)', label: 'Проведено' },
  NO_SHOW: { badge: 'warning', event: 'var(--crm-warning)', label: 'Неявка' },
  CANCELLED: { badge: 'danger', event: 'var(--crm-danger)', label: 'Отменено' },
}
