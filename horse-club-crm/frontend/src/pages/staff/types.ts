export type Staff = { id: string; userId: string; fullName: string; roleTitle: string; shiftRate: string | null; lessonRate: string | null; groupLessonRate: string | null; lessonPercentage: string | null; isActive: boolean }
export const shiftStatuses = { SCHEDULED: 'Запланирована', COMPLETED: 'Отработана', ABSENT: 'Неявка', SICK: 'Больничный' }
export type ShiftStatus = keyof typeof shiftStatuses
export const shiftColors = { SCHEDULED: 'blue', COMPLETED: 'green', ABSENT: 'red', SICK: 'orange' }
export type Shift = { id: string; staffId: string; date: string; startTime: string; endTime: string; status: ShiftStatus; notes?: string }
export type Payroll = { id?: string; updatedAt?: string; staffId: string; fullName: string; roleTitle: string; shiftsCount: number; shiftsTotal: string; lessonsCount: number; lessonsTotal: string; bonuses: string; penalties: string; totalAmount: string; isPaid: boolean; blocked: boolean; paidAt?: string; expenseId?: string }
export type PageData<T> = { data: T[]; total: number }
