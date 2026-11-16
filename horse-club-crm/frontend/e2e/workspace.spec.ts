import { test, expect } from './fixtures'

const id = '11111111-1111-4111-8111-111111111111'
const trainers = [{ id: 'trainer-1', name: 'Мария' }, { id: 'trainer-2', name: 'Иван' }]
const lesson = { id, trainerId: 'trainer-1', startTime: '2026-11-17T07:00:00Z', endTime: '2026-11-17T08:00:00Z', status: 'SCHEDULED', isOwn: true, trainerNote: null,
  trainer: trainers[0], arena: { id: 'arena', name: 'Манеж' }, bookings: [{ id: 'booking', client: { id: 'client', name: 'Анна' }, horse: { id: 'horse', name: 'Валдай' }, clientConfirmed: false }] }

for (const width of [390, 1440]) test(`trainer shared board, ownership, retry and duplicate prevention ${width}`, async ({ page }) => {
  await page.setViewportSize({ width, height: 844 })
  await page.addInitScript(() => { localStorage.setItem('horsecrm.access_token', 'cookie-session'); localStorage.setItem('horsecrm.email', 'trainer@test.local'); localStorage.setItem('horsecrm.role', 'TRAINER') })
  let status = 'SCHEDULED', calls = 0, fail = true
  await page.route('**/api/workspace/trainer-board?*', route => route.fulfill({ json: { date: '2026-11-17', timeZone: 'Europe/Moscow', trainerId: 'trainer-1', trainers, openTime: '09:00', closeTime: '21:00', horses: [],
    lessons: [{ ...lesson, status }, { ...lesson, id: 'foreign', trainerId: 'trainer-2', trainer: trainers[1], isOwn: false, bookings: [{ ...lesson.bookings[0], client: null }] }] } }))
  await page.route(`**/api/lessons/${id}/trainer-status`, async route => {
    calls++
    expect(route.request().postDataJSON()).toEqual({ status: 'COMPLETED', trainerNote: 'Лёгкая работа' })
    if (fail) return route.fulfill({ status: 409, json: { message: 'Обновите расписание' } })
    status = 'COMPLETED'
    await new Promise(resolve => setTimeout(resolve, 250))
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
  await own.getByRole('button', { name: 'Проведено', exact: true }).click()
  await expect(own.getByRole('alert')).toContainText('Обновите расписание')
  await expect(own.getByRole('textbox')).toHaveValue('Лёгкая работа')
  fail = false
  await own.getByRole('button', { name: 'Проведено', exact: true }).dblclick({ delay: 30 })
  await expect(own.getByRole('button')).toHaveCount(0)
  expect(calls).toBe(2)
  await page.getByText('Только мои', { exact: true }).click()
  await expect(page.getByRole('columnheader', { name: 'Иван', exact: true })).toHaveCount(0)
  await page.getByText('Все тренеры', { exact: true }).click()
  await expect(page.getByRole('columnheader', { name: 'Иван', exact: true })).toBeAttached()
  await page.screenshot({ path: `test-results/workspace-trainer-${width}.png`, fullPage: true })
})

test('admin shift summary, filters, week, finance and retry', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.addInitScript(() => { localStorage.setItem('horsecrm.access_token', 'cookie-session'); localStorage.setItem('horsecrm.email', 'admin@test.local'); localStorage.setItem('horsecrm.role', 'ADMIN') })
  let failed = true
  await page.route('**/api/workspace/admin-summary', route => failed ? route.fulfill({ status: 500, json: { message: 'Сводка временно недоступна' } }) : route.fulfill({ json: {
    date: '2026-11-17', generatedAt: '2026-11-17T06:00:00Z', timeZone: 'Europe/Moscow', kpi: { lessonsToday: 1, activeRiders: 9, awaitingConfirmation: 1, newLeads: 0 },
    today: [lesson], week: [lesson, { ...lesson, id: 'tomorrow', trainerId: 'trainer-2', trainer: trainers[1], startTime: '2026-11-18T07:00:00Z', endTime: '2026-11-18T08:00:00Z' }], unconfirmed: [lesson], leadRequests: [],
    finance: { accrued: '2000', paid: '1500', debt: '500', mainBalance: 4200, boardingBalance: 1800, recognizedMembershipRevenue: '300' },
    actions: [{ id: 'action', action: 'LESSON_CREATED', actorName: 'admin@test.local', createdAt: '2026-11-17T06:00:00Z' }],
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
  await page.route('**/api/workspace/trainer-board?*', route => route.fulfill({ json: { date: '2026-11-17', trainerId: 'trainer-1', trainers, openTime: '09:00', closeTime: '21:00', horses: [], lessons: empty ? [] : [lesson] } }))
  await page.goto('/trainer')
  await expect(page.locator('.board-lesson-own')).toBeVisible()
  await expect(page.locator('.board-lesson-own').getByRole('button')).toHaveCount(0)
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
    if (path.endsWith('/bootstrap')) return route.fulfill({ json: { role: 'TRAINER', token: 'telegram-session', trainerId: 'trainer-1', user: { id, name: 'Мария' }, accessLevel: 'READ_ONLY' } })
    expect(route.request().headers().authorization).toBe('Bearer telegram-session')
    if (path.endsWith('/trainer-board')) return route.fulfill({ json: { date: '2026-11-17', trainerId: 'trainer-1', trainers, openTime: '09:00', closeTime: '21:00', lessons: [lesson], horses: [] } })
    return route.fulfill({ json: [] })
  })
  await page.goto('/tma/trainer')
  await page.getByRole('button', { name: 'Общая шахматка', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Расписание клуба' })).toBeVisible()
  await expect(page.locator('.board-lesson-own')).toBeVisible()
  await expect(page.locator('.board-lesson-own').getByRole('button')).toHaveCount(0)
  await page.getByRole('button', { name: 'Назад', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Общая шахматка', exact: true })).toBeVisible()
})
