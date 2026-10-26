import { test, expect, type Page, type Locator } from './fixtures'
import { checkBookingDatePicker } from './bookingDatePicker'

for (const width of [1440, 390]) test(`schedule trainer slot opens shared drawer at ${width}px`, async ({ page }) => {
  await setup(page)
  await page.setViewportSize({ width, height: 900 })
  await page.route('**/api/settings/club-schedule', route => route.fulfill({ json: { openTime: '09:00', closeTime: '21:00', daysOfWeekOff: [] } }))
  await page.route('**/api/bookings/horse-issues?*', route => route.fulfill({ json: [] }))
  await page.route('**/api/bookings?*', route => route.fulfill({ json: [] }))
  await page.route('**/api/horses/workload?*', route => route.fulfill({ json: [] }))
  let reads = 0
  const rows: Record<string, unknown>[] = []
  await page.route('**/api/lessons?*', route => { reads++; return route.fulfill({ json: rows }) })
  await page.goto('/schedule')
  await page.getByRole('combobox', { name: 'Группировка расписания' }).focus()
  await page.getByRole('combobox', { name: 'Группировка расписания' }).press('ArrowDown')
  await page.getByText('По тренерам', { exact: true }).click()
  await page.getByRole('button', { name: 'Забронировать: Мария Волкова, 11:00', exact: true }).click()
  const drawer = page.getByRole('dialog', { name: 'Записать на тренировку', exact: true })
  await expect(drawer).toBeVisible()
  await expect(drawer.getByRole('textbox', { name: 'Выберите дату' })).toHaveValue('20.10.2026 11:00')
  await expect(resourceSelection(drawer, 'Тренер')).toHaveText('Мария Волкова')
  await drawer.getByRole('button', { name: 'Записать на тренировку', exact: true }).click()
  await expect(drawer.getByText('Заполните поле').first()).toBeVisible()
  for (const [label, value] of [['Клиент', 'Анна Орлова'], ['Услуга', 'Выездка'], ['Лошадь', 'Валдай']]) await choose(page, drawer, label, value)
  let fail = true
  await page.route('**/api/lessons', route => {
    expect(route.request().postDataJSON()).toMatchObject({ trainerId: '00000003-1111-4111-8111-111111111111', startTime: '2026-10-20T08:00:00.000Z' })
    if (fail) return route.fulfill({ status: 409, json: { message: 'Слот занят' } })
    rows.push({ id: 'created', startTime: '2026-10-20T08:00:00Z', endTime: '2026-10-20T09:00:00Z', status: 'SCHEDULED',
      trainer: { id: '00000003-1111-4111-8111-111111111111', name: 'Мария Волкова' }, service: { name: 'Выездка' },
      bookings: [{ id: 'booking', client: { name: 'Анна Орлова' }, horse: { id: '00000002-1111-4111-8111-111111111111', name: 'Валдай' } }] })
    return route.fulfill({ status: 201, json: rows[0] })
  })
  await drawer.getByRole('button', { name: 'Записать на тренировку', exact: true }).click()
  await expect(drawer.getByText('Слот занят')).toBeVisible()
  await expect(resourceSelection(drawer, 'Тренер')).toHaveText('Мария Волкова')
  fail = false
  const before = reads
  await drawer.getByRole('button', { name: 'Записать на тренировку', exact: true }).click()
  await expect(drawer).not.toBeVisible()
  await expect.poll(() => reads).toBeGreaterThan(before)
  await expect(page.locator('.resource-booking')).toContainText('Анна Орлова')
  await page.getByRole('button', { name: 'Записать на тренировку', exact: true }).click()
  await expect(drawer).toBeVisible()
  await expect(drawer.getByRole('combobox', { name: 'Клиент', exact: true })).toHaveValue('')
  await drawer.getByRole('button', { name: 'Закрыть', exact: true }).click()
  await page.getByRole('combobox', { name: 'Группировка расписания' }).focus()
  await page.getByRole('combobox', { name: 'Группировка расписания' }).press('ArrowDown')
  await page.getByText('По локациям', { exact: true }).click()
  await page.getByRole('button', { name: 'Забронировать: Манеж, 12:30', exact: true }).click()
  await expect(drawer.getByRole('textbox', { name: 'Выберите дату' })).toHaveValue('20.10.2026 12:30')
  await expect(drawer.locator('.ant-form-item').filter({ hasText: 'Манеж / локация' }).locator('.ant-select-selection-item')).toHaveText('Манеж')
  await page.screenshot({ path: `test-results/unified-booking-${width}.png` })
  if (width === 1440) {
    await drawer.getByRole('button', { name: 'Закрыть', exact: true }).click()
    await page.getByRole('combobox', { name: 'Группировка расписания' }).focus()
    await page.getByRole('combobox', { name: 'Группировка расписания' }).press('ArrowDown')
    await page.getByText('Календарь', { exact: true }).click()
    const slot = page.locator('.fc-timegrid-slot-lane[data-time="13:00:00"]')
    await slot.scrollIntoViewIfNeeded()
    const column = await page.locator('.fc-timegrid-col[data-date="2026-10-20"]').boundingBox()
    const time = await slot.boundingBox()
    if (!column || !time) throw new Error('Calendar slot is not visible')
    await page.mouse.click(column.x + column.width / 2, time.y + time.height / 2)
    await expect(drawer).toBeVisible()
    await expect(drawer.getByRole('textbox', { name: 'Выберите дату' })).toHaveValue('20.10.2026 13:00')
  }
})

for (const width of [1440, 390]) test(`dashboard date footer confirms Moscow time at ${width}px`, async ({ page }) => {
  await setup(page)
  await page.setViewportSize({ width, height: 650 })
  await page.goto('/')
  await page.getByRole('button', { name: '+ Записать на тренировку', exact: true }).click()
  const drawer = page.getByRole('dialog', { name: 'Записать на тренировку', exact: true })
  await checkBookingDatePicker(page, drawer, 'Дата и время (Москва)', '20.10.2026 11:00')
  for (const [label, value] of [['Клиент', 'Анна Орлова'], ['Услуга', 'Выездка'], ['Тренер', 'Мария Волкова'], ['Лошадь', 'Валдай']]) {
    await choose(page, drawer, label, value)
  }
  await page.route('**/api/lessons', async route => {
    expect(route.request().postDataJSON().startTime).toBe('2026-10-20T08:00:00.000Z')
    await route.fulfill({ status: 201, json: { id: 'confirmed-time' } })
  })
  await drawer.getByRole('button', { name: 'Записать на тренировку', exact: true }).click()
  await expect(drawer).not.toBeVisible()
})

test.use({ timezoneId: 'America/New_York' })
test.setTimeout(45000)
const modules = ['SCHEDULE', 'CASHBOX', 'STABLES', 'VETERINARY', 'STAFF_PAYROLL']
const client = { id: '00000001-1111-4111-8111-111111111111', name: 'Анна Орлова', phone: '+79991234567' }

for (const width of [1440, 390]) test(`cash card opens matching club balances without an open shift at ${width}px`, async ({ page }) => {
  await setup(page)
  await page.setViewportSize({ width, height: 900 })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.route('**/api/payments/shifts/current', route => route.fulfill({ json: null }))
  await page.route('**/api/finance/expenses?*', route => route.fulfill({ json: { data: [], total: 0 } }))
  let fail = false
  await page.route('**/api/finance/summary?*', route => fail
    ? route.fulfill({ status: 500, json: { message: 'Повторите загрузку' } })
    : route.fulfill({ json: { balanceCash: '1000', balanceCard: '2000', balanceTotal: '3000',
      totalCash: '0', totalCard: '0', totalRevenue: '0', totalExpenses: '0', totalExpensesCash: '0', totalExpensesCard: '0',
      netTotal: '0', operationsCount: 0, operations: [] } }))
  await page.goto('/')
  const link = page.getByRole('link', { name: 'Баланс кассы — открыть кассу' })
  await expect(link).toContainText(/1\s*000,00/)
  await expect(link).toContainText(/2\s*000,00/)
  await link.hover()
  await expect(link).toHaveCSS('cursor', 'pointer')
  if (width === 1440) { await link.focus(); await link.press('Enter') }
  else await link.click()
  await expect(page).toHaveURL(/\/cash-desk$/)
  const cash = page.locator('.kpi-card').filter({ hasText: 'Остаток в кассе (наличные)' })
  const bank = page.locator('.kpi-card').filter({ hasText: 'Остаток на счете (безнал)' })
  for (const period of ['Сегодня', 'Вчера', 'Текущая смена', 'Выбрать даты']) {
    await page.getByText(period, { exact: true }).click()
    await expect(page.getByRole('button', { name: 'Обновить', exact: true })).not.toHaveClass(/ant-btn-loading/)
    await expect(cash).toContainText(/1\s*000,00/)
    await expect(bank).toContainText(/2\s*000,00/)
  }
  await expect(page.getByText('Откройте смену, чтобы учитывать её платежи отдельно')).not.toBeVisible()
  await page.getByText('Текущая смена', { exact: true }).click()
  await expect(page.getByRole('button', { name: 'Обновить', exact: true })).not.toHaveClass(/ant-btn-loading/)
  await expect(page.getByText('Откройте смену, чтобы учитывать её платежи отдельно')).toBeVisible()
  await expect(page.getByText('За выбранный период платежей нет', { exact: true })).toBeVisible()
  await page.screenshot({ path: `test-results/cash-balance-no-shift-${width}.png` })
  fail = true
  await page.getByRole('button', { name: 'Обновить', exact: true }).click()
  await expect(page.getByText('Не удалось загрузить кассу')).toBeVisible()
  await expect(cash).toContainText('—')
  fail = false
  await page.getByRole('button', { name: 'Обновить', exact: true }).click()
  await expect(cash).toContainText(/1\s*000,00/)
});

async function setup(page: Page, role = 'ADMIN') {
  await page.clock.setFixedTime(new Date('2026-10-20T08:00:00Z'))
  await page.addInitScript(role => {
    localStorage.setItem('horsecrm.access_token', 'cookie-session')
    localStorage.setItem('horsecrm.role', role)
    localStorage.setItem('horsecrm.email', 'admin@example.com')
  }, role)
  const state = { lessons: 1, cash: 1000, completed: 0, failure: false, calls: 0 }
  await page.route('**/api/dashboard/summary', route => route.fulfill({ json: {
    generatedAt: '2026-10-20T08:00:00Z', workDay: { date: '2026-10-20', openAt: '2026-10-20T06:00:00Z', closeAt: '2026-10-20T18:00:00Z', timeZone: 'Europe/Moscow' },
    alerts: [], horseWorkloads: [], leadRequests: [], kpi: { lessonsTotal: state.lessons, lessonsCompleted: state.completed, newLeads: 0, activeMemberships: 0 },
    todayLessons: { total: state.lessons, completed: state.completed, cancelled: 0 }, cashboxSummary: { cash: String(state.cash), card: '2000', revenueToday: '500', expensesToday: '0' },
    horsesStatus: { total: 3, healthy: 1, treatment: 1, quarantine: 1 }, activeShifts: 1, onDutyStaff: [{ id: 'shift', staffId: 'staff', fullName: 'Мария Волкова', roleTitle: 'Тренер', startTime: '08:00', endTime: '20:00', status: 'SCHEDULED' }], pendingVetAlerts: 2,
    upcomingLessons: state.completed ? [] : [{ id: '00000007-1111-4111-8111-111111111111', startTime: '2026-10-20T09:00:00Z', endTime: '2026-10-20T10:00:00Z', trainer: { name: 'Мария Волкова' }, service: { name: 'Выездка', title: 'Индивидуальная тренировка' }, bookings: [{ client, horse: { name: 'Валдай' } }] }],
  } }))
  for (const [resource, rows] of Object.entries({ clients: [client], horses: [{ id: '00000002-1111-4111-8111-111111111111', name: 'Валдай', status: 'active', healthStatus: 'HEALTHY' }], trainers: [{ id: '00000003-1111-4111-8111-111111111111', name: 'Мария Волкова', isActive: true }], arenas: [{ id: '00000005-1111-4111-8111-111111111111', name: 'Манеж', isActive: true }], services: [{ id: '00000004-1111-4111-8111-111111111111', name: 'Выездка', title: 'Выездка', durationMinutes: 60, price: '500' }] })) {
    await page.route(`**/api/${resource}?*`, route => route.fulfill({ json: rows, headers: { 'x-total-count': String(rows.length) } }))
  }
  await page.route('**/api/clients/*', route => route.fulfill({ json: { ...client, id: new URL(route.request().url()).pathname.split('/').at(-1), memberships: [] } }))
  await page.route('**/api/bookings/availability?*', route => route.fulfill({ json: { horseWorkloads: [{ horseId: '00000002-1111-4111-8111-111111111111', currentWorkloadMinutes: 0, maxDailyWorkloadMinutes: 240, status: 'AVAILABLE' }], arenaOccupancy: [] } }))
  await page.route('**/api/payments/cash-desk/options/*', route => route.fulfill({ json: { bookings: [], memberships: [] } }))
  await page.route('**/api/staff?*', route => route.fulfill({ json: { data: [{ id: 'staff', userId: 'user', fullName: 'Мария Волкова', roleTitle: 'Тренер', isActive: true }], total: 1 } }))
  await page.route('**/api/boarding-contracts/availability?*', route => route.fulfill({ json: { horses: [{ id: '00000002-1111-4111-8111-111111111111', name: 'Валдай' }], stalls: [{ id: 'stall', name: 'Денник 1' }] } }))
  await page.route('**/api/lessons', route => {
    state.calls++
    if (state.failure) return route.fulfill({ status: 409, json: { message: 'Тренер уже занят' } })
    expect(route.request().postDataJSON()).toMatchObject({ clientId: '00000001-1111-4111-8111-111111111111', horseId: '00000002-1111-4111-8111-111111111111', trainerId: '00000003-1111-4111-8111-111111111111', serviceId: '00000004-1111-4111-8111-111111111111', startTime: '2026-10-20T09:00:00.000Z' })
    state.lessons++; return route.fulfill({ status: 201, json: { id: 'new-lesson' } })
  })
  await page.route('**/api/payments/cash-desk', route => {
    expect(route.request().postDataJSON()).toMatchObject({ clientId: '00000001-1111-4111-8111-111111111111', amount: 500, method: 'CASH', cashGiven: 500 })
    state.cash += 500; return route.fulfill({ status: 201, json: { method: 'CASH', cashChange: '0' } })
  })
  return state
}

async function choose(page: Page, drawer: Locator, label: string, value: string) {
  const input = drawer.getByRole('combobox', { name: label, exact: true })
  await input.scrollIntoViewIfNeeded()
  await input.focus()
  await input.fill(value)
  await page.locator('.ant-select-dropdown:visible .ant-select-item-option').filter({ hasText: value }).first().click()
  await expect(page.locator('.ant-select-dropdown:visible')).toHaveCount(0)
}
async function lesson(page: Page) {
  await page.getByRole('button', { name: '+ Записать на тренировку', exact: true }).click()
  const drawer = page.getByRole('dialog', { name: 'Записать на тренировку', exact: true })
  await expect(drawer).toBeVisible()
  await choose(page, drawer, 'Клиент', 'Анна Орлова')
  await choose(page, drawer, 'Услуга', 'Выездка')
  await choose(page, drawer, 'Тренер', 'Мария Волкова')
  await choose(page, drawer, 'Лошадь', 'Валдай')
  return drawer
}

async function preferenceSetup(page: Page) {
  await setup(page)
  const trainers = [3, 8].map((n, i) => ({ id: `0000000${n}-1111-4111-8111-111111111111`, name: i ? 'Иван Петров' : 'Мария Волкова', isActive: true }))
  const horses = [2, 9].map((n, i) => ({ id: `0000000${n}-1111-4111-8111-111111111111`, name: i ? 'Алмаз' : 'Валдай', status: 'active', healthStatus: 'HEALTHY' }))
  const clients = [client, { ...client, id: '00000010-1111-4111-8111-111111111111', name: 'Ольга Соколова' }, { ...client, id: '00000011-1111-4111-8111-111111111111', name: 'Клиент без предпочтений' }].map((row, i) => ({ ...row, preferredTrainerId: trainers[i]?.id ?? null, preferredHorseId: horses[i]?.id ?? null, memberships: [] }))
  for (const [resource, rows] of Object.entries({ clients, horses, trainers })) {
    await page.route(`**/api/${resource}?*`, route => route.fulfill({ json: rows, headers: { 'x-total-count': String(rows.length) } }))
  }
  await page.route('**/api/clients/*', route => route.fulfill({ json: clients.find(row => route.request().url().endsWith(row.id)) }))
  await page.route('**/api/bookings/availability?*', route => route.fulfill({ json: { horseWorkloads: horses.map(row => ({ horseId: row.id, currentWorkloadMinutes: 0, maxDailyWorkloadMinutes: 240, status: 'AVAILABLE' })), arenaOccupancy: [] } }))
  await page.goto('/')
  await page.getByRole('button', { name: '+ Записать на тренировку', exact: true }).click()
  return { drawer: page.getByRole('dialog', { name: 'Записать на тренировку', exact: true }), clients, horses, trainers }
}

function resourceSelection(drawer: Locator, label: string) {
  return drawer.getByRole('combobox', { name: label, exact: true }).locator('xpath=ancestor::div[contains(@class,"ant-select-selector")]').locator('.ant-select-selection-item')
}

for (const width of [1440, 390]) test(`dashboard booking applies client defaults and preserves manual changes at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 900 })
  const { drawer } = await preferenceSetup(page)
  await choose(page, drawer, 'Клиент', 'Анна Орлова')
  await expect(resourceSelection(drawer, 'Тренер')).toHaveText('Мария Волкова')
  await expect(resourceSelection(drawer, 'Лошадь')).toHaveText('Валдай')
  await page.screenshot({ path: `test-results/dashboard-booking-defaults-${width}.png` })
  await choose(page, drawer, 'Клиент', 'Ольга Соколова')
  await expect(resourceSelection(drawer, 'Тренер')).toHaveText('Иван Петров')
  await expect(resourceSelection(drawer, 'Лошадь')).toHaveText('Алмаз')
  await choose(page, drawer, 'Клиент', 'Клиент без предпочтений')
  for (const label of ['Тренер', 'Лошадь']) await expect(resourceSelection(drawer, label)).toHaveCount(0)
  await choose(page, drawer, 'Клиент', 'Анна Орлова')
  await expect(resourceSelection(drawer, 'Лошадь')).toHaveText('Валдай')
  await choose(page, drawer, 'Тренер', 'Иван Петров')
  await choose(page, drawer, 'Лошадь', 'Алмаз')
  await choose(page, drawer, 'Клиент', 'Клиент без предпочтений')
  await expect(resourceSelection(drawer, 'Тренер')).toHaveText('Иван Петров')
  await expect(resourceSelection(drawer, 'Лошадь')).toHaveText('Алмаз')
  await choose(page, drawer, 'Клиент', 'Анна Орлова')
  await expect(resourceSelection(drawer, 'Тренер')).toHaveText('Иван Петров')
  await expect(resourceSelection(drawer, 'Лошадь')).toHaveText('Алмаз')
  await drawer.getByRole('combobox', { name: 'Тренер', exact: true }).focus()
  await page.keyboard.press('ArrowDown')
  await expect(page.locator('.ant-select-dropdown:visible')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(drawer).toBeVisible()
  await choose(page, drawer, 'Услуга', 'Выездка')
  const saved = page.waitForRequest(request => request.url().endsWith('/api/lessons') && request.method() === 'POST')
  await page.route('**/api/lessons', route => route.fulfill({ status: 201, json: { id: 'saved' } }))
  await drawer.getByRole('button', { name: 'Записать на тренировку', exact: true }).click()
  expect((await saved).postDataJSON()).toMatchObject({ trainerId: '00000008-1111-4111-8111-111111111111', horseId: '00000009-1111-4111-8111-111111111111' })
  await expect(drawer).not.toBeVisible()
})

test('dashboard delayed preferences preserve manual resources', async ({ page }) => {
  const { drawer, clients } = await preferenceSetup(page)
  let release!: () => void
  const gate = new Promise<void>(resolve => { release = resolve })
  await page.route(`**/api/clients/${clients[0].id}`, async route => { await gate; await route.fulfill({ json: clients[0] }) })
  await choose(page, drawer, 'Клиент', 'Анна Орлова')
  await choose(page, drawer, 'Тренер', 'Иван Петров')
  await choose(page, drawer, 'Лошадь', 'Алмаз')
  const response = page.waitForResponse(`**/api/clients/${clients[0].id}`)
  release()
  await (await response).finished()
  await expect(resourceSelection(drawer, 'Тренер')).toHaveText('Иван Петров')
  await expect(resourceSelection(drawer, 'Лошадь')).toHaveText('Алмаз')
  const horseSelect = drawer.getByRole('combobox', { name: 'Лошадь', exact: true }).locator('xpath=ancestor::div[contains(@class,"ant-select") and not(contains(@class,"ant-select-selector"))][1]')
  await horseSelect.hover()
  await horseSelect.locator('.ant-select-clear').click()
  await choose(page, drawer, 'Клиент', 'Клиент без предпочтений')
  await expect(resourceSelection(drawer, 'Тренер')).toHaveText('Иван Петров')
  await expect(resourceSelection(drawer, 'Лошадь')).toHaveCount(0)
  await choose(page, drawer, 'Клиент', 'Ольга Соколова')
  await expect(resourceSelection(drawer, 'Лошадь')).toHaveCount(0)
})

test('dashboard ignores preferences from a previously selected client', async ({ page }) => {
  const { drawer, clients } = await preferenceSetup(page)
  let release!: () => void
  const gate = new Promise<void>(resolve => { release = resolve })
  await page.route(`**/api/clients/${clients[0].id}`, async route => { await gate; await route.fulfill({ json: clients[0] }) })
  const requested = page.waitForRequest(`**/api/clients/${clients[0].id}`)
  await choose(page, drawer, 'Клиент', 'Анна Орлова')
  await requested
  await choose(page, drawer, 'Клиент', 'Ольга Соколова')
  await expect(resourceSelection(drawer, 'Тренер')).toHaveText('Иван Петров')
  await expect(resourceSelection(drawer, 'Лошадь')).toHaveText('Алмаз')
  release()
  await choose(page, drawer, 'Услуга', 'Выездка')
  await expect(resourceSelection(drawer, 'Тренер')).toHaveText('Иван Петров')
  await expect(resourceSelection(drawer, 'Лошадь')).toHaveText('Алмаз')
})

test('dashboard skips inactive preferences and retries failed client details', async ({ page }) => {
  const { drawer, clients, trainers, horses } = await preferenceSetup(page)
  let fail = true
  await page.route(`**/api/clients/${clients[0].id}`, route => route.fulfill(fail ? { status: 503, json: { message: 'Не удалось загрузить предпочтения' } } : { json: clients[0] }))
  await page.route('**/api/trainers?*', route => route.fulfill({ json: trainers.map(row => ({ ...row, isActive: false })) }))
  await page.route('**/api/horses?*', route => route.fulfill({ json: horses.map(row => ({ ...row, healthStatus: 'TREATMENT' })) }))
  await choose(page, drawer, 'Клиент', 'Анна Орлова')
  await expect(drawer.getByRole('alert')).toContainText('Не удалось загрузить предпочтения')
  fail = false
  await drawer.getByRole('button', { name: 'Повторить', exact: true }).click()
  await expect(drawer.getByRole('alert')).toHaveCount(0)
  for (const label of ['Тренер', 'Лошадь']) await expect(resourceSelection(drawer, label)).toHaveCount(0)
})

for (const width of [1440, 390]) test(`creates a guest inside lesson drawer and retains lesson fields at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 900 })
  await setup(page)
  const posts: unknown[] = []
  await page.route('**/api/clients/quick', route => {
    posts.push(route.request().postDataJSON())
    return route.fulfill({ status: 201, json: { id: '00000006-1111-4111-8111-111111111111', name: 'Гость клуба', clientType: 'ONE_TIME', phone: null } })
  })
  let saved: Record<string, unknown> | undefined
  await page.route('**/api/lessons', route => {
    saved = route.request().postDataJSON()
    return route.fulfill({ status: 201, json: { id: 'new-lesson' } })
  })
  await page.goto('/')
  const drawer = await lesson(page)
  const client = drawer.getByRole('combobox', { name: 'Клиент', exact: true })
  await client.fill('Гость клуба')
  await page.getByRole('button', { name: '⚡ Разовый гость', exact: true }).click()
  const create = page.getByRole('dialog', { name: 'Разовый гость', exact: true })
  await expect(create.getByRole('textbox', { name: 'Имя', exact: true })).toHaveValue('Гость клуба')
  await create.getByRole('button', { name: 'Создать и выбрать', exact: true }).click()
  await expect(create).not.toBeVisible()
  await expect(drawer).toContainText('Гость клуба')
  await expect(drawer).toContainText('Разовый')
  await expect(drawer).toContainText('Выездка')
  await drawer.getByRole('button', { name: 'Записать на тренировку', exact: true }).click()
  await expect(drawer).not.toBeVisible()
  expect(posts).toEqual([{ name: 'Гость клуба', isOneTime: true }])
  expect(saved).toMatchObject({ clientId: '00000006-1111-4111-8111-111111111111', horseId: '00000002-1111-4111-8111-111111111111', trainerId: '00000003-1111-4111-8111-111111111111', serviceId: '00000004-1111-4111-8111-111111111111' })
})

test('admin quick actions create a lesson in a right drawer and refresh the day counter', async ({ page }) => {
  const state = await setup(page)
  await page.goto('/')
  await expect(page.getByRole('region', { name: 'Быстрые действия' }).getByRole('button')).toHaveCount(6)
  const drawer = await lesson(page)
  const bounds = await drawer.boundingBox()
  expect(bounds!.x + bounds!.width).toBeCloseTo(page.viewportSize()!.width, 0)
  await drawer.getByRole('button', { name: 'Записать на тренировку', exact: true }).click()
  await expect(drawer).not.toBeVisible()
  await expect(page.locator('.dashboard-day-card--lessons')).toContainText('/ 2')
  expect(state.calls).toBe(1)
})

test('cash payment closes the drawer and refreshes balance without navigation', async ({ page }) => {
  await setup(page); await page.goto('/')
  await page.getByRole('button', { name: '+ Принять оплату', exact: true }).click()
  const drawer = page.getByRole('dialog', { name: 'Принять оплату / Касса', exact: true })
  await choose(page, drawer, 'Клиент', 'Анна Орлова')
  await choose(page, drawer, 'Услуга / занятие / абонемент', 'Выездка')
  await drawer.getByLabel('Внесено клиентом, ₽', { exact: true }).fill('500')
  await drawer.getByRole('button', { name: 'Провести платёж' }).click()
  await expect(drawer).not.toBeVisible()
  await expect(page.getByTestId('dashboard-cash')).toContainText(/1\s?500/)
  await expect(page).toHaveURL(/\/$/)
})

test('failed lesson save preserves the form, supports retry, and dirty close asks before discarding', async ({ page }) => {
  const state = await setup(page); state.failure = true; await page.goto('/')
  const drawer = await lesson(page)
  await drawer.getByRole('button', { name: 'Записать на тренировку', exact: true }).click()
  await expect(drawer.getByRole('alert')).toContainText('Тренер уже занят')
  await expect(drawer.getByRole('combobox', { name: 'Клиент', exact: true })).toHaveValue('')
  await drawer.getByRole('button', { name: 'Закрыть', exact: true }).click()
  const confirm = page.getByRole('dialog', { name: 'Закрыть без сохранения?' })
  await expect(confirm).toBeVisible()
  await confirm.getByRole('button', { name: 'Продолжить заполнение' }).click()
  state.failure = false
  await drawer.getByRole('button', { name: 'Записать на тренировку', exact: true }).click()
  await expect(drawer).not.toBeVisible()
})

for (const policy of ['disabled', 'hidden', 'read-only']) test(`${policy} modules hide mutations; hidden/disabled modules hide sensitive KPIs`, async ({ page }) => {
  await setup(page, 'MANAGER')
  await page.route('**/api/settings/my-permissions*', route => route.fulfill({ json: { role: 'MANAGER', modules: modules.map(module => ({ module, isEnabled: policy !== 'disabled', accessLevel: policy === 'hidden' ? 'HIDDEN' : policy === 'read-only' ? 'READ_ONLY' : 'FULL' })) } }))
  await page.goto('/')
  await expect(page.getByRole('button', { name: '+ Принять оплату' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: '+ Заселить лошадь' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Ветпроцедура', exact: true })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Завершено', exact: true })).toHaveCount(0)
  if (policy !== 'read-only') await expect(page.getByTestId('dashboard-cash')).toHaveCount(0)
  else await expect(page.getByTestId('dashboard-cash')).toBeVisible()
})

for (const day of ['today', 'yesterday', 'tomorrow']) test(`expense drawer validates ${day} by Moscow day across timezones`, async ({ page }) => {
  await setup(page)
  // It is already October 20 in Moscow, but still October 19 in UTC and New York.
  await page.clock.setFixedTime(new Date('2026-10-19T21:05:00Z'))
  const posts: Record<string, unknown>[] = []
  await page.route('**/api/finance/expenses', route => {
    posts.push(route.request().postDataJSON())
    return route.fulfill({ status: 201, json: { id: 'expense', ...posts.at(-1) } })
  })
  await page.goto('/')
  await page.getByRole('button', { name: '− Внести расход', exact: true }).click()
  const drawer = page.getByRole('dialog', { name: 'Внесение расхода', exact: true })
  const date = drawer.getByRole('textbox', { name: 'Дата расхода', exact: true })
  await expect(date).toHaveValue('20.10.2026')
  await date.click()
  const calendar = page.locator('.ant-picker-dropdown:visible')
  await expect(calendar.locator('[title="2026-10-20"]')).not.toHaveClass(/ant-picker-cell-disabled/)
  await expect(calendar.locator('[title="2026-10-21"]')).toHaveClass(/ant-picker-cell-disabled/)
  await calendar.locator(`[title="${day === 'yesterday' ? '2026-10-19' : '2026-10-20'}"]`).click()
  await drawer.getByText('Внесение расхода', { exact: true }).click()
  await expect(calendar).not.toBeVisible()
  await expect(date).toHaveValue(day === 'yesterday' ? '19.10.2026' : '20.10.2026')
  await drawer.getByRole('spinbutton', { name: 'Сумма (руб.)', exact: true }).fill('1500')
  await drawer.getByRole('combobox', { name: 'Статья / Категория', exact: true }).click()
  await page.locator('.ant-select-dropdown:visible').getByText('Опилки', { exact: true }).click()
  await drawer.getByRole('textbox', { name: 'На что потрачено', exact: true }).fill('Закупка опилок')
  // A date that became future after a clock correction must also fail on submit.
  if (day === 'tomorrow') await page.clock.setFixedTime(new Date('2026-10-18T21:05:00Z'))
  await drawer.getByRole('button', { name: 'Внести расход', exact: true }).click()
  if (day === 'tomorrow') {
    await expect(drawer).toContainText('Дата расхода не может быть в будущем')
    expect(posts).toHaveLength(0)
  } else {
    await expect(drawer).not.toBeVisible()
    expect(posts).toHaveLength(1)
    expect(posts[0].date).toBe(day === 'today' ? '2026-10-20T00:05:00.000+03:00' : '2026-10-19T00:00:00.000+03:00')
  }
})

test('lesson drawer accepts a cash prepayment and keeps the agreed price', async ({ page }) => {
  await setup(page)
  let payload: Record<string, unknown> | undefined
  await page.route('**/api/lessons', route => { payload = route.request().postDataJSON(); return route.fulfill({ status: 201, json: { id: 'saved' } }) })
  await page.goto('/')
  const drawer = await lesson(page)
  await drawer.getByLabel('Стоимость услуги (₽)').fill('1500')
  await drawer.getByRole('switch', { name: 'Внесена предоплата' }).click()
  await drawer.getByLabel('Сумма предоплаты (₽)').fill('500')
  await drawer.getByRole('button', { name: 'Записать на тренировку', exact: true }).click()
  await expect(drawer).not.toBeVisible()
  expect(payload).toMatchObject({ cost: 1500, prepaymentAmount: 500, prepaymentMethod: 'CASH' })
})

test('read-only cashbox disables collecting a lesson prepayment', async ({ page }) => {
  await setup(page, 'MANAGER')
  await page.route('**/api/settings/my-permissions*', route => route.fulfill({ json: { role: 'MANAGER', modules: modules.map(module => ({ module, isEnabled: true, accessLevel: module === 'CASHBOX' ? 'READ_ONLY' : 'FULL' })) } }))
  await page.goto('/')
  const drawer = await lesson(page)
  await expect(drawer.getByRole('switch', { name: 'Внесена предоплата' })).toBeDisabled()
})

test('timeline completion refreshes progress and removes the finished lesson', async ({ page }) => {
  const state = await setup(page)
  await page.route('**/api/lessons/00000007-1111-4111-8111-111111111111', route => route.fulfill({ json: { id: '00000007-1111-4111-8111-111111111111', cost: 500, prepaymentAmount: 0, bookings: [{ membership: null }] } }))
  await page.route('**/api/lessons/00000007-1111-4111-8111-111111111111/complete', route => { state.completed++; return route.fulfill({ json: { id: '00000007-1111-4111-8111-111111111111', bookings: [] } }) })
  await page.goto('/')
  await page.getByRole('button', { name: 'Завершено', exact: true }).click()
  await page.getByRole('dialog', { name: 'Занятие состоялось' }).getByRole('button', { name: 'Завершить занятие', exact: true }).click()
  await expect(page.getByText('Предстоящих тренировок сегодня нет')).toBeVisible()
  await expect(page.locator('.dashboard-day-card--lessons .ant-statistic-content')).toHaveText('1/ 1')
})

test('narrow viewport supports all action drawers, keyboard closing, and retains page width', async ({ page }) => {
  await setup(page); await page.setViewportSize({ width: 390, height: 844 }); await page.goto('/')
  for (const [button, title] of [['− Внести расход', 'Внесение расхода'], ['Ветпроцедура', 'Новая вет-процедура'], ['+ Заселить лошадь', 'Быстрое заселение · Клуб'], ['Открыть / закрыть смену', 'Запланировать смену']]) {
    await page.getByRole('button', { name: button, exact: true }).click()
    const drawer = page.getByRole('dialog', { name: title, exact: true })
    await expect(drawer).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(drawer).not.toBeVisible()
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  await page.screenshot({ path: 'test-results/dashboard-mobile.png', fullPage: true })
})

test('administrator signs in through the login screen and sees quick actions', async ({ page }) => {
  await setup(page)
  await page.addInitScript(() => localStorage.clear())
  await page.route('**/api/auth/login', route => {
    expect(route.request().postDataJSON()).toEqual({ email: 'admin@example.com', password: 'test-password' })
    return route.fulfill({ json: { access_token: 'cookie-session', user: { id: 'admin', role: 'ADMIN', email: 'admin@example.com' } } })
  })
  await page.goto('/login')
  await page.getByLabel('Email', { exact: true }).fill('admin@example.com')
  await page.getByLabel('Пароль', { exact: true }).fill('test-password')
  await page.getByRole('button', { name: 'Войти', exact: true }).click()
  await expect(page.getByRole('region', { name: 'Быстрые действия' }).getByRole('button')).toHaveCount(6)
})

test('horse overload disables the option and Escape closes only the select popup', async ({ page }) => {
  await setup(page)
  await page.route('**/api/bookings/availability?*', route => route.fulfill({ json: { horseWorkloads: [{ horseId: '00000002-1111-4111-8111-111111111111', currentWorkloadMinutes: 240, maxDailyWorkloadMinutes: 240, status: 'AT_LIMIT' }], arenaOccupancy: [] } }))
  await page.goto('/')
  await page.getByRole('button', { name: '+ Записать на тренировку', exact: true }).click()
  const drawer = page.getByRole('dialog', { name: 'Записать на тренировку', exact: true })
  const horse = drawer.getByRole('combobox', { name: 'Лошадь', exact: true })
  await horse.click()
  await expect(page.locator('.ant-select-dropdown:visible .ant-select-item-option').filter({ hasText: 'Валдай' })).toHaveClass(/disabled/)
  await horse.press('Escape')
  await expect(drawer).toBeVisible()
  await page.screenshot({ path: 'test-results/dashboard-drawer.png', fullPage: true })
})

test('drawer inputs remain readable and the Moscow calendar fits a narrow viewport', async ({ page }) => {
  await setup(page)
  await page.setViewportSize({ width: 390, height: 844 })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/')
  await page.getByRole('button', { name: '+ Записать на тренировку', exact: true }).click()
  const drawer = page.getByRole('dialog', { name: 'Записать на тренировку', exact: true })
  const date = drawer.getByRole('textbox', { name: /Дата и время/ })
  await expect(date).toHaveValue('20.10.2026 12:00')
  await expect(drawer.locator('.ant-picker')).toHaveCSS('background-color', 'rgb(45, 37, 34)')
  await expect(date).toHaveCSS('color', 'rgb(250, 247, 242)')
  await date.click()
  const popup = page.locator('.ant-picker-dropdown:visible')
  await expect(popup).toBeVisible()
  const bounds = await popup.boundingBox()
  expect(bounds!.x).toBeGreaterThanOrEqual(0)
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(390)
  await date.press('Escape')
  await expect(drawer).toBeVisible()
  await expect(popup).not.toBeVisible()
  await page.screenshot({ path: 'test-results/dashboard-drawer-mobile.png' })
})
