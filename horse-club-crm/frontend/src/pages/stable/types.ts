export const vetTypes = { shoeing: 'Ковка', vaccination: 'Прививки', deworming: 'Глисты', vet_check: 'Ветосмотр', dentist: 'Стоматолог' }
export const horseStatuses = { active: 'Доступна', rest: 'Отдых', sick: 'Болеет', quarantine: 'Карантин' }
export type VetType = keyof typeof vetTypes
export interface VetEvent {
  id: string; horseId: string; type: VetType; eventDate: string; nextDueDate: string | null;
  status: 'scheduled' | 'completed' | 'overdue'; performedBy: string | null; notes: string | null;
  horse: { id: string; name: string; status: string }
}
export const boardingServices = { feed_supplements: 'Подкормки', exerciser_machine: 'Шагалка', blanket_wash: 'Стирка попоны', training_rider: 'Работа берейтора' }
export interface BoardingExpense {
  id: string; amount: string; createdAt: string; description: string | null; billingMonth: string | null;
  boardingDailyLog: { serviceType: string; performedBy: string | null; performedAt: string; notes: string | null } | null
}
