export type Staff = { shifts?: Array<{ id: string }>; user?: { vkId: string | null; role?: string; email?: string; trainerId?: string | null; crmAccess?: boolean }; id: string; userId: string; fullName: string; phone?: string | null; scheduleColor?: string | null; roleTitle: string; shiftRate: string | null; lessonRate: string | null; groupLessonRate: string | null; lessonPercentage: string | null; isActive: boolean }
export const shiftStatuses = { SCHEDULED: 'Запланирована', COMPLETED: 'Отработана', ABSENT: 'Неявка', SICK: 'Больничный' }
export type ShiftStatus = keyof typeof shiftStatuses
export const shiftColors = { SCHEDULED: 'blue', COMPLETED: 'green', ABSENT: 'red', SICK: 'orange' }
export type Shift = { id: string; staffId: string; date: string; startTime: string; endTime: string; status: ShiftStatus; notes?: string }
export type Payroll = { id?: string; updatedAt?: string; staffId: string; fullName: string; roleTitle: string; shiftsCount: number; shiftsTotal: string; lessonsCount: number; lessonsTotal: string; bonuses: string; penalties: string; totalAmount: string; isPaid: boolean; blocked: boolean; paidAt?: string; expenseId?: string }
export type PageData<T> = { data: T[]; total: number }
export type PaidPeriod = { id: string; staffId: string; periodStart: string; periodEnd: string; createdAt: string }
export type PayrollStatement = PaidPeriod & { staff: { fullName: string; roleTitle: string }; isPaid: boolean; totalAmount: string }
export const paidPeriodFor = (periods: PaidPeriod[], staffId: string, date: string) => periods.find(row => row.staffId === staffId && row.periodStart.slice(0, 10) <= date && row.periodEnd.slice(0, 10) >= date)

export const staffRoles: Record<string, string> = { ADMIN: 'Администратор', MANAGER: 'Менеджер', TRAINER: 'Тренер', GROOM: 'Конюх', VET: 'Ветеринар', OTHER: 'Другое', STABLE_WORKER: 'Сотрудник конюшни' }
