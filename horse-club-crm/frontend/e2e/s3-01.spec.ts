import { test, expect, type Page } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.route('**/api/settings/club-schedule', route => route.fulfill({ json: { openTime: '09:00', closeTime: '21:00', dayOfWeekOff: 1 } }))
  await page.route('**/api/lessons?*', route => route.fulfill({ json: [] }))
  await page.route(/\/api\/(clients|horses|trainers|services)\?/, route => route.fulfill({ json: [], headers: { 'x-total-count': '0' } }))
})

test('schedule: slot booking preserves input and displays backend 409', async ({ page }) => {
  await login(page)
  for (const resource of ['clients', 'horses', 'trainers', 'services']) {
    await page.route(`**/api/${resource}?*`, route => route.fulfill({
      json: [{ id: resource, name: resource, firstName: resource, title: resource, durationMinutes: 60, maxDailyMinutes: 240, isUnavailable: false }],
      headers: { 'x-total-count': '1' },
    }))
  }
  await page.route('**/api/horses/horses/workload?*', route => route.fulfill({ json: { maxDailyMinutes: 240, usedMinutes: 60, remainingMinutes: 180 } }))
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
  for (const [label, value] of [['Клиент', 'clients'], ['Услуга', 'services'], ['Тренер', 'trainers'], ['Лошадь', 'horses']]) {
    await modal.getByLabel(label, { exact: true }).fill(value)
    await page.getByTitle(value, { exact: true }).last().click()
  }
  await expect(modal.getByText('Доступно: 180 из 240 мин')).toBeVisible()
  await modal.getByRole('button', { name: 'Создать занятие', exact: true }).click()
  await expect(modal.getByRole('alert')).toContainText(conflict)
  await expect(modal.getByLabel('Длительность, мин')).toHaveValue('60')
  await expect(modal.getByRole('button', { name: 'Создать занятие', exact: true })).toBeEnabled()
})

test('schedule: 401 from raw Axios request redirects to login', async ({ page }) => {
  await login(page)
  await page.route('**/api/lessons?*', route => route.fulfill({ status: 401, json: { message: 'Unauthorized' } }))
  await page.goto('/schedule')
  await expect(page).toHaveURL(/\/login(?:\?|$)/)
  expect(await page.evaluate(() => localStorage.getItem('horsecrm.access_token'))).toBeNull()
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
  await expect(page).toHaveURL(/\/clients(?:\?|$)/)
}
for (const role of ['ADMIN', 'MANAGER', 'TRAINER']) {
  test(`login and permissions ${role} (mock API)`, async ({ page }) => {
    await login(page, role)
    expect(await page.evaluate(() => localStorage.getItem('horsecrm.access_token'))).toBe('qa-token')
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
test('all catalogs use bearer, pagination and total (mock API)', async ({ page }) => {
  await login(page)
  for (const resource of catalogs) {
    await page.route(`**/api/${resource}?*`, async route => {
      expect(route.request().headers().authorization).toBe('Bearer qa-token')
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

test('401 clears session and redirects through Refine (mock API, real catalog query)', async ({ page }) => {
  await login(page)
  await page.route('**/api/clients?*', route => route.fulfill({ status: 401, json: { message: 'Unauthorized' } }))
  const unauthorized = page.waitForResponse(response => response.url().includes('/api/clients?') && response.status() === 401)
  await page.reload()
  await unauthorized
  await expect(page).toHaveURL(/\/login(?:\?|$)/)
  expect(await page.evaluate(() => localStorage.getItem('horsecrm.access_token'))).toBeNull()
  expect(await page.evaluate(() => localStorage.getItem('horsecrm.role'))).toBeNull()
  await expect(page.getByRole('button', { name: 'Войти', exact: true })).toBeVisible()
})


