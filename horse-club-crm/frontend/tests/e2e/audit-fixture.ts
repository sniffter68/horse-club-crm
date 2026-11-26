import { test as base, expect, type Page } from '@playwright/test'

export const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
export const client = { id: uuid(1), name: 'Аудит Клиент', firstName: 'Аудит', lastName: 'Клиент', phone: '+79991234567', isRider: true, isPayer: true, membership: null, memberships: [], boardingContracts: [], bookings: [], payments: [] }
export const horse = { id: uuid(2), name: 'Аудит Валдай', sex: 'gelding', ownerType: 'club', status: 'active', isUnavailable: false, allowIndividual: true, allowGroup: false, allowWalk: false, allowSpecial: true, maxDailyWorkloadMinutes: 240, healthLogs: [], boardingContracts: [], bookings: [] }
export const trainer = { id: uuid(3), name: 'Аудит Тренер', fullName: 'Аудит Тренер', isActive: true, allowIndividual: true, allowGroup: false, allowWalk: false, allowSpecial: true }
export const service = { id: uuid(4), name: 'Аудит Прогулка', title: 'Аудит Прогулка', price: 1500, durationMinutes: 60, maxCapacity: 1, allowMembership: true, serviceDirection: 'allowWalk' }
export const employee = { id: uuid(5), userId: uuid(9), fullName: 'Аудит Администратор', roleTitle: 'Администратор', isActive: true, shifts: [], user: { email: 'audit@example.local', role: 'ADMIN', crmAccess: true } }
export interface AuditState {
  clients: typeof client[]
  main: number
  boarding: number
  mutations: { path: string; method: string; body: Record<string, unknown> }[]
  unexpected: string[]
  errors: string[]
}

export async function installAudit(page: Page, theme: string, role: 'ADMIN' | 'TRAINER' = 'ADMIN'): Promise<AuditState> {
  const state: AuditState = { clients: [client], main: 10000, boarding: 3000, mutations: [], unexpected: [], errors: [] }
  page.on('pageerror', e => state.errors.push(`pageerror: ${e.message}`))
  page.on('console', message => { if (message.type() === 'error') state.errors.push(`console: ${message.text()}`) })
  page.on('response', response => { if (response.status() >= 500) state.errors.push(`${response.status()} ${response.url()}`) })
  page.on('requestfailed', request => {
    // React effect cleanup and navigation deliberately cancel obsolete requests.
    if (request.failure()?.errorText !== 'net::ERR_ABORTED') state.errors.push(`requestfailed: ${request.url()} ${request.failure()?.errorText}`)
  })
  // External services are isolated; API responses are never replaced by a blanket success.
  await page.route('https://fonts.googleapis.com/**', route => route.fulfill({ contentType: 'text/css', body: '' }))
  await page.route('https://api.open-meteo.com/**', route => route.fulfill({ json: { current: { temperature_2m: 1, weather_code: 3 } } }))
  await page.clock.setFixedTime(new Date('2026-11-26T09:00:00+03:00'))
  await page.addInitScript(({ theme, role }) => {
    const original = console.error
    console.error = (...args: unknown[]) => original(...args, new Error('console.error origin').stack)
    localStorage.setItem('horsecrm.access_token', 'cookie-session')
    localStorage.setItem('horsecrm.role', role)
    localStorage.setItem('horsecrm.email', 'audit@example.local')
    localStorage.setItem('horsecrm.color_mode', theme)
  }, { theme, role })
  await page.route('**/api/**', async route => {
    const request = route.request(), url = new URL(request.url()), path = url.pathname.replace('/api/', '')
    const method = request.method()
    const list = (json: unknown[], total = json.length) => route.fulfill({ json, headers: { 'x-total-count': String(total) } })
    const reply = (json: unknown) => route.fulfill({ json })
    if (path === 'leads/events') return route.fulfill({ contentType: 'text/event-stream', body: ': heartbeat\n\n' })
    if (method !== 'GET') {
      const body = request.postDataJSON() as Record<string, unknown>
      state.mutations.push({ path, method, body })
      if (path === 'clients' && method === 'POST') {
        const created = { ...client, ...body, name: `${String(body.firstName)} ${String(body.lastName)}` }
        state.clients = [created]
        return reply(created)
      }
      if (path === 'memberships' && method === 'POST') {
        state.main += Number(body.totalPrice)
        return reply({ id: uuid(6), ...body, cashboxPosted: true })
      }
      state.unexpected.push(`${method} ${path}`)
      return route.fulfill({ status: 501, json: { message: `Unmocked mutation: ${path}` } })
    }
    if (path === 'settings/my-permissions') return reply({ role, modules: ['SCHEDULE', 'STABLES', 'VETERINARY', 'CASHBOX', 'STAFF_PAYROLL'].map(module => ({ module, isEnabled: true, accessLevel: role === 'ADMIN' || module === 'SCHEDULE' ? 'FULL' : 'HIDDEN' })) })
    if (path === 'settings/access/me') return reply({ role, userId: uuid(9), trainerId: role === 'TRAINER' ? trainer.id : null, permissions: { lessonCreateOwn: true, lessonCreateAny: role === 'ADMIN', horseReplaceOwn: true, horseReplaceAny: false, healthRead: role === 'ADMIN', healthWrite: role === 'ADMIN', financeRead: role === 'ADMIN', boardingAccess: role === 'ADMIN' } })
    if (path === 'settings/club-schedule') return reply({ openTime: '09:00', closeTime: '21:00', daysOfWeekOff: [], weekDays: Array.from({ length: 7 }, (_, i) => ({ dayOfWeek: i + 1, isWorkingDay: true, openTime: '09:00', closeTime: '21:00' })) })
    if (path === 'cashbox/summary') return reply({ mainBalance: state.main, boardingBalance: state.boarding, mainOperationsCount: 1, boardingOperationsCount: 1 })
    if (path === 'payments/boarding-cash') return reply({ total: state.boarding, cash: state.boarding, bank: 0, unspecified: 0 })
    if (path === 'vet/summary') return reply({ restrictedHorses: [], overdue: [], next14Days: [], next30Days: [], thisMonth: [] })
    if (path === 'workspace/admin-summary') return reply({ date: '2026-11-26', generatedAt: '2026-11-26T06:00:00Z', timeZone: 'Europe/Moscow', kpi: { lessonsToday: 0, activeRiders: state.clients.length, awaitingConfirmation: 0, newLeads: 0 }, today: [], week: [], unconfirmed: [], leadRequests: [], finance: null, actions: [] })
    if (path === 'workspace/trainer-board') return reply({ date: '2026-11-26', timeZone: 'Europe/Moscow', trainerId: trainer.id, trainers: [trainer], lessons: [], horses: [], openTime: '09:00', closeTime: '21:00' })
    if (path === 'finance/summary') return reply({ totalRevenue: '10000', totalCash: '7000', totalCard: '3000', totalMemberships: '1500', totalExpenses: '0', operations: [], operationsCount: 0, balanceCash: '7000', balanceCard: '3000', balanceTotal: '10000' })
    if (path === 'finance/monthly-closing/status') return reply({ closed: false })
    if (path === 'finance/journal' || path === 'finance/expenses' || path === 'boarding/expenses' || path === 'vet/records' || path === 'vet/events' || path.startsWith('staff/')) return reply({ data: [], total: 0 })
    if (path === 'staff') return reply({ data: [employee], total: 1 })
    if (path === 'payments/shifts/current') return reply(null)
    if (path === 'bookings/availability') return reply({ horseWorkloads: [{ horseId: horse.id, status: 'AVAILABLE', currentWorkloadMinutes: 0, maxDailyWorkloadMinutes: 240 }], arenaOccupancy: [] })
    if (path === `clients/${client.id}`) return reply(state.clients[0])
    if (path === `horses/${horse.id}`) return reply(horse)
    if (path === 'clients') return list(state.clients)
    if (path === 'horses') return list([horse])
    if (path === 'trainers') return list([trainer])
    if (path === 'services') return list([service])
    const emptyLists = ['memberships', 'pricing-plans', 'arenas', 'lessons', 'bookings', 'bookings/horse-issues', 'horses/workload', 'boarding-contracts', 'stalls', 'stable-buildings', 'stalls/map', 'stalls/assignment-horses', 'payments/shifts', 'payments', 'leads', 'users']
    if (emptyLists.includes(path)) return list([])
    state.unexpected.push(`${method} ${path}`)
    return route.fulfill({ status: 501, json: { message: `Unmocked endpoint: ${path}` } })
  })
  return state
}

export const test = base.extend<{ audit: AuditState; auditRole: 'ADMIN' | 'TRAINER' }>({
  auditRole: ['ADMIN', { option: true }],
  audit: [async ({ page, auditRole }, use, info) => {
    const state = await installAudit(page, String(info.project.use.colorScheme ?? 'light'), auditRole)
    await use(state)
    await info.attach('runtime-errors', { body: JSON.stringify(state, null, 2), contentType: 'application/json' })
    expect(state.unexpected, 'Every API request must have an explicit fixture').toEqual([])
    expect(state.errors, 'Runtime, console and HTTP 5xx errors').toEqual([])
  }, { auto: true }],
})
export { expect }
