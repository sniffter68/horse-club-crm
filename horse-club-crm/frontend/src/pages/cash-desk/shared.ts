import { DateTime } from 'luxon'
import type { Payment } from '../payments/types'

export const currency = (value: string | number | null | undefined) => new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB' }).format(Number(value ?? 0))
export const cashTime = (value: string) => DateTime.fromISO(value).setZone('Europe/Moscow').setLocale('ru').toFormat('dd LLL HH:mm')
export interface CashShift { id: string; openedAt: string; startingCash: string }
export interface CashOperation extends Payment {
  cashGiven: string | null; cashChange: string | null; cashierId: string | null
  cashier: { email: string } | null; service: { name: string; title: string } | null; serviceType: string | null; notes: string | null
}
export interface CashSummary { totalCash: string; totalCard: string; totalRevenue: string; totalUnspecified?: string; operationsCount: number; operations: CashOperation[] }
export function periodRange(period: string, from?: string, to?: string) {
  const now = DateTime.now().setZone('Europe/Moscow')
  if (period === 'custom' && from && to) return { from: DateTime.fromISO(from, { zone: 'Europe/Moscow' }).startOf('day').toISO(), to: DateTime.fromISO(to, { zone: 'Europe/Moscow' }).plus({ days: 1 }).startOf('day').toISO() }
  const start = period === 'yesterday' ? now.minus({ days: 1 }).startOf('day') : now.startOf(period === 'week' ? 'week' : period === 'month' ? 'month' : 'day')
  return { from: start.toISO(), to: (period === 'yesterday' ? start.plus({ days: 1 }) : now.plus({ days: 1 }).startOf('day')).toISO() }
}
export function operationService(row: CashOperation) {
  return row.service?.title || row.service?.name || row.booking?.lesson?.service?.title || row.booking?.lesson?.service?.name || row.membership?.pricingPlan?.name || row.serviceType || 'Занятие / услуга'
}
