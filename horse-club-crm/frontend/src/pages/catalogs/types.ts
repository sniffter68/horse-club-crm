export interface ClientValues {
  name?: string; firstName: string; lastName?: string; phone: string; email?: string | null;
  isRider: boolean; isPayer: boolean; preferences?: string; medicalNotes?: string;
}
export interface Client extends Omit<ClientValues, 'phone' | 'preferences' | 'medicalNotes'> {
  id: string; createdAt: string; phone: string | null; preferences: string | null; medicalNotes?: string | null;
}
export interface HorseValues {
  name: string; breed?: string; riderLevel?: string; maxDailyMinutes: number; minRestMinutes: number; isUnavailable: boolean;
}
export interface Horse extends Omit<HorseValues, 'breed' | 'riderLevel'> { id: string; breed: string | null; riderLevel: string | null }
export interface RelationPayment {
  id: string; amount: string | number; status: 'PENDING' | 'PAID' | 'REFUNDED' | 'CANCELLED';
  paidAt: string | null; createdAt: string; description?: string | null;
}
export interface RelationLesson {
  id: string; startTime: string; endTime: string; status: 'SCHEDULED' | 'COMPLETED' | 'NO_SHOW' | 'CANCELLED';
  service: { id: string; title: string; name: string };
  trainer: { id: string; name: string };
  arena: { id: string; name: string } | null;
}
export interface RelationBooking {
  id: string; attended: boolean; attendanceStatus: 'PENDING' | 'ATTENDED' | 'NO_SHOW';
  lesson: RelationLesson; payments: RelationPayment[]; membership: { id: string } | null;
}
export interface HorseDetails extends Horse {
  healthLogs: Array<{ id: string; type: 'VACCINATION' | 'FARRIER' | 'DEWORMING' | 'INSPECTION'; occurredAt: string; nextDueAt: string | null; notes: string | null }>;
  boardingContracts: Array<{ id: string; status: string; startsAt: string; endsAt: string | null; monthlyRate: string | number;
    client: { id: string; name: string; firstName: string; lastName: string }; stall: { id: string; name: string } | null; payments: RelationPayment[] }>;
  bookings: Array<RelationBooking & { client: { id: string; name: string; firstName: string; lastName: string } }>;
}
export interface TrainerValues { name: string; phone?: string; qualification?: string; maxDailyLoad: number; baseRate?: number }
export interface Trainer extends Omit<TrainerValues, 'baseRate' | 'phone' | 'qualification'> {
  id: string; baseRate?: string | number; phone: string | null; qualification: string | null;
}
export interface ServiceValues {
  name?: string; title: string; durationMinutes: number; maxCapacity: number;
  price?: number; cancellationWindowHours: number; allowMembership: boolean;
}
export interface Service extends Omit<ServiceValues, 'price'> { id: string; price?: string | number }
export interface ArenaValues { name: string; description?: string; capacity: number; isUnavailable: boolean }
export interface Arena extends Omit<ArenaValues, 'description'> { id: string; description: string | null; createdAt: string; updatedAt: string }
export interface StallValues { name: string; description?: string; isUnavailable: boolean }
export interface StallContractSummary {
  id: string; status: 'DRAFT' | 'ACTIVE' | 'SUSPENDED'; startsAt: string; endsAt: string | null;
  horse: { id: string; name: string };
  client: { id: string; name: string; firstName: string; lastName: string };
  payments?: RelationPayment[];
}
export interface Stall extends Omit<StallValues, 'description'> {
  id: string; description: string | null; createdAt: string; updatedAt: string; contracts?: StallContractSummary[];
}
