import type { Lesson } from './types'

export function isLessonTrainerLocked(lesson: Pick<Lesson, 'status' | 'cost' | 'paymentStatus' | 'prepaymentAmount' | 'finalPaymentAmount' | 'bookings'>) {
  return lesson.status !== 'SCHEDULED' || ['PARTIALLY_PAID', 'PAID_BY_MEMBERSHIP'].includes(lesson.paymentStatus ?? '')
    || lesson.paymentStatus === 'PAID' && Number(lesson.cost ?? 0) > 0
    || Number(lesson.prepaymentAmount ?? 0) > 0 || Number(lesson.finalPaymentAmount ?? 0) > 0
    || lesson.bookings.some(booking => booking.isPaid || booking.payments?.some(payment => payment.status === 'PAID' && !payment.archivedAt))
}

