import { DateTime } from 'luxon'

export type FinanceKpi = 'income' | 'cash' | 'bank' | 'memberships' | 'expenses'
export function financeJournalLink(kpi: FinanceKpi, range: { from: string | null; to: string | null }) {
  const params = new URLSearchParams({ period: 'custom', dateBasis: 'payment', from: range.from ? DateTime.fromISO(range.from, { zone: 'Europe/Moscow' }).toISODate()! : '', operation: kpi === 'expenses' ? 'EXPENSE' : 'INCOME', page: '1' })
  // Report ranges are half-open. The cash desk's custom picker expects inclusive calendar dates.
  if (range.to) {
    params.set('to', DateTime.fromISO(range.to, { zone: 'Europe/Moscow' }).minus({ days: 1 }).toISODate()!)
  }
  if (kpi === 'cash' || kpi === 'bank') params.set('method', kpi === 'cash' ? 'CASH' : 'BANK')
  if (kpi === 'memberships') params.set('source', 'MEMBERSHIP')
  return `/cash-desk?${params}#cash-journal`
}
