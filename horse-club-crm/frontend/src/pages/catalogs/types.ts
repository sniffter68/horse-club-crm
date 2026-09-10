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
export interface TrainerValues { name: string; phone?: string; qualification?: string; maxDailyLoad: number; baseRate?: number }
export interface Trainer extends Omit<TrainerValues, 'baseRate' | 'phone' | 'qualification'> {
  id: string; baseRate?: string | number; phone: string | null; qualification: string | null;
}
export interface ServiceValues {
  name?: string; title: string; durationMinutes: number; maxCapacity: number;
  price?: number; cancellationWindowHours: number; allowMembership: boolean;
}
export interface Service extends Omit<ServiceValues, 'price'> { id: string; price?: string | number }
