import { workspaceSummary } from './workspaceSummary'
import { test, expect, type Page, type Locator } from './fixtures'
import { checkBookingDatePicker } from './bookingDatePicker'

for (const width of [1440, 390]) test(`resource slot preserves its trainer and time in advanced booking at ${width}px`, async ({ page }) => {
  await setup(page)
  await page.setViewportSize({ width, height: 900 })
  await page.route('**/api/settings/club-schedule', route => route.fulfill({ json: { openTime: '09:00', closeTime: '21:00', daysOfWeekOff: [] } }))
  for (const resource of ['bookings/horse-issues', 'horses/workload', 'lessons']) await page.route(`**/api/${resource}?*`, route => route.fulfill({ json: [] }))
  const rows: Record<string, unknown>[] = []
  await page.route('**/api/bookings?*', route => route.fulfill({ json: rows, headers: { 'x-total-count': String(rows.length) } }))
  await page.goto('/schedule')
  const grouping = page.getByRole('combobox', { name: 'Группировка расписания' })
  await grouping.focus(); await grouping.press('ArrowDown')
  await page.getByText('По тренерам', { exact: true }).click()
  await page.getByRole('button', { name: 'Забронировать: Мария Волкова, 11:00', exact: true }).click()
  await expect(page.getByText('Быстрая запись · 11:00–12:00', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Расширенные параметры', exact: true }).click()
  const drawer = page.getByRole('dialog', { name: 'Бронирование тройного ресурса', exact: true })
  await expect(drawer.getByLabel('Начало', { exact: true })).toHaveValue('20.10.2026 11:00')
  await expect(resourceSelection(drawer, 'Тренер')).toContainText('Мария Волкова')
  for (const [label, value] of [['Клиент', 'Анна Орлова'], ['Лошадь', 'Валдай'], ['Локация', 'Манеж']]) await choose(page, drawer, label, value)
  let fail = true
  await page.route('**/api/bookings', route => {
    const body = route.request().postDataJSON()
    expect(body).toMatchObject({ trainerId: '00000003-1111-4111-8111-111111111111', startTime: '2026-10-20T08:00:00.000Z' })
    if (fail) return route.fulfill({ status: 409, json: { message: 'Слот занят' } })
    rows.push({ ...body, id: '00000000-0000-4000-8000-000000000702', status: 'scheduled',
      trainer: { id: body.trainerId, name: 'Мария Волкова' }, arena: { id: body.arenaId, name: 'Манеж' }, client, horse: { id: body.horseId, name: 'Валдай' } })
    return route.fulfill({ status: 201, json: rows[0] })
  })
  await drawer.getByRole('button', { name: 'Создать бронирование', exact: true }).click()
  await expect(drawer.getByText('Слот занят')).toBeVisible()
  await expect(resourceSelection(drawer, 'Тренер')).toContainText('Мария Волкова')
  fail = false
  await drawer.getByRole('button', { name: 'Создать бронирование', exact: true }).click()
  await expect(drawer).not.toBeVisible()
  await expect(page.locator('.resource-booking')).toContainText('Анна Орлова')
})

for (const width of [1440, 390]) test(`dashboard date footer confirms Moscow time at ${width}px`, async ({ page }) => {
  await setup(page)
  await page.setViewportSize({ width, height: 650 })
  await page.goto('/')
  await page.getByRole('button', { name: '+ Создать запись', exact: true }).click()
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

for (const width of [1440, 390]) test(`workspace KPI cards share layout and interaction styles at ${width}px`, async ({ page }) => {
  await setup(page)
  await page.setViewportSize({ width, height: 844 })
  await page.goto('/dashboard')
  await expect(page.locator('.workspace-kpis .ant-statistic')).toHaveCount(4)
  for (const title of ['Занятий сегодня', 'Активных всадников', 'Ожидают подтверждения', 'Новые заявки']) {
    await expect(page.locator('.workspace-kpis').getByText(title, { exact: true })).toBeVisible()
  }
  const cards = page.locator('.workspace-kpis').getByRole('link')
  await expect(cards).toHaveCount(4)
  const heights = await cards.evaluateAll(nodes => nodes.map(node => node.getBoundingClientRect().height))
  expect(Math.max(...heights) - Math.min(...heights)).toBeLessThanOrEqual(1)
  const hintHeights = await cards.locator('.workspace-kpi-hint').evaluateAll(nodes => nodes.map(node => node.getBoundingClientRect().height))
  expect(Math.max(...hintHeights) - Math.min(...hintHeights)).toBeLessThanOrEqual(1)
  for (const card of await cards.all()) {
    await expect(card).toHaveCSS('cursor', 'pointer')
    await expect(card.locator('.ant-statistic-content')).toHaveCSS('font-variant-numeric', 'tabular-nums')
    await expect(card.locator('a, button')).toHaveCount(0)
    await card.focus()
    await expect(card).toBeFocused()
    await expect(card).toHaveCSS('outline-style', 'solid')
    await expect(card).toHaveCSS('outline-width', '2px')
  }
  await cards.first().hover()
  await expect(cards.first()).toHaveCSS('transform', 'matrix(1, 0, 0, 1, 0, -2)')
  await page.screenshot({ path: `test-results/dashboard-kpi-cards-${width}.png`, fullPage: true })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await expect(cards.first()).toHaveCSS('transform', 'none')
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
})

for (const width of [1440, 390]) {
  for (const interaction of ['click', 'keyboard'] as const) {
    test(`workspace KPI ${interaction} opens every destination at ${width}px`, async ({ page }) => {
      await setup(page)
      await page.setViewportSize({ width, height: 844 })
      for (const [title, path] of [
        ['Занятий сегодня', '/schedule'], ['Активных всадников', '/clients'],
        ['Ожидают подтверждения', '/schedule'], ['Новые заявки', '/leads'],
      ] as const) {
        await page.goto('/dashboard')
        const card = page.locator('.workspace-kpis').getByRole('link', { name: new RegExp(`^${title} —`) })
        await expect(card).toHaveAttribute('href', path)
        if (interaction === 'keyboard') {
          await card.focus()
          await card.press('Enter')
        } else {
          // The corner is outside both the number and action hint: the entire card must navigate.
          await card.click({ position: { x: 12, y: 12 } })
        }
        await expect(page).toHaveURL(new RegExp(`${path}$`))
        await expect(page.locator('.workspace-kpis')).toHaveCount(0)
        if (path === '/clients') await expect(page.getByRole('combobox', { name: 'Архив клиентов' })).toBeVisible()
      }
    })
  }
}

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
  const link = page.locator('.workspace-finance')
  await expect(link).toContainText(/1\s*000,00/)
  await expect(link).toContainText(/2\s*000,00/)
  await page.goto('/cash-desk')
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
  await page.route('https://api.open-meteo.com/**', route => route.fulfill({ json: {} }))
  await page.addInitScript(role => {
    localStorage.setItem('horsecrm.access_token', 'cookie-session')
    localStorage.setItem('horsecrm.role', role)
    localStorage.setItem('horsecrm.email', 'admin@example.com')
  }, role)
  for (const resource of ['bookings', 'lessons', 'bookings/horse-issues']) await page.route(`**/api/${resource}?*`, route => route.fulfill({ json: [], headers: { 'x-total-count': '0' } }))
  const state = { lessons: 1, cash: 1000, completed: 0, failure: false, calls: 0 }
  await page.route('**/api/workspace/admin-summary', route => route.fulfill({ json: workspaceSummary({
    kpi: { lessonsToday: state.lessons, activeRiders: 3, awaitingConfirmation: 0, newLeads: 0 },
    finance: { accrued: '3000', paid: String(state.cash), debt: '2000', mainBalance: state.cash, boardingBalance: 2000, recognizedMembershipRevenue: '500' },
  }) }))
  await page.route('**/api/cashbox/summary', route => route.fulfill({ json: { mainBalance: state.cash, boardingBalance: 2000, mainOperationsCount: 0, boardingOperationsCount: 0 } }))
  for (const [resource, rows] of Object.entries({ clients: [client], horses: [{ id: '00000002-1111-4111-8111-111111111111', name: 'Валдай', status: 'active', healthStatus: 'HEALTHY', minRestMinutes: 15, maxDailyMinutes: 240 }], trainers: [{ id: '00000003-1111-4111-8111-111111111111', name: 'Мария Волкова', isActive: true }], arenas: [{ id: '00000005-1111-4111-8111-111111111111', name: 'Манеж', isActive: true }], services: [{ id: '00000004-1111-4111-8111-111111111111', name: 'Выездка', title: 'Выездка', durationMinutes: 60, price: '500' }] })) {
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

for (const width of [1440, 390]) test(`shift banner shows live Moscow time and cached Tambov weather at ${width}px`, async ({ page }) => {
  await setup(page)
  await page.setViewportSize({ width, height: 844 })
  await page.clock.install({ time: new Date('2026-10-20T08:00:00Z') })
  let requests = 0
  await page.route('https://api.open-meteo.com/**', route => {
    requests++
    const url = new URL(route.request().url())
    expect(url.searchParams.get('timezone')).toBe('Europe/Moscow')
    expect(url.searchParams.get('latitude')).toBe('52.7212')
    expect(url.searchParams.get('longitude')).toBe('41.4523')
    expect(url.searchParams.get('current')).toBe('temperature_2m,weather_code')
    return route.fulfill({ json: { current: { temperature_2m: 4.2, weather_code: 3 } } })
  })
  await page.goto('/dashboard')
  const banner = page.locator('.shift-welcome')
  await expect(banner.locator('time')).toHaveText('11:00 МСК')
  await expect(banner.getByLabel('Погода в Тамбове')).toHaveText('·+4°Cоблачно')
  await expect(banner.locator('time')).toHaveCSS('font-variant-numeric', 'tabular-nums')
  await expect(banner.locator('.shift-weather .tabular-nums')).toHaveCSS('font-variant-numeric', 'tabular-nums')
  await expect(banner.locator('svg.lucide')).toHaveAttribute('stroke-width', '1.75')
  await page.clock.fastForward(60_000)
  await expect(banner.locator('time')).toHaveText('11:01 МСК')
  // StrictMode may start and abort an initial request before mounting again.
  const initialRequests = requests
  await page.reload()
  await expect(banner.getByLabel('Погода в Тамбове')).toContainText('+4°C')
  expect(requests).toBe(initialRequests)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.screenshot({ path: `test-results/dashboard-weather-${width}.png` })
  await page.clock.fastForward(20 * 60_000)
  await expect.poll(() => requests).toBe(initialRequests + 1)
})

for (const failure of ['blocked', 'invalid', 'http'] as const) test(`shift banner tolerates ${failure} weather`, async ({ page }) => {
  await setup(page)
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.route('https://api.open-meteo.com/**', route => failure === 'blocked'
    ? route.abort('blockedbyclient')
    : route.fulfill({ status: failure === 'http' ? 503 : 200, json: { current: { temperature_2m: null, weather_code: 0 } } }))
  await page.goto('/dashboard')
  await expect(page.locator('.shift-welcome time')).toHaveText('11:00 МСК')
  await expect(page.getByLabel('Погода в Тамбове')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Обновить сводку' })).toBeVisible()
  expect(errors).toEqual([])
})

for (const width of [1440, 390]) test(`quick booking shows nominal share, discounted cost and membership at ${width}px`, async ({ page }) => {
  await setup(page)
  await page.setViewportSize({ width, height: 900 })
  await page.route('**/api/services?*', route => route.fulfill({ json: [{ id: '00000004-1111-4111-8111-111111111111', name: 'Выездка', durationMinutes: 60, price: 2000, allowMembership: true }], headers: { 'x-total-count': '1' } }))
  await page.route('**/api/clients/*', route => route.fulfill({ json: { ...client, memberships: [{ id: '00000006-1111-4111-8111-111111111111', type: 'fixed_lessons', isActive: true, status: 'active', remainedLessons: 3, validUntil: '2027-01-01' }] } }))
  await page.route('**/api/bookings?*', route => route.fulfill({ json: [], headers: { 'x-total-count': '0' } }))
  await page.route('**/api/lessons?*', route => route.fulfill({ json: [] }))
  await page.goto('/')
  await page.getByRole('button', { name: '+ Создать запись', exact: true }).click()
  const drawer = page.getByRole('dialog', { name: 'Записать на тренировку', exact: true })
  await choose(page, drawer, 'Услуга', 'Выездка')
  await expect(drawer.getByText('Окончание: 20.10.2026 13:00 (Москва)', { exact: true })).toBeVisible()
  await drawer.getByRole('spinbutton', { name: /Стоимость услуги/ }).fill('1000')
  const summary = drawer.locator('.ant-descriptions').filter({ hasText: 'Финансовая сводка' })
  await expect(summary).toContainText(/600 руб/)
  await expect(summary).toContainText(/1\s*000 руб/)
  for (const [label, value] of [['Клиент', 'Анна Орлова'], ['Тренер', 'Мария Волкова'], ['Лошадь', 'Валдай']]) await choose(page, drawer, label, value)
  await drawer.getByRole('checkbox', { name: 'Списать занятие с абонемента', exact: true }).check()
  await expect(summary).toContainText('0 руб. · занятие с абонемента')
  await expect(summary).toContainText('600 руб.')
  await page.screenshot({ path: `test-results/crm-quick-booking-${width}.png` })
  let payload: Record<string, unknown> | undefined
  await page.route('**/api/lessons', route => { payload = route.request().postDataJSON() as Record<string, unknown>; return route.fulfill({ status: 201, json: { id: 'created' } }) })
  await drawer.getByRole('button', { name: 'Записать на тренировку', exact: true }).click()
  await expect(drawer).toBeHidden()
  expect(payload?.membershipId).toBe('00000006-1111-4111-8111-111111111111')
  expect(payload?.cost).toBeUndefined()
})

async function choose(page: Page, drawer: Locator, label: string, value: string) {
  const input = drawer.getByRole('combobox', { name: label, exact: true })
  await input.scrollIntoViewIfNeeded()
  await input.focus()
  await input.fill(value)
  await page.locator('.ant-select-dropdown:visible .ant-select-item-option').filter({ hasText: value }).first().click()
  await expect(page.locator('.ant-select-dropdown:visible')).toHaveCount(0)
}
async function lesson(page: Page) {
  await page.getByRole('button', { name: '+ Создать запись', exact: true }).click()
  const drawer = page.getByRole('dialog', { name: 'Записать на тренировку', exact: true })
  await expect(drawer).toBeVisible()
  await choose(page, drawer, 'Клиент', 'Анна Орлова')
  await choose(page, drawer, 'Услуга', 'Выездка')
  await choose(page, drawer, 'Тренер', 'Мария Волкова')
  await choose(page, drawer, 'Лошадь', 'Валдай')
  return drawer
}

for (const width of [1440, 390]) test(`shared booking shows trainer places and blocks the capacity limit at ${width}px`, async ({ page }) => {
  const state = await setup(page)
  await page.setViewportSize({ width, height: 900 })
  let riders = 2
  const trainerId = '00000003-1111-4111-8111-111111111111'
  await page.route('**/api/trainers?*', route => route.fulfill({ json: [{ id: trainerId, name: 'Мария Волкова', isActive: true, maxParallelLessons: 3 }], headers: { 'x-total-count': '1' } }))
  await page.route('**/api/bookings?*', route => route.fulfill({ json: [], headers: { 'x-total-count': '0' } }))
  await page.route('**/api/lessons?*', route => route.fulfill({ json: Array.from({ length: riders }, (_, i) => ({
    id: `other-${i}`, trainer: { id: trainerId, name: 'Мария Волкова' }, service: { name: 'Выездка' },
    startTime: '2026-10-20T09:00:00Z', endTime: '2026-10-20T10:00:00Z', status: 'SCHEDULED',
    bookings: [{ client: { id: `other-client-${i}`, name: `Всадник ${i + 1}` }, horse: { id: `other-horse-${i}`, name: `Лошадь ${i + 1}` } }],
  })) }))
  await page.goto('/')
  const drawer = await lesson(page)
  const save = drawer.getByRole('button', { name: 'Записать на тренировку', exact: true })
  await expect(drawer.getByRole('status')).toContainText('занято 2/3, свободно 1')
  await expect(save).toBeEnabled()
  const select = drawer.getByRole('combobox', { name: 'Тренер', exact: true })
  await select.focus(); await select.press('ArrowDown')
  await expect(page.locator('.ant-select-dropdown:visible')).toContainText('Мария Волкова (занято 2/3)')
  await select.press('Escape')
  await expect(drawer).toBeVisible()
  riders = 3
  await drawer.getByLabel('Длительность, мин', { exact: true }).fill('30')
  await expect(drawer.getByRole('status')).toContainText('занято 3/3, свободно 0')
  await expect(drawer.getByRole('alert').filter({ hasText: 'максимум одновременных всадников (3)' })).toBeVisible()
  await expect(save).toBeDisabled()
  await page.screenshot({ path: `test-results/trainer-capacity-${width}.png` })
  riders = 2
  await drawer.getByLabel('Длительность, мин', { exact: true }).fill('60')
  await expect(drawer.getByRole('status')).toContainText('занято 2/3, свободно 1')
  await save.click()
  await expect(drawer).not.toBeVisible()
  expect(state.calls).toBe(1)
})

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
  await page.getByRole('button', { name: '+ Создать запись', exact: true }).click()
  return { drawer: page.getByRole('dialog', { name: 'Записать на тренировку', exact: true }), clients, horses, trainers }
}

function resourceSelection(drawer: Locator, label: string) {
  return drawer.getByRole('combobox', { name: label, exact: true }).locator('xpath=ancestor::div[contains(@class,"ant-select-selector")]').locator('.ant-select-selection-item')
}

for (const width of [1440, 390]) test(`dashboard booking applies client defaults and preserves manual changes at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 900 })
  const { drawer } = await preferenceSetup(page)
  await choose(page, drawer, 'Клиент', 'Анна Орлова')
  await expect(resourceSelection(drawer, 'Тренер')).toContainText('Мария Волкова')
  await expect(resourceSelection(drawer, 'Лошадь')).toHaveText('Валдай')
  await page.screenshot({ path: `test-results/dashboard-booking-defaults-${width}.png` })
  await choose(page, drawer, 'Клиент', 'Ольга Соколова')
  await expect(resourceSelection(drawer, 'Тренер')).toContainText('Иван Петров')
  await expect(resourceSelection(drawer, 'Лошадь')).toHaveText('Алмаз')
  await choose(page, drawer, 'Клиент', 'Клиент без предпочтений')
  for (const label of ['Тренер', 'Лошадь']) await expect(resourceSelection(drawer, label)).toHaveCount(0)
  await choose(page, drawer, 'Клиент', 'Анна Орлова')
  await expect(resourceSelection(drawer, 'Лошадь')).toHaveText('Валдай')
  await choose(page, drawer, 'Тренер', 'Иван Петров')
  await choose(page, drawer, 'Лошадь', 'Алмаз')
  await choose(page, drawer, 'Клиент', 'Клиент без предпочтений')
  await expect(resourceSelection(drawer, 'Тренер')).toContainText('Иван Петров')
  await expect(resourceSelection(drawer, 'Лошадь')).toHaveText('Алмаз')
  await choose(page, drawer, 'Клиент', 'Анна Орлова')
  await expect(resourceSelection(drawer, 'Тренер')).toContainText('Иван Петров')
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
  await expect(resourceSelection(drawer, 'Тренер')).toContainText('Иван Петров')
  await expect(resourceSelection(drawer, 'Лошадь')).toHaveText('Алмаз')
  const horseSelect = drawer.getByRole('combobox', { name: 'Лошадь', exact: true }).locator('xpath=ancestor::div[contains(@class,"ant-select") and not(contains(@class,"ant-select-selector"))][1]')
  await horseSelect.hover()
  await horseSelect.locator('.ant-select-clear').click()
  await choose(page, drawer, 'Клиент', 'Клиент без предпочтений')
  await expect(resourceSelection(drawer, 'Тренер')).toContainText('Иван Петров')
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
  await expect(resourceSelection(drawer, 'Тренер')).toContainText('Иван Петров')
  await expect(resourceSelection(drawer, 'Лошадь')).toHaveText('Алмаз')
  release()
  await choose(page, drawer, 'Услуга', 'Выездка')
  await expect(resourceSelection(drawer, 'Тренер')).toContainText('Иван Петров')
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
  await expect(page.getByRole('button', { name: '+ Создать запись', exact: true })).toBeVisible()
  const drawer = await lesson(page)
  const bounds = await drawer.boundingBox()
  expect(bounds!.x + bounds!.width).toBeCloseTo(page.viewportSize()!.width, 0)
  await drawer.getByRole('button', { name: 'Записать на тренировку', exact: true }).click()
  await expect(drawer).not.toBeVisible()
  await expect(page.locator('.workspace-kpis .ant-statistic').filter({ hasText: 'Занятий сегодня' })).toContainText('2')
  expect(state.calls).toBe(1)
})

test('cash payment closes the drawer and refreshes balance without navigation', async ({ page }) => {
  await setup(page); await page.goto('/')
  await page.getByRole('button', { name: 'Принять платёж', exact: true }).first().click()
  const drawer = page.getByRole('dialog', { name: 'Принять оплату / Касса', exact: true })
  await choose(page, drawer, 'Клиент', 'Анна Орлова')
  await choose(page, drawer, 'Услуга / занятие / абонемент', 'Выездка')
  await drawer.getByLabel('Внесено клиентом, ₽', { exact: true }).fill('500')
  await drawer.getByRole('button', { name: 'Провести платёж' }).click()
  await expect(drawer).not.toBeVisible()
  await expect(page.locator('.cashbox-header-link').first()).toContainText(/1\s?500/)
  await expect(page).toHaveURL(/\/$/)
})

test('failed lesson save preserves the form, supports retry, and dirty close asks before discarding', async ({ page }) => {
  const state = await setup(page); state.failure = true; await page.goto('/')
  const drawer = await lesson(page)
  await drawer.getByRole('button', { name: 'Записать на тренировку', exact: true }).click()
  await expect(drawer.getByRole('alert').filter({ hasText: 'Тренер уже занят' })).toBeVisible()
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
  await expect(page.getByRole('button', { name: 'Принять платёж' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: '+ Заселить лошадь' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Ветпроцедура', exact: true })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Завершено', exact: true })).toHaveCount(0)
  await expect(page.getByRole('button', { name: '+ Создать запись', exact: true })).toHaveCount(0)
  if (policy !== 'read-only') await expect(page.locator('.workspace-finance')).toHaveCount(0)
  else await expect(page.locator('.workspace-finance')).toBeVisible()
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
  await page.goto('/cash-desk')
  await page.getByRole('button', { name: 'Внести расход', exact: true }).click()
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
  await drawer.getByRole('radio', { name: 'Внесена предоплата' }).check()
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
  await expect(drawer.getByRole('radio', { name: 'Внесена предоплата' })).toBeDisabled()
})

test('workspace refresh shows an externally completed lesson and its audit entry', async ({ page }) => {
  await setup(page)
  let completed = false
  await page.route('**/api/workspace/admin-summary', route => route.fulfill({ json: workspaceSummary({
    actions: completed ? [{ id: '00000000-0000-4000-8000-000000000701', action: 'LESSON_COMPLETED', actorName: 'trainer@example.com', createdAt: '2026-10-20T09:00:00Z' }] : [],
  }) }))
  await page.goto('/')
  await page.getByRole('button', { name: /Журнал действий смены/ }).click()
  await expect(page.getByText('Действий пока нет', { exact: true })).toBeVisible()
  completed = true
  await page.getByRole('button', { name: 'Обновить сводку', exact: true }).click()
  const journal = page.getByRole('region', { name: /Журнал действий смены/ })
  await expect(journal.getByText('Занятие проведено', { exact: true })).toBeVisible()
  await expect(journal.getByText(/trainer@example.com/)).toBeVisible()
})

for (const width of [1440, 1024, 390]) test(`dashboard shift journal toggles independently of main cards at ${width}px`, async ({ page }) => {
  await setup(page)
  await page.setViewportSize({ width, height: 844 })
  const actions = Array.from({ length: 20 }, (_, index) => ({ id: `action-${index}`, action: 'LESSON_COMPLETED', actorName: `Администратор ${index}`, createdAt: `2026-10-20T09:${String(index).padStart(2, '0')}:00Z` }))
  await page.route('**/api/workspace/admin-summary', route => route.fulfill({ json: workspaceSummary({
    finance: { accrued: '3000', paid: '1000', debt: '2000', mainBalance: 1000, boardingBalance: 2000, recognizedMembershipRevenue: '500' }, actions,
  }) }))
  await page.goto('/dashboard')
  const toggle = page.getByRole('button', { name: /Журнал действий смены/ })
  const list = page.locator('#shift-actions-list')
  await expect(toggle).toHaveAttribute('aria-expanded', 'false')
  await expect(toggle).toContainText('20')
  await expect(toggle).toContainText('Администратор 19')
  await expect(list).toBeHidden()
  const expectSectionGaps = async () => {
    const sections = page.locator('.admin-workspace > .shift-welcome, .admin-workspace > .workspace-kpis, .admin-workspace > .admin-workspace-columns, .admin-workspace > .workspace-actions-card, .admin-workspace > #pending-leads')
    await expect(sections).toHaveCount(5)
    await expect.poll(async () => sections.evaluateAll(nodes => {
      const rects = nodes.map(node => node.getBoundingClientRect())
      return rects.slice(1).map((rect, index) => rect.top - rects[index].bottom)
    })).toEqual([24, 24, 24, 24])
    const [topGap, bottomGap] = await sections.evaluateAll(nodes => {
      const [, , columns, journal, leads] = nodes.map(node => node.getBoundingClientRect())
      return [journal.top - columns.bottom, leads.top - journal.bottom]
    })
    expect(topGap).toBeGreaterThanOrEqual(16)
    expect(bottomGap).toBeGreaterThanOrEqual(16)
    expect(Math.abs(topGap - bottomGap)).toBeLessThanOrEqual(2)
  }
  await expectSectionGaps()
  const mainCards = page.locator('.admin-workspace-columns > .workspace-main-card')
  const initialRects = await mainCards.evaluateAll(cards => cards.map(card => {
    const { top, bottom } = card.getBoundingClientRect()
    return { top, bottom }
  }))
  expect(initialRects).toHaveLength(2)
  if (width > 800) {
    expect(Math.abs(initialRects[0].bottom - initialRects[1].bottom)).toBeLessThanOrEqual(2)
    expect(Math.abs(initialRects[0].top - initialRects[1].top)).toBeLessThanOrEqual(2)
  }
  await toggle.click()
  await expect(toggle).toHaveAttribute('aria-expanded', 'true')
  await expect(list).toBeVisible()
  await expectSectionGaps()
  expect(await list.evaluate(node => node.clientHeight <= 320 && node.scrollHeight > node.clientHeight && getComputedStyle(node).overflowY === 'auto')).toBe(true)
  const mainBottom = await mainCards.evaluateAll(cards => Math.max(...cards.map(card => card.getBoundingClientRect().bottom + window.scrollY)))
  expect(await page.locator('.workspace-actions-card').evaluate(node => node.getBoundingClientRect().top + window.scrollY)).toBeGreaterThanOrEqual(mainBottom)
  if (width > 800) expect(await mainCards.evaluateAll(cards => Math.abs(cards[0].getBoundingClientRect().bottom - cards[1].getBoundingClientRect().bottom))).toBeLessThanOrEqual(2)
  await page.screenshot({ path: `test-results/dashboard-journal-${width}.png`, fullPage: true })
  await toggle.focus()
  await toggle.press('Enter')
  await expect(toggle).toHaveAttribute('aria-expanded', 'false')
  await expect(list).toBeHidden()
  await expect(toggle).toBeFocused()
  await toggle.press('Space')
  await expect(list).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
})

test('narrow workspace drawers close by keyboard without losing page width', async ({ page }) => {
  await setup(page)
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/')
  for (const [button, title] of [['+ Создать запись', 'Записать на тренировку'], ['Принять платёж', 'Принять оплату / Касса']]) {
    await page.getByRole('button', { name: button, exact: true }).first().click()
    const drawer = page.getByRole('dialog', { name: title, exact: true })
    await expect(drawer).toBeVisible()
    await expect(drawer).not.toHaveClass(/ant-zoom-(enter|appear)/)
    await drawer.getByRole('button', { name: /^(Закрыть|Close)$/ }).focus()
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
  await expect(page.getByRole('button', { name: '+ Создать запись', exact: true })).toBeVisible()
})

test('horse overload disables the option and Escape closes only the select popup', async ({ page }) => {
  await setup(page)
  await page.route('**/api/bookings/availability?*', route => route.fulfill({ json: { horseWorkloads: [{ horseId: '00000002-1111-4111-8111-111111111111', currentWorkloadMinutes: 240, maxDailyWorkloadMinutes: 240, status: 'AT_LIMIT' }], arenaOccupancy: [] } }))
  await page.goto('/')
  await page.getByRole('button', { name: '+ Создать запись', exact: true }).click()
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
  await page.getByRole('button', { name: '+ Создать запись', exact: true }).click()
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
