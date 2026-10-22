import { test, expect, type Page } from './fixtures'

import { checkBookingDatePicker } from './bookingDatePicker'

test('schedule quick booking date footer confirms Moscow time', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-10-09T06:00:00Z'))
  await login(page)
  await page.goto('/schedule')
  await page.getByRole('button', { name: 'Новое занятие', exact: true }).click()
  await checkBookingDatePicker(page, page.getByRole('dialog', { name: 'Быстрое бронирование' }), 'Время начала', '09.10.2026 09:00')
})

test.beforeEach(async ({ page }) => {
  await page.route('**/api/leads/events', route => route.fulfill({ contentType: 'text/event-stream', body: ': heartbeat\n\n' }))
  await page.route('**/api/bookings/horse-issues?*', route => route.fulfill({ json: [], headers: { 'x-total-count': '0' } }))
  await page.route('**/api/settings/access/me*', async route => {
    const role = await page.evaluate(() => localStorage.getItem('horsecrm.role') ?? 'ADMIN')
    await route.fulfill({ json: { role, permissions: { horseReplaceOwn: true, horseReplaceAny: role !== 'TRAINER',
      healthRead: true, healthWrite: role !== 'TRAINER', financeRead: role !== 'TRAINER', boardingAccess: true } } })
  })
  await page.route('**/api/bookings?*', route => route.fulfill({ json: [], headers: { 'x-total-count': '0' } }))
  await page.route('**/api/bookings/availability?*', route => route.fulfill({ json: { date: '2026-10-08', horseWorkloads: [], arenaOccupancy: [] } }))
  await page.route('**/api/auth/refresh', route => route.fulfill({ status: 401, json: { message: 'Session revoked' } }))
  await page.route('**/api/auth/logout', route => route.fulfill({ json: { success: true } }))
  await page.route('**/api/settings/club-schedule', route => route.fulfill({ json: { openTime: '09:00', closeTime: '21:00', daysOfWeekOff: [1] } }))
  await page.route('**/api/lessons?*', route => route.fulfill({ json: [] }))
  await page.route(/\/api\/(clients|horses|trainers|services|arenas)\?/, route => route.fulfill({ json: [], headers: { 'x-total-count': '0' } }))
  await page.route('**/api/horses/workload?*', route => route.fulfill({ json: [] }))
})

test('schedule: slot booking preserves input and displays backend 409', async ({ page }) => {
  await login(page)
  const ids: Record<string, string> = Object.fromEntries(['clients', 'horses', 'trainers', 'services'].map((resource, index) => [resource, `0000000${index + 1}-1111-4111-8111-111111111111`]))
  for (const resource of ['clients', 'horses', 'trainers', 'services']) {
    await page.route(`**/api/${resource}?*`, route => route.fulfill({
      json: [{ id: ids[resource], name: resource, firstName: resource, title: resource, durationMinutes: 60, maxDailyMinutes: 240, isUnavailable: false }],
      headers: { 'x-total-count': '1' },
    }))
  }
  await page.route(`**/api/clients/${ids.clients}`, route => route.fulfill({ json: { id: ids.clients, name: 'clients', memberships: [] } }))
  await page.route('**/api/horses/workload?*', route => route.fulfill({ json: [{ horseId: ids.horses, horseName: 'horses', maxDailyWorkloadMinutes: 240, currentWorkloadMinutes: 60, status: 'AVAILABLE' }] }))
  const conflict = 'Тренер уже занят в выбранное время'
  await page.route('**/api/lessons', route => route.fulfill({ status: 409, json: { message: conflict } }))
  await page.goto('/schedule')
  await expect(page.getByRole('button', { name: 'Новое занятие', exact: true })).toBeEnabled()
  const column = page.locator('.fc-timegrid-col[data-date]').first()
  const bounds = await column.boundingBox()
  if (!bounds) throw new Error('Calendar day is not visible')
  await page.mouse.click(bounds.x + bounds.width / 2, bounds.y + 40)
  const modal = page.getByRole('dialog', { name: 'Быстрое бронирование' })
  await expect(modal).toBeVisible()
  for (const [label, value] of [['Клиент', 'clients'], ['Услуга', 'services'], ['Тренер', 'trainers'], ['Лошадь участника', 'horses']]) {
    await modal.getByRole('combobox', { name: new RegExp(`${label}$`) }).fill(value)
    await page.locator('.ant-select-dropdown:visible .ant-select-item-option').filter({ hasText: value }).first().click()
  }
  await expect(modal.getByText('Доступно: 180 из 240 мин')).toBeVisible()
  await modal.getByRole('button', { name: 'Создать занятие', exact: true }).click()
  await expect(modal.getByRole('alert')).toContainText(conflict)
  await expect(modal.getByLabel('Длительность, мин')).toHaveValue('60')
  await expect(modal.getByRole('button', { name: 'Создать занятие', exact: true })).toBeEnabled()
})

test('schedule: failed refresh preserves the current screen and session', async ({ page }) => {
  await login(page)
  await page.route('**/api/lessons?*', route => route.fulfill({ status: 401, json: { message: 'Unauthorized' } }))
  await page.goto('/schedule')
  await expect(page).toHaveURL(/\/schedule$/)
  expect(await page.evaluate(() => localStorage.getItem('horsecrm.access_token'))).toBe('cookie-session')
})

const catalogs = ['clients', 'horses', 'trainers', 'services']
const routes = ['/', ...catalogs.flatMap(r => [`/${r}`, `/${r}/new`, `/${r}/edit/1`]), '/schedule', '/settings']
for (const route of routes) {
  test(`unauthenticated redirects ${route}`, async ({ page }) => {
    await page.goto(route)
    await expect(page).toHaveURL(/\/login(?:\?|$)/)
    await expect(page.getByRole('button', { name: 'Войти', exact: true })).toBeVisible()
  })
}
async function login(page: Page, role = 'ADMIN') {
  await page.route('**/api/auth/login', async route => {
    expect(route.request().method()).toBe('POST')
    expect(route.request().postDataJSON()).toEqual({ email: 'qa@example.com', password: 'qa-password' })
    await route.fulfill({ json: { access_token: 'qa-token', user: { id: 'qa', email: 'qa@example.com', role } } })
  })
  await page.goto('/login')
  await page.getByLabel('Email', { exact: true }).fill('qa@example.com')
  await page.getByLabel('Пароль', { exact: true }).fill('qa-password')
  await page.getByRole('button', { name: 'Войти', exact: true }).click()
  await expect(page).toHaveURL('/')
  await page.goto('/clients')
}
for (const role of ['ADMIN', 'MANAGER', 'TRAINER']) {
  test(`login and permissions ${role} (mock API)`, async ({ page }) => {
    await login(page, role)
    expect(await page.evaluate(() => localStorage.getItem('horsecrm.access_token'))).toBe('cookie-session')
    expect(await page.evaluate(() => localStorage.getItem('horsecrm.role'))).toBe(role)
    expect(await page.evaluate(async () => {
      const path = '/src/authProvider.ts'
      return (await import(/* @vite-ignore */ path)).authProvider.getPermissions()
    })).toBe(role)
  })
}
test('admin navigation and logout (mock API)', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()) })
  await login(page)
  for (const [route, title] of [['clients','Клиенты'],['horses','Лошади'],['trainers','Тренеры'],['services','Услуги'],['schedule','Расписание занятий'],['settings','Режим работы клуба']]) {
    const groups: Record<string, string> = { clients: 'Клиенты и финансы', horses: 'Лошади и постой', trainers: 'Клуб и команда', services: 'Клуб и команда', schedule: 'Занятия', settings: 'Администрирование' }
    const group = page.locator('aside').getByRole('menuitem', { name: new RegExp(`${groups[route]}$`) })
    if (await group.getAttribute('aria-expanded') === 'false') await group.click()
    await page.locator(`aside a[href="/${route}"]`).click()
    await expect(page).toHaveURL(url => url.pathname === `/${route}`)
    await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible()
  }
  await page.screenshot({ path: 'e2e-layout.png', fullPage: true })
  await page.getByRole('menuitem', { name: /logout|выход/i }).click()
  await expect(page).toHaveURL(/\/login(?:\?|$)/)
  expect(await page.evaluate(() => localStorage.getItem('horsecrm.access_token'))).toBeNull()
  expect(errors).toEqual([])
})
test('all catalogs use cookies, pagination and total (mock API)', async ({ page }) => {
  await login(page)
  for (const resource of catalogs) {
    await page.route(`**/api/${resource}?*`, async route => {
      expect(route.request().headers().authorization).toBeUndefined()
      const params = new URL(route.request().url()).searchParams
      if (params.get('_end') !== '40') { await route.fallback(); return }
      expect(params.get('_start')).toBe('20')
      expect(params.get('_end')).toBe('40')
      await route.fulfill({ json: [{ id: 'qa' }], headers: { 'x-total-count': '57' } })
    })
    const result = await page.evaluate(async resource => {
      const path = '/src/dataProvider.ts'
      return (await import(/* @vite-ignore */ path)).dataProvider.getList({ resource, pagination: { currentPage: 2, pageSize: 20 } })
    }, resource)
    expect(result).toEqual({ data: [{ id: 'qa' }], total: 57 })
  }
})

test('401 and failed refresh preserve session after reload', async ({ page }) => {
  await login(page)
  await page.route('**/api/clients?*', route => route.fulfill({ status: 401, json: { message: 'Unauthorized' } }))
  const unauthorized = page.waitForResponse(response => response.url().includes('/api/clients?') && response.status() === 401)
  await page.reload()
  await unauthorized
  await expect(page).toHaveURL(url => url.pathname === '/clients')
  expect(await page.evaluate(() => localStorage.getItem('horsecrm.access_token'))).toBe('cookie-session')
  expect(await page.evaluate(() => localStorage.getItem('horsecrm.role'))).toBe('ADMIN')
  await expect(page.getByRole('button', { name: 'Войти', exact: true })).toHaveCount(0)
})




test('silent refresh restores requests after idle and session survives reopening a tab', async ({ page, context }) => {
  await login(page)
  let refreshed = false
  await page.route('**/api/auth/refresh', route => { refreshed = true; return route.fulfill({ json: { access_token: 'cookie-session' } }) })
  await page.route('**/api/clients?*', route => refreshed
    ? route.fulfill({ json: [], headers: { 'x-total-count': '0' } })
    : route.fulfill({ status: 401, json: { message: 'Expired' } }))
  await page.clock.install()
  await page.clock.setSystemTime(Date.now() + 31 * 24 * 60 * 60_000)
  await page.clock.fastForward(60_000)
  await page.reload()
  await expect.poll(() => refreshed).toBe(true)
  await expect(page).toHaveURL(url => url.pathname === '/clients')
  const reopened = await context.newPage()
  await reopened.goto('/clients')
  await expect(reopened).toHaveURL(url => url.pathname === '/clients')
  expect(await reopened.evaluate(() => localStorage.getItem('horsecrm.access_token'))).toBe('cookie-session')
  await reopened.close()
})
