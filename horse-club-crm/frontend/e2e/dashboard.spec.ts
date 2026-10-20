import { test, expect, type Page, type Locator } from './fixtures'

test.use({ timezoneId: 'America/New_York' })
test.setTimeout(45000)
const modules = ['SCHEDULE', 'CASHBOX', 'STABLES', 'VETERINARY', 'STAFF_PAYROLL']
const client = { id: 'client', name: 'Анна Орлова', phone: '+79991234567' }

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
    upcomingLessons: state.completed ? [] : [{ id: 'lesson', startTime: '2026-10-20T09:00:00Z', endTime: '2026-10-20T10:00:00Z', trainer: { name: 'Мария Волкова' }, service: { name: 'Выездка', title: 'Индивидуальная тренировка' }, bookings: [{ client, horse: { name: 'Валдай' } }] }],
  } }))
  for (const [resource, rows] of Object.entries({ clients: [client], horses: [{ id: 'horse', name: 'Валдай', status: 'active', healthStatus: 'HEALTHY' }], trainers: [{ id: 'trainer', name: 'Мария Волкова', isActive: true }], arenas: [{ id: 'arena', name: 'Манеж', isActive: true }], services: [{ id: 'service', name: 'Выездка', title: 'Выездка', durationMinutes: 60, price: '500' }] })) {
    await page.route(`**/api/${resource}?*`, route => route.fulfill({ json: rows, headers: { 'x-total-count': String(rows.length) } }))
  }
  await page.route('**/api/bookings/availability?*', route => route.fulfill({ json: { horseWorkloads: [{ horseId: 'horse', currentWorkloadMinutes: 0, maxDailyWorkloadMinutes: 240, status: 'AVAILABLE' }], arenaOccupancy: [] } }))
  await page.route('**/api/payments/cash-desk/options/*', route => route.fulfill({ json: { bookings: [], memberships: [] } }))
  await page.route('**/api/staff?*', route => route.fulfill({ json: { data: [{ id: 'staff', userId: 'user', fullName: 'Мария Волкова', roleTitle: 'Тренер', isActive: true }], total: 1 } }))
  await page.route('**/api/boarding-contracts/availability?*', route => route.fulfill({ json: { horses: [{ id: 'horse', name: 'Валдай' }], stalls: [{ id: 'stall', name: 'Денник 1' }] } }))
  await page.route('**/api/lessons', route => {
    state.calls++
    if (state.failure) return route.fulfill({ status: 409, json: { message: 'Тренер уже занят' } })
    expect(route.request().postDataJSON()).toMatchObject({ clientId: 'client', horseId: 'horse', trainerId: 'trainer', serviceId: 'service', startTime: '2026-10-20T09:00:00.000Z' })
    state.lessons++; return route.fulfill({ status: 201, json: { id: 'new-lesson' } })
  })
  await page.route('**/api/payments/cash-desk', route => {
    expect(route.request().postDataJSON()).toMatchObject({ clientId: 'client', amount: 500, method: 'CASH', cashGiven: 500 })
    state.cash += 500; return route.fulfill({ status: 201, json: { method: 'CASH', cashChange: '0' } })
  })
  return state
}

async function choose(page: Page, drawer: Locator, label: string, value: string) {
  const input = drawer.getByRole('combobox', { name: label, exact: true })
  await input.click()
  await input.fill(value)
  await page.locator('.ant-select-dropdown:visible .ant-select-item-option').filter({ hasText: value }).first().click()
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

for (const width of [1440, 390]) test(`creates a guest inside lesson drawer and retains lesson fields at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 900 })
  await setup(page)
  const posts: unknown[] = []
  await page.route('**/api/clients/quick', route => {
    posts.push(route.request().postDataJSON())
    return route.fulfill({ status: 201, json: { id: 'new-guest', name: 'Гость клуба', clientType: 'ONE_TIME', phone: null } })
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
  expect(saved).toMatchObject({ clientId: 'new-guest', horseId: 'horse', trainerId: 'trainer', serviceId: 'service' })
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

test('timeline completion refreshes progress and removes the finished lesson', async ({ page }) => {
  const state = await setup(page)
  await page.route('**/api/lessons/lesson/status', route => { state.completed++; return route.fulfill({ json: { id: 'lesson', bookings: [] } }) })
  await page.goto('/')
  await page.getByRole('button', { name: 'Завершено', exact: true }).click()
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
  await page.route('**/api/bookings/availability?*', route => route.fulfill({ json: { horseWorkloads: [{ horseId: 'horse', currentWorkloadMinutes: 240, maxDailyWorkloadMinutes: 240, status: 'AT_LIMIT' }], arenaOccupancy: [] } }))
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
