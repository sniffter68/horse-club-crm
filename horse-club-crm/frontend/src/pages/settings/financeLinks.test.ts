import { expect, it } from 'vitest'
import { financeJournalLink, type FinanceKpi } from './financeLinks'

it.each(['income', 'cash', 'bank', 'memberships', 'expenses'] satisfies FinanceKpi[])('links %s to matching journal filters and inclusive Moscow dates', kpi => {
  const link = new URL(financeJournalLink(kpi, { from: '2026-11-22T21:00:00Z', to: '2026-11-29T21:00:00Z' }), 'http://crm.local')
  expect(link.pathname).toBe('/cash-desk')
  expect(link.searchParams.get('from')).toBe('2026-11-23')
  expect(link.searchParams.get('to')).toBe('2026-11-29')
  expect(link.searchParams.get('operation')).toBe(kpi === 'expenses' ? 'EXPENSE' : 'INCOME')
  expect(link.searchParams.get('method')).toBe(kpi === 'cash' ? 'CASH' : kpi === 'bank' ? 'BANK' : null)
  expect(link.searchParams.get('source')).toBe(kpi === 'memberships' ? 'MEMBERSHIP' : null)
})
