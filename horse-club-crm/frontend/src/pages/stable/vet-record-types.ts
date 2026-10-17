export const recordTypes = { VACCINATION: 'Вакцинация', DEWORMING: 'Глистогон', BLOOD_TEST: 'Кровь', FARRIER: 'Ковка / расчистка', EXAMINATION: 'Осмотр', TREATMENT: 'Лечение', DENTAL: 'Стоматология' } as const
export type RecordType = keyof typeof recordTypes
export const healthStatuses = { HEALTHY: 'Здорова', TREATMENT: 'На лечении', QUARANTINE: 'Карантин', RETIRED: 'Выбыла / пенсия' } as const
export type HealthStatus = keyof typeof healthStatuses
export interface VetHorse { id: string; name: string; healthStatus: HealthStatus; quarantineUntil?: string | null; breed?: string; birthYear?: number; ownerType?: string }
export interface VetRecord {
  id: string; horseId: string; horse: VetHorse; type: RecordType; title: string; performedAt: string; nextDueDate?: string | null
  specialist: string; medication?: string | null; notes?: string | null; cost?: string | null; documentUrl?: string | null
  createdBy?: { email: string }; dueStatus?: 'overdue' | 'soon' | 'current' | 'none'
}
export interface VetSummary { overdue: VetRecord[]; next14Days: VetRecord[]; next30Days: VetRecord[]; thisMonth: VetRecord[]; restrictedHorses: VetHorse[] }
export const recordIntervals: Partial<Record<RecordType, number>> = { VACCINATION: 365, DEWORMING: 90, BLOOD_TEST: 180, FARRIER: 45, DENTAL: 365 }
export const recordTemplates: Partial<Record<RecordType, string[]>> = {
  VACCINATION: ['Грипп + столбняк', 'Сибирская язва', 'Бешенство', 'Ринопневмония', 'Дерматомикозы'],
  DEWORMING: ['Ивермектин (дегельминтизация)'], BLOOD_TEST: ['Исследование крови на САП / ИНАН', 'Случная болезнь', 'Бруцеллёз'],
  FARRIER: ['Плановая расчистка', 'Ковка передних копыт'], EXAMINATION: ['Плановый осмотр'], DENTAL: ['Пилка зубов'],
}
