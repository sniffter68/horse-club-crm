import { test, expect } from './fixtures'

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-11-17T06:00:00Z'))
})

const id = '11111111-1111-4111-8111-111111111111'
const trainers = [{ id: '00000000-0000-4000-8000-000000000001', name: 'Мария' }, { id: '00000000-0000-4000-8000-000000000002', name: 'Иван' }]
const lesson = { id, trainerId: '00000000-0000-4000-8000-000000000001', startTime: '2026-11-17T07:00:00Z', endTime: '2026-11-17T08:00:00Z', status: 'SCHEDULED', isOwn: true, trainerNote: null,
  trainer: trainers[0], arena: { id: '00000000-0000-4000-8000-000000000003', name: 'Манеж' }, bookings: [{ id: '00000000-0000-4000-8000-000000000004', client: { id: '00000000-0000-4000-8000-000000000005', name: 'Анна' }, horse: { id: '00000000-0000-4000-8000-000000000006', name: 'Валдай' }, clientConfirmed: false }] }

test('trainer creation permissions refresh after a role change and fail closed', async ({ page }) => {
  await page.addInitScript(() => { localStorage.setItem('horsecrm.access_token', 'cookie-session'); localStorage.setItem('horsecrm.email', 'trainer@test.local'); localStorage.setItem('horsecrm.role', 'TRAINER') })
  let allowed = false, failure = false
  await page.route('**/api/settings/access/me*', route => failure ? route.fulfill({ status: 500, json: { message: 'Не удалось загрузить права' } }) : route.fulfill({ json: {
    role: 'TRAINER', userId: id, trainerId: trainers[0].id, permissions: { lessonCreateOwn: allowed, lessonCreateAny: allowed, horseReplaceOwn: false, horseReplaceAny: false, healthRead: true, healthWrite: false, financeRead: false, boardingAccess: true },
  } }))
  await page.goto('/trainer')
  const create = page.getByRole('button', { name: 'Записать на тренировку', exact: true })
  await expect(page.getByRole('heading', { name: 'Расписание клуба' })).toBeVisible()
  await expect(create).toHaveCount(0)
  allowed = true
  await page.evaluate(() => window.dispatchEvent(new Event('role-access-changed')))
  await expect(create).toBeVisible()
  allowed = false
  await page.evaluate(() => window.dispatchEvent(new Event('role-access-changed')))
  await expect(create).toHaveCount(0)
  failure = true
  await page.evaluate(() => window.dispatchEvent(new Event('role-access-changed')))
  await expect(create).toHaveCount(0)
})

for (const statusToSave of ['COMPLETED', 'NO_SHOW'] as const) for (const width of [390, 1440]) test(`trainer shared board, ownership, retry and duplicate prevention ${statusToSave} ${width}`, async ({ page }) => {
  await page.setViewportSize({ width, height: 844 })
  await page.addInitScript(() => { localStorage.setItem('horsecrm.access_token', 'cookie-session'); localStorage.setItem('horsecrm.email', 'trainer@test.local'); localStorage.setItem('horsecrm.role', 'TRAINER') })
  let status = 'SCHEDULED', calls = 0, fail = true
  let release!: () => void
  const pending = new Promise<void>(resolve => { release = resolve })
  const label = statusToSave === 'COMPLETED' ? 'Проведено' : 'Неявка'
  await page.route('**/api/workspace/trainer-board?*', route => route.fulfill({ json: { date: '2026-11-17', timeZone: 'Europe/Moscow', trainerId: '00000000-0000-4000-8000-000000000001', trainers, openTime: '09:00', closeTime: '21:00', horses: [],
    lessons: [{ ...lesson, status }, { ...lesson, id: '00000000-0000-4000-8000-000000000007', trainerId: '00000000-0000-4000-8000-000000000002', trainer: trainers[1], isOwn: false, bookings: [{ ...lesson.bookings[0], client: null }] }] } }))
  await page.route(`**/api/lessons/${id}/trainer-status`, async route => {
    calls++
    expect(route.request().postDataJSON()).toEqual({ status: statusToSave, trainerNote: 'Лёгкая работа' })
    if (fail) return route.fulfill({ status: 409, json: { message: 'Обновите расписание' } })
    status = statusToSave
    await pending
    return route.fulfill({ json: { id, status, isOwn: true, trainerNote: 'Лёгкая работа' } })
  })
  await page.goto('/dashboard')
  await expect(page).toHaveURL(/\/trainer$/)
  await expect(page.getByRole('heading', { name: 'Расписание клуба' })).toBeVisible()
  await expect(page.locator('.crm-sidebar')).toHaveCount(0)
  await expect(page.locator('.cash-desk-header')).toHaveCount(0)
  const own = page.locator('.board-lesson-own')
  const foreign = page.locator('.board-lesson').filter({ hasText: 'Иван' })
  await expect(foreign.getByRole('button')).toHaveCount(0)
  await own.getByRole('textbox').fill('Лёгкая работа')
  await own.getByRole('button', { name: label, exact: true }).click()
  await expect(own.getByRole('alert')).toContainText('Обновите расписание')
  await expect(own.getByRole('textbox')).toHaveValue('Лёгкая работа')
  fail = false
  await own.getByRole('button', { name: label, exact: true }).dblclick({ delay: 30 })
  await expect(own.getByRole('button', { name: label, exact: true })).toBeDisabled()
  expect(calls).toBe(2)
  release()
  await expect(own.getByRole('button')).toHaveCount(0)
  expect(calls).toBe(2)
  await page.getByText('Только мои', { exact: true }).click()
  await expect(page.getByRole('columnheader', { name: 'Иван', exact: true })).toHaveCount(0)
  await page.getByText('Все тренеры', { exact: true }).click()
  await expect(page.getByRole('columnheader', { name: 'Иван', exact: true })).toBeAttached()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.screenshot({ path: `test-results/workspace-trainer-${statusToSave}-${width}.png`, fullPage: true })
})

test('admin shift summary, filters, week, finance and retry', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.addInitScript(() => { localStorage.setItem('horsecrm.access_token', 'cookie-session'); localStorage.setItem('horsecrm.email', 'admin@test.local'); localStorage.setItem('horsecrm.role', 'ADMIN') })
  let failed = true
  await page.route('**/api/workspace/admin-summary', route => failed ? route.fulfill({ status: 500, json: { message: 'Сводка временно недоступна' } }) : route.fulfill({ json: {
    date: '2026-11-17', generatedAt: '2026-11-17T06:00:00Z', timeZone: 'Europe/Moscow', kpi: { lessonsToday: 1, activeRiders: 9, awaitingConfirmation: 1, newLeads: 0 },
    today: [lesson], week: [lesson, { ...lesson, id: '00000000-0000-4000-8000-000000000008', trainerId: '00000000-0000-4000-8000-000000000002', trainer: trainers[1], startTime: '2026-11-18T07:00:00Z', endTime: '2026-11-18T08:00:00Z' }], unconfirmed: [lesson], leadRequests: [],
    finance: { accrued: '2000', paid: '1500', debt: '500', mainBalance: 4200, boardingBalance: 1800, recognizedMembershipRevenue: '300' },
    actions: [{ id: '00000000-0000-4000-8000-000000000009', action: 'LESSON_CREATED', actorName: 'admin@test.local', createdAt: '2026-11-17T06:00:00Z' }],
  } }))
  await page.goto('/dashboard')
  await expect(page.getByRole('alert').filter({ hasText: 'Сводка временно недоступна' })).toBeVisible()
  failed = false; await page.getByRole('button', { name: 'Повторить', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Хорошей смены!' })).toBeVisible()
  await expect(page.getByText('Финансы за месяц', { exact: true })).toBeVisible()
  await expect(page.locator('.workspace-lesson')).toHaveCount(1)
  await page.getByText('Неделя', { exact: true }).click()
  await expect(page.locator('.workspace-lesson')).toHaveCount(2)
  await page.getByRole('button', { name: 'Иван', exact: true }).click()
  await expect(page.locator('.workspace-lesson')).toHaveCount(1)
  await page.getByRole('button', { name: 'Все тренеры', exact: true }).click()
  await expect(page.locator('.workspace-lesson')).toHaveCount(2)
  await page.screenshot({ path: 'test-results/workspace-admin.png', fullPage: true })
})

test('trainer read-only, empty state and keyboard date picker', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.addInitScript(() => { localStorage.setItem('horsecrm.access_token', 'cookie-session'); localStorage.setItem('horsecrm.email', 'trainer@test.local'); localStorage.setItem('horsecrm.role', 'TRAINER') })
  await page.route('**/api/settings/my-permissions*', route => route.fulfill({ json: { role: 'TRAINER', modules: [{ module: 'SCHEDULE', isEnabled: true, accessLevel: 'READ_ONLY' }] } }))
  let empty = false
  await page.route('**/api/workspace/trainer-board?*', route => route.fulfill({ json: { date: '2026-11-17', trainerId: '00000000-0000-4000-8000-000000000001', trainers, openTime: '09:00', closeTime: '21:00', horses: [], lessons: empty ? [] : [lesson] } }))
  await page.goto('/trainer')
  await expect(page.locator('.board-lesson-own')).toBeVisible()
  await expect(page.locator('.board-lesson-own').getByRole('button')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Записать на тренировку', exact: true })).toHaveCount(0)
  await page.getByLabel('Дата', { exact: true }).focus()
  await page.keyboard.press('Enter')
  await expect(page.locator('.ant-picker-dropdown')).toBeVisible()
  await expect(page.locator('.ant-picker-dropdown').getByText('Сегодня', { exact: true })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.screenshot({ path: 'test-results/workspace-trainer-calendar.png' })
  await page.keyboard.press('Escape')
  await expect(page.locator('.ant-picker-dropdown')).toBeHidden()
  empty = true
  await page.getByRole('button', { name: 'Обновить', exact: true }).click()
  await expect(page.getByText('На эту дату занятий нет')).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
})

test('Telegram shared board uses signed session and hides mutations in read-only mode', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.addInitScript(() => {
    window.Telegram = { WebApp: { initData: 'signed-init', colorScheme: 'light', themeParams: {}, ready() {}, expand() {}, onEvent() {}, offEvent() {} } }
  })
  await page.route('**/api/tma/**', route => {
    const path = new URL(route.request().url()).pathname
    if (path.endsWith('/bootstrap')) return route.fulfill({ json: { role: 'TRAINER', token: 'telegram-session', trainerId: '00000000-0000-4000-8000-000000000001', user: { id, name: 'Мария' }, accessLevel: 'READ_ONLY' } })
    expect(route.request().headers().authorization).toBe('Bearer telegram-session')
    if (path.endsWith('/trainer-board')) return route.fulfill({ json: { date: '2026-11-17', trainerId: '00000000-0000-4000-8000-000000000001', trainers, openTime: '09:00', closeTime: '21:00', lessons: [lesson], horses: [] } })
    return route.fulfill({ json: [] })
  })
  await page.goto('/tma/trainer')
  await page.getByRole('button', { name: 'Общее расписание', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Расписание клуба' })).toBeVisible()
  await expect(page.locator('.board-lesson-own')).toBeVisible()
  await expect(page.locator('.board-lesson-own').getByRole('button')).toHaveCount(0)
  await page.getByRole('button', { name: 'Назад', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Общее расписание', exact: true })).toBeVisible()
})

for (const path of ['/', '/login', '/schedule', '/stable', '/cash-desk', '/payments', '/financial-reports', '/staff', '/settings']) test(`trainer redirects ${path} to workspace without financial requests`, async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.addInitScript(() => {
    localStorage.setItem('horsecrm.access_token', 'cookie-session')
    localStorage.setItem('horsecrm.role', 'TRAINER')
    localStorage.setItem('horsecrm.email', 'trainer@test.local')
  })
  const financialRequests: string[] = []
  page.on('request', request => {
    if (/\/api\/(finance|cashbox|payments)(?:\/|\?)/.test(request.url())) financialRequests.push(request.url())
  })
  const board = page.waitForResponse(response => response.url().includes('/api/workspace/trainer-board?') && response.ok())
  await page.goto(path)
  await board
  await expect(page).toHaveURL(/\/trainer$/)
  await expect(page.getByRole('heading', { name: 'Расписание клуба' })).toBeVisible()
  await expect(page.getByRole('table')).toBeVisible()
  await expect(page.locator('.crm-sidebar, .cash-desk-header')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Принять платёж', exact: true })).toHaveCount(0)
  expect(financialRequests).toEqual([])
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
})

for (const width of [390, 1440]) for (const createAny of [false, true]) test(`trainer creates lesson any=${createAny} with quick client, membership and retry ${width}`, async ({ page }) => {
  await page.setViewportSize({ width, height: 900 })
  await page.addInitScript(() => { localStorage.setItem('horsecrm.access_token', 'cookie-session'); localStorage.setItem('horsecrm.email', 'trainer@test.local'); localStorage.setItem('horsecrm.role', 'TRAINER') })
  const serviceId = '00000000-0000-4000-8000-000000000030'
  const membershipId = '00000000-0000-4000-8000-000000000031'
  const clientId = '00000000-0000-4000-8000-000000000032'
  await page.route('**/api/settings/access/me*', route => route.fulfill({ json: { role: 'TRAINER', userId: id, trainerId: trainers[0].id,
    permissions: { lessonCreateOwn: true, lessonCreateAny: createAny, horseReplaceOwn: true, horseReplaceAny: false, healthRead: true, healthWrite: false, financeRead: false, boardingAccess: true } } }))
  let saved = false, fail = true, posts = 0, boardReads = 0
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.route('**/api/workspace/trainer-board?*', route => {
    boardReads++
    return route.fulfill({ json: { date: '2026-11-17', trainerId: trainers[0].id, trainers, openTime: '09:00', closeTime: '21:00', horses: [], lessons: saved ? [{ ...lesson, bookings: [{ ...lesson.bookings[0], client: { id: clientId, name: 'Гость тренера' }, horse: null }] }] : [] } })
  })
  await page.route('**/api/trainers?*', route => route.fulfill({ json: trainers }))
  await page.route('**/api/services?*', route => route.fulfill({ json: [{ id: serviceId, name: 'Индивидуальное занятие', durationMinutes: 60, allowMembership: true }] }))
  await page.route('**/api/horses?*', route => route.fulfill({ json: [] }))
  await page.route('**/api/arenas?*', route => route.fulfill({ json: [] }))
  await page.route('**/api/clients?*', route => route.fulfill({ json: [] }))
  await page.route('**/api/clients/quick', async route => {
    expect(route.request().postDataJSON()).toMatchObject({ name: 'Гость тренера', phone: '+79001234567', isOneTime: true })
    return route.fulfill({ status: 201, json: { id: clientId, name: 'Гость тренера', clientType: 'ONE_TIME' } })
  })
  await page.route(`**/api/clients/${clientId}/booking-memberships?*`, route => {
    expect(new URL(route.request().url()).searchParams.get('serviceId')).toBe(serviceId)
    return route.fulfill({ json: [{ id: membershipId, title: 'Занятия клуба' }] })
  })
  await page.route('**/api/bookings/availability?*', route => route.fulfill({ json: { horseWorkloads: [], arenaOccupancy: [] } }))
  await page.route('**/api/bookings?*', route => route.fulfill({ json: [] }))
  await page.route('**/api/lessons?*', route => route.fulfill({ json: [{ ...lesson, isOwn: false, trainer: trainers[1], service: { id: serviceId, name: 'Индивидуальное занятие' }, bookings: [{ ...lesson.bookings[0], client: null }] }] }))
  await page.route('**/api/lessons', async route => {
    if (route.request().method() !== 'POST') return route.fulfill({ json: [] })
    posts++
    const payload = route.request().postDataJSON() as Record<string, unknown>
    expect(payload).toMatchObject({ trainerId: trainers[createAny ? 1 : 0].id, serviceId, clientId, membershipId })
    for (const field of ['cost', 'pricePerPerson', 'prepaymentAmount', 'prepaymentMethod']) expect(payload).not.toHaveProperty(field)
    if (fail) return route.fulfill({ status: 409, json: { message: 'Обновите доступность' } })
    saved = true
    return route.fulfill({ status: 201, json: { id, isOwn: true } })
  })
  await page.goto('/trainer')
  await page.getByRole('button', { name: 'Записать на тренировку', exact: true }).click()
  const drawer = page.getByRole('dialog', { name: 'Записать на тренировку' })
  await expect(drawer).toBeVisible()
  const trainerSelect = drawer.getByRole('combobox', { name: 'Тренер', exact: true })
  if (createAny) {
    await expect(trainerSelect).toBeEnabled()
    await trainerSelect.fill('Иван')
    await expect(page.locator('.ant-select-dropdown:visible').getByText(/Иван \(занято/)).toBeVisible()
    await trainerSelect.press('ArrowDown')
    await trainerSelect.press('Enter')
    await expect(drawer.locator('.ant-select-selection-item').filter({ hasText: 'Иван' })).toBeVisible()
  } else await expect(trainerSelect).toBeDisabled()
  await expect(drawer.getByText('Финансовая сводка')).toHaveCount(0)
  await expect(drawer.getByLabel('Стоимость', { exact: true })).toHaveCount(0)
  await drawer.getByRole('combobox', { name: 'Услуга', exact: true }).click()
  await page.getByText('Индивидуальное занятие · 60 мин.', { exact: true }).click()
  await drawer.getByRole('combobox', { name: 'Клиент', exact: true }).click()
  await page.getByRole('button', { name: '⚡ Разовый гость', exact: true }).click()
  const quick = page.getByRole('dialog', { name: 'Разовый гость' })
  await quick.getByRole('textbox', { name: 'Имя', exact: true }).fill('Гость тренера')
  await quick.getByRole('textbox', { name: 'Телефон', exact: true }).fill('+79001234567')
  await quick.getByRole('button', { name: 'Создать и выбрать', exact: true }).click()
  await expect(quick).toBeHidden()
  await drawer.getByRole('combobox', { name: 'Абонемент', exact: true }).click()
  await page.getByText('Занятия клуба', { exact: true }).click()
  const submit = drawer.getByRole('button', { name: 'Записать на тренировку', exact: true })
  await expect(submit).toBeEnabled()
  await expect(drawer.getByText('Не удалось проверить свободные места тренера')).toHaveCount(0)
  await page.keyboard.press('Escape')
  await page.screenshot({ path: `test-results/trainer-booking-drawer-${width}.png`, fullPage: true })
  await submit.click()
  await expect(drawer.getByText('Обновите доступность')).toBeVisible()
  await expect(drawer.getByText('Гость тренера', { exact: false })).toBeVisible()
  fail = false
  await expect(submit).toBeEnabled()
  await submit.click()
  await expect(drawer).toBeHidden()
  await expect(page.locator('.board-lesson-own')).toContainText('Гость тренера')
  expect(posts).toBe(2)
  expect(boardReads).toBeGreaterThan(1)
  expect(errors).toEqual([])
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.screenshot({ path: `test-results/trainer-booking-${width}.png`, fullPage: true })
})
