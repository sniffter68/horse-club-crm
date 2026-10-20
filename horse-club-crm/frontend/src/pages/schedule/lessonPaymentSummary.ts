import type { LessonMoney } from './types'

export const rubles = (value: number | string | null | undefined) => `${Number(value ?? 0).toLocaleString('ru-RU', { maximumFractionDigits: 2 })} ₽`

export function lessonBalance(lesson: LessonMoney) {
  const cost = Number(lesson.cost ?? lesson.bookings?.filter(b => !b.membership && !b.membershipId).reduce((sum, b) => sum + Number(b.costAmount ?? lesson.service?.price ?? 0), 0) ?? 0)
  const prepayment = Number(lesson.prepaymentAmount ?? 0)
  const paid = Math.max(prepayment + Number(lesson.finalPaymentAmount ?? 0), lesson.bookings?.reduce((sum, b) => sum + (b.payments?.filter(p => p.status === 'PAID').reduce((v, p) => v + Number(p.amount), 0) ?? 0), 0) ?? 0)
  return { cost, prepayment, remaining: Math.max(0, Math.round((cost - paid) * 100) / 100) }
}

export function lessonPaymentSummary(lesson: LessonMoney): string {
  if (!lesson.bookings?.some(b => !b.membership && !b.membershipId)) return 'По абонементу'
  const { cost, prepayment, remaining } = lessonBalance(lesson)
  if (!remaining && (cost > 0 || lesson.paymentStatus === 'PAID')) return 'Оплачено'
  return prepayment > 0 || remaining < cost
    ? `Предоплата: ${rubles(prepayment)} / Остаток: ${rubles(remaining)}`
    : 'Не оплачено'
}

