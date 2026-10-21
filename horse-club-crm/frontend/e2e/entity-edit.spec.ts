import { test, expect, type Page } from './fixtures'

const id = '00000000-0000-4000-8000-000000000091'
async function login(page: Page, readOnly = false) {
  await page.addInitScript(() => {
    localStorage.setItem('horsecrm.access_token', 'cookie-session')
    localStorage.setItem('horsecrm.role', 'MANAGER')
    localStorage.setItem('horsecrm.email', 'qa@example.com')
  })
  await page.route('**/api/settings/my-permissions*', route => route.fulfill({ json: { role: 'MANAGER', modules:
    ['SCHEDULE', 'STABLES', 'STAFF_PAYROLL', 'CASHBOX', 'VETERINARY'].map(module => ({ module, isEnabled: true, accessLevel: readOnly ? 'READ_ONLY' : 'FULL' })) } }))
}

for (const resource of ['clients', 'horses', 'trainers'] as const) {
  for (const width of [1440, 390]) test(`${resource}: edit drawer, failed save and live refresh at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 })
    await login(page)
    const cardTitle = { clients: 'Карточка клиента', horses: 'Карточка лошади', trainers: 'Карточка тренера' }[resource]
    let record: Record<string, unknown> = {
      id, name: 'Тестовая запись', firstName: 'Тестовая', lastName: 'запись', phone: '+79991234567', email: 'qa@example.com',
      clientType: 'REGULAR', isRider: true, isPayer: false, createdAt: '2026-10-01', membership: null,
      maxRiderWeight: 85, maxDailyMinutes: 120, minRestMinutes: 45, isUnavailable: false, status: 'active', ownerType: 'club',
      maxDailyLoad: 480, baseRate: 1500, isPublic: false, order: 0,
      memberships: [], bookings: [], payments: [], boardingContracts: [], healthLogs: [],
    }
    let fail = true
    let payload: Record<string, unknown> | undefined
    await page.route(`**/api/${resource}?*`, route => route.fulfill({ json: [record], headers: { 'x-total-count': '1' } }))
    await page.route(`**/api/${resource}/${id}`, route => {
      if (route.request().method() === 'PATCH') {
        payload = route.request().postDataJSON()
        if (fail) return route.fulfill({ status: 409, json: { message: 'Запись изменилась. Повторите сохранение' } })
        record = { ...record, ...payload }
      }
      return route.fulfill({ json: record })
    })
    await page.route('**/api/horse-issues*', route => route.fulfill({ json: [] }))
    await page.goto(`/${resource}`)
    await page.getByRole('button', { name: 'Тестовая запись', exact: true }).click()
    const card = page.getByRole('dialog', { name: cardTitle, exact: true })
    await card.getByRole('button', { name: 'Редактировать', exact: true }).click()
    const drawer = page.getByRole('dialog', { name: /Редактирование/ })
    const label = { clients: 'Имя', horses: 'Кличка', trainers: 'ФИО' }[resource]
    await drawer.getByLabel(label, { exact: true }).fill('Обновленная')
    if (resource === 'clients') {
      await drawer.getByLabel('Уровень опыта', { exact: true }).fill('Начинающий')
      await drawer.getByLabel('Дата рождения', { exact: true }).fill('15.05.1990')
      await drawer.getByLabel('Дата рождения', { exact: true }).press('Enter')
    }
    if (resource === 'horses') {
      await drawer.getByLabel('Масть', { exact: true }).fill('Гнедая')
      await drawer.getByRole('combobox', { name: 'Статус', exact: true }).press('ArrowDown')
      await page.getByTitle('Отдых', { exact: true }).click()
    }
    if (resource === 'trainers') await drawer.getByLabel('Цвет в расписании', { exact: true }).fill('#724C39')
    await drawer.getByRole('button', { name: 'Сохранить', exact: true }).click()
    await expect(drawer.getByRole('alert')).toContainText('Запись изменилась')
    await expect(drawer.getByLabel(label, { exact: true })).toHaveValue('Обновленная')
    fail = false
    await drawer.getByRole('button', { name: 'Сохранить', exact: true }).click()
    await expect(drawer).toBeHidden()
    await expect(card).toContainText('Обновленная')
    expect(payload?.name).toBe(resource === 'clients' ? 'Обновленная запись' : 'Обновленная')
    if (resource === 'clients') expect(payload?.birthDate).toBe('1990-05-15')
    if (resource === 'horses') { expect(payload?.status).toBe('rest'); expect(payload?.isUnavailable).toBe(true) }
    await card.getByRole('button', { name: 'Close', exact: true }).click()
    await expect(page.getByRole('button', { name: resource === 'clients' ? 'Обновленная запись' : 'Обновленная', exact: true })).toBeVisible()
  })
}

for (const resource of ['clients', 'horses', 'trainers']) test(`read-only ${resource} card does not expose editing`, async ({ page }) => {
  await login(page, true)
  await page.route(`**/api/${resource}?*`, route => route.fulfill({ json: [{ id, name: 'Клиент', createdAt: '2026-10-01' }], headers: { 'x-total-count': '1' } }))
  await page.route(`**/api/${resource}/${id}`, route => route.fulfill({ json: { id, name: 'Клиент', memberships: [], boardingContracts: [], bookings: [], payments: [], healthLogs: [] } }))
  await page.route('**/api/bookings/horse-issues?*', route => route.fulfill({ json: [], headers: { 'x-total-count': '0' } }))
  await page.goto(`/${resource}`)
  await page.getByRole('button', { name: 'Клиент', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Редактировать', exact: true })).toHaveCount(0)
})

for (const width of [1440, 390]) test(`staff profile edits update the list at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 900 })
  await login(page)
  let record = { id, userId: id, fullName: 'Сотрудник', roleTitle: 'Тренер', phone: '+79991234567', scheduleColor: '#724C39', shiftRate: '1000', lessonRate: null, groupLessonRate: null, lessonPercentage: null, isActive: true }
  await page.route('**/api/staff?*', route => route.fulfill({ json: { data: [record], total: 1 } }))
  await page.route(`**/api/staff/${id}`, route => {
    expect(route.request().method()).toBe('PATCH')
    record = { ...record, ...route.request().postDataJSON() }
    return route.fulfill({ json: record })
  })
  await page.goto('/staff?tab=rates')
  await page.getByRole('button', { name: /Редактировать/, exact: false }).click()
  const drawer = page.getByRole('dialog', { name: /Редактирование сотрудника/ })
  await drawer.getByLabel('ФИО', { exact: true }).fill('Новый сотрудник')
  await drawer.getByLabel('Телефон', { exact: true }).fill('+79995554433')
  await drawer.getByLabel('Цвет в расписании', { exact: true }).fill('#336699')
  await drawer.getByRole('button', { name: 'Сохранить', exact: true }).click()
  await expect(drawer).toBeHidden()
  await expect(page.getByText('Новый сотрудник', { exact: true })).toBeVisible()
  expect(record.phone).toBe('+79995554433')
  expect(record.scheduleColor).toBe('#336699')
})

for (const width of [1024, 1440, 1920]) test(`sidebar remains stationary at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 600 })
  await login(page)
  await page.route('**/api/clients?*', route => route.fulfill({ json: Array.from({ length: 10 }, (_, i) => ({ id: `${id}${i}`, name: `Клиент ${i}`, createdAt: '2026-10-01', preferences: 'Длинная заметка '.repeat(25) })), headers: { 'x-total-count': '10' } }))
  await page.goto('/clients')
  await expect(page.getByRole('button', { name: 'Клиент 0', exact: true })).toBeVisible()
  const sidebar = page.locator('.crm-sidebar')
  const before = await sidebar.boundingBox()
  await page.locator('main').evaluate(el => { el.scrollTop = el.scrollHeight })
  expect(await page.locator('main').evaluate(el => el.scrollTop)).toBeGreaterThan(0)
  expect(await sidebar.boundingBox()).toEqual(before)
  expect(before?.y).toBe(0)
  expect(before?.height).toBe(600)
  await page.screenshot({ path: `test-results/sidebar-${width}.png` })
})
