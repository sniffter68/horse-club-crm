export interface Person { id: string; name: string }
export interface BoardLesson {
  id: string; trainerId: string; startTime: string; endTime: string
  status: 'SCHEDULED' | 'COMPLETED' | 'NO_SHOW' | 'CANCELLED'
  trainer: Person; arena: Person | null; trainerNote: string | null; isOwn?: boolean; canManage?: boolean
  bookings: { id: string; clientConfirmed: boolean; client: Person | null; horse: Person | null }[]
}
export interface TrainerBoard {
  date: string; timeZone: string; trainerId: string | null; trainers: Person[]
  openTime: string; closeTime: string; lessons: BoardLesson[]
  horses: (Person & { lessonId: string; trainerId: string; startTime: string; endTime: string })[]
}
export interface AdminSummary {
  leadRequests: import('../dashboard/PendingLeads').PendingLead[]
  date: string; generatedAt: string; timeZone: string
  kpi: { lessonsToday: number; activeRiders: number; awaitingConfirmation: number; newLeads: number }
  today: BoardLesson[]; week: BoardLesson[]; unconfirmed: BoardLesson[]
  finance: null | { accrued: string; paid: string; debt: string; mainBalance: number; boardingBalance: number; recognizedMembershipRevenue: string }
  actions: { id: string; action: string; actorName: string; createdAt: string }[]
}
