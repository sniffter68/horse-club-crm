import type { AdminSummary } from '../src/pages/workspace/types'

export function workspaceSummary(overrides: Partial<AdminSummary> = {}): AdminSummary {
  return {
    date: '2026-10-20', generatedAt: '2026-10-20T08:00:00Z', timeZone: 'Europe/Moscow',
    kpi: { lessonsToday: 0, activeRiders: 0, awaitingConfirmation: 0, newLeads: 0 },
    today: [], week: [], unconfirmed: [], leadRequests: [], finance: null, actions: [],
    ...overrides,
  }
}
