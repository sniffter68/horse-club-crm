import { test, expect, type Locator, type Page } from '@playwright/test'

const horse = { id: 'h1', name: 'Валдай', status: 'active', isUnavailable: false, maxRiderWeight: 85, maxDailyWorkloadMinutes: 120, requiredRestMinutes: 45, maxDailyMinutes: 120, minRestMinutes: 45 }
const trainer = { id: 't1', name: 'Мария', fullName: 'Мария Волкова', specializations: ['Выездка'], isActive: true }
const client = { id: 'c1', name: 'Анна Орлова', firstName: 'Анна', lastName: 'Орлова', phone: '+79991234567', weightKg: '75.00', membership: { planName: 'Клубный', remainingUnits: 5, totalUnits: 8 } }
const arena = { id: 'a1', name: 'Крытый манеж', capacity: 6, maxRidersCapacity: 6, isActive: true, isUnavailable: false }
const booking = { id: 'booking1', clientId: 'c1', horseId: 'h1', trainerId: 't1', arenaId: 'a1', membershipId: null, startTime: '2026-10-09T07:00:00Z', endTime: '2026-10-09T08:00:00Z', serviceType: 'dressage', costAmount: '1500', status: 'scheduled', client, horse, trainer, arena }
test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-10-09T06:00:00Z'))
  await page.addInitScript(() => { localStorage.setItem('horsecrm.access_token', 'cookie-session'); localStorage.setItem('horsecrm.role', 'ADMIN'); localStorage.setItem('horsecrm.email', 'qa@example.com') })
  await page.route('**/api/settings/club-schedule', route => route.fulfill({ json: { openTime: '09:00', closeTime: '21:00', daysOfWeekOff: [] } }))
  for (const [resource, data] of Object.entries({ clients: [client, { ...client, id: 'c2', name: 'Борис', firstName: 'Борис', lastName: '', weightKg: '95' }], horses: [horse, { ...horse, id: 'h2', name: 'Буран', maxRiderWeight: 110 }], trainers: [trainer], arenas: [arena], services: [] })) {
    await page.route(`**/api/${resource}?*`, route => route.fulfill({ json: data, headers: { 'x-total-count': String(data.length) } }))
  }
  await page.route('**/api/clients/c*', route => route.fulfill({ json: { ...client, memberships: [{ id: 'm1', type: 'fixed_lessons', title: 'Клубный', totalLessons: 8, remainedLessons: 5, validUntil: '2099-01-01', initialUnits: '8', remainingUnits: '7' }, { id: 'm2', type: 'deposit', title: 'Депозит', totalLessons: 0, remainedLessons: 0, validUntil: '2020-01-01', validTo: '2099-01-01', remainingUnits: '2500.50', initialUnits: '5000' }] } }))
  await page.route('**/api/lessons?*', route => route.fulfill({ json: [] }))
  await page.route('**/api/horses/workload?*', route => route.fulfill({ json: [] }))
  await page.route('**/api/bookings?*', route => route.fulfill({ json: [], headers: { 'x-total-count': '0' } }))
  await page.route('**/api/bookings/availability?*', route => route.fulfill({ json: { date: '2026-10-09', horseWorkloads: [{ horseId: 'h1', horseName: 'Валдай', currentWorkloadMinutes: 60, maxDailyWorkloadMinutes: 120, status: 'AVAILABLE' }], arenaOccupancy: [{ arenaId: 'a1', occupied: 2, maxRidersCapacity: 6 }] } }))
})
async function choose(page: Page, modal: Locator, field: string, starts: string) {
  const input = modal.getByRole('combobox', { name: field, exact: true })
  await input.focus()
  await input.fill(starts)
  await expect(page.locator('.ant-select-dropdown:visible .ant-select-item-option').filter({ hasText: starts }).first()).toBeVisible()
  await input.press('Enter')
  await expect(page.locator('.ant-select-dropdown:visible')).toHaveCount(0)
}
async function openFilled(page: Page) {
  await page.goto('/schedule')
  await page.getByRole('button', { name: 'Новое бронирование', exact: true }).click()
  const modal = page.getByRole('dialog', { name: 'Бронирование тройного ресурса', exact: true })
  await choose(page, modal, 'Клиент', 'Анна Орлова')
  await choose(page, modal, 'Лошадь', 'Валдай')
  await choose(page, modal, 'Тренер', 'Мария Волкова')
  await choose(page, modal, 'Локация', 'Крытый манеж')
  return modal
}
test('creates a real triad payload, preserves precision and refreshes the calendar', async ({ page }) => {
  let created = false
  await page.route('**/api/bookings', async route => {
    const body = route.request().postDataJSON()
    expect(body).toMatchObject({ clientId: 'c1', horseId: 'h1', trainerId: 't1', arenaId: 'a1', serviceType: 'dressage', costAmount: 1500.5 })
    expect(body.startTime).toBe('2026-10-09T06:00:00.000Z'); expect(body.endTime).toBe('2026-10-09T07:00:00.000Z')
    created = true; await route.fulfill({ status: 201, json: booking })
  })
  await page.route('**/api/bookings?*', route => route.fulfill({ json: created ? [booking] : [], headers: { 'x-total-count': created ? '1' : '0' } }))
  const modal = await openFilled(page)
  await expect(modal.getByText('5 / 8 занятий', { exact: true })).toBeVisible()
  await expect(modal.getByText(/2.*500,5 ₽ на депозите/)).toBeVisible()
  await modal.getByLabel('Стоимость, ₽', { exact: true }).fill('1500.50')
  await modal.getByRole('button', { name: 'Создать бронирование', exact: true }).click()
  await expect(modal).toHaveCount(0)
  await expect(page.locator('.fc-event').filter({ hasText: 'Валдай' })).toBeVisible()
})
for (const [code, field] of [['HORSE_OVERLOADED', 'Лошадь'], ['HORSE_REST_VIOLATION', 'Лошадь'], ['RIDER_WEIGHT_EXCEEDED', 'Лошадь'], ['TRAINER_BUSY', 'Тренер'], ['ARENA_FULL', 'Локация']]) {
  test(`409 ${code} preserves form and highlights ${field}`, async ({ page }) => {
    await page.route('**/api/bookings', route => route.fulfill({ status: 409, json: { code, message: 'Conflict' } }))
    const modal = await openFilled(page)
    await modal.getByRole('button', { name: 'Создать бронирование', exact: true }).click()
    await expect(modal.getByRole('alert').first()).not.toContainText('Conflict')
    await expect(modal.getByRole('combobox', { name: field, exact: true })).toHaveAttribute('aria-invalid', 'true')
    await expect(modal.getByLabel('Начало', { exact: true })).toHaveValue('09.10.2026 09:00')
    await expect(modal.getByRole('button', { name: 'Создать бронирование', exact: true })).toBeEnabled()
  })
}
test('weight mismatch warns after changing client and prevents an invalid save', async ({ page }) => {
  const modal = await openFilled(page)
  await choose(page, modal, 'Клиент', 'Борис')
  await expect(modal.getByRole('alert').filter({ hasText: 'Вес всадника' })).toBeVisible()
  await expect(modal.getByRole('button', { name: 'Создать бронирование', exact: true })).toBeDisabled()
  await choose(page, modal, 'Лошадь', 'Буран')
  await expect(modal.getByRole('button', { name: 'Создать бронирование', exact: true })).toBeEnabled()
})
test('resource groupings show riders, arena capacity and the 45-minute rest buffer', async ({ page }) => {
  await page.route('**/api/bookings?*', route => route.fulfill({ json: [booking], headers: { 'x-total-count': '1' } }))
  await page.goto('/schedule')
  const grouping = page.getByRole('combobox', { name: 'Группировка расписания' })
  for (const label of ['По тренерам', 'По лошадям', 'По локациям']) {
    await grouping.focus(); await page.keyboard.press('ArrowDown'); await page.getByTitle(label, { exact: true }).click()
    await expect(page.getByRole('region', { name: 'Расписание по ресурсам' })).toBeVisible()
    await expect(page.locator('.resource-booking').filter({ hasText: 'Анна Орлова' })).toBeVisible()
    if (label === 'По лошадям') { await expect(page.getByText('Отдых 45 мин', { exact: true })).toBeVisible(); await expect(page.getByText('60 / 120 мин', { exact: true })).toBeVisible() }
    if (label === 'По локациям') await expect(page.getByText('Пик за день: 2 / 6 всадников')).toBeVisible()
  }
})
test('edits a scheduled booking through PATCH, excluding its own reservation from availability', async ({ page }) => {
  await page.route('**/api/bookings?*', route => route.fulfill({ json: [booking], headers: { 'x-total-count': '1' } }))
  let excluded = false
  await page.route('**/api/bookings/availability?*', route => { excluded ||= new URL(route.request().url()).searchParams.get('excludeBookingId') === 'booking1'; return route.fulfill({ json: { date: '2026-10-09', horseWorkloads: [], arenaOccupancy: [] } }) })
  await page.route('**/api/bookings/booking1', route => { expect(route.request().method()).toBe('PATCH'); return route.fulfill({ json: booking }) })
  await page.goto('/schedule'); await page.locator('.fc-event').filter({ hasText: 'Валдай' }).click()
  await page.getByRole('button', { name: 'Редактировать бронирование' }).click()
  const modal = page.getByRole('dialog', { name: 'Редактирование бронирования' })
  await modal.getByLabel('Стоимость, ₽', { exact: true }).fill('2000')
  await modal.getByRole('button', { name: 'Сохранить бронирование' }).click()
  await expect(modal).toHaveCount(0); expect(excluded).toBe(true)
})
for (const width of [320, 768]) test(`modal, authored select and resource board fit ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 900 })
  await page.route('**/api/bookings?*', route => route.fulfill({ json: [booking], headers: { 'x-total-count': '1' } }))
  const modal = await openFilled(page)
  await modal.getByRole('combobox', { name: 'Локация', exact: true }).focus()
  await page.keyboard.press('ArrowDown')
  await expect(page.locator('.ant-select-dropdown:visible').filter({ hasText: 'Крытый манеж' })).toBeVisible()
  await page.screenshot({ path: `test-results/triad-modal-${width}.png`, animations: 'disabled' })
  await page.keyboard.press('Escape')
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  await modal.getByLabel('Начало', { exact: true }).click()
  const picker = page.locator('.triad-date-popup:visible')
  await expect(picker).toBeVisible()
  const bounds = await picker.boundingBox()
  expect(bounds!.x).toBeGreaterThanOrEqual(0)
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width + 1)
  await page.screenshot({ path: `test-results/triad-date-${width}.png`, animations: 'disabled' })
  await page.keyboard.press('Escape')
  await modal.getByRole('button', { name: 'Отмена', exact: true }).click()
  await page.getByRole('button', { name: 'Закрыть без сохранения', exact: true }).click()
  const grouping = page.getByRole('combobox', { name: 'Группировка расписания' })
  await grouping.focus(); await page.keyboard.press('ArrowDown')
  await page.getByTitle('По лошадям', { exact: true }).click()
  await expect(page.locator('.ant-select-dropdown:visible')).toHaveCount(0)
  await expect(page.getByRole('region', { name: 'Расписание по ресурсам' })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  await page.screenshot({ path: `test-results/triad-board-${width}.png`, animations: 'disabled' })
  await page.getByRole('region', { name: 'Расписание по ресурсам' }).scrollIntoViewIfNeeded()
  await page.screenshot({ path: `test-results/triad-board-detail-${width}.png`, animations: 'disabled' })
})

test('availability failure retains the draft and supports retry', async ({ page }) => {
  let fails = true
  await page.route('**/api/bookings/availability?*', route => route.fulfill(fails
    ? { status: 503, json: { message: 'Временная недоступность' } }
    : { json: { date: '2026-10-09', horseWorkloads: [], arenaOccupancy: [] } }))
  const modal = await openFilled(page)
  await expect(modal.getByRole('button', { name: 'Создать бронирование' })).toBeDisabled()
  fails = false
  await modal.getByRole('button', { name: /Повторить/ }).click()
  await expect(modal.getByRole('button', { name: 'Создать бронирование' })).toBeEnabled()
  await expect(modal.getByRole('combobox', { name: 'Клиент', exact: true })).toBeVisible()
})

test('trainer reads resource schedule without mutation controls', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('horsecrm.role', 'TRAINER'))
  await page.route('**/api/bookings?*', route => route.fulfill({ json: [booking], headers: { 'x-total-count': '1' } }))
  await page.goto('/schedule')
  await expect(page.getByRole('button', { name: 'Новое бронирование' })).toHaveCount(0)
  await page.locator('.fc-event').filter({ hasText: 'Валдай' }).click()
  await expect(page.getByRole('dialog', { name: 'Карточка бронирования' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Редактировать бронирование' })).toHaveCount(0)
})

test('resource selectors support pointer selection after asynchronous balance loading', async ({ page }) => {
  await page.goto('/schedule')
  await page.getByRole('button', { name: 'Новое бронирование', exact: true }).click()
  const modal = page.getByRole('dialog', { name: 'Бронирование тройного ресурса', exact: true })
  for (const [field, label] of [['Клиент', 'Анна Орлова'], ['Лошадь', 'Валдай'], ['Тренер', 'Мария Волкова'], ['Локация', 'Крытый манеж']]) {
    await modal.locator('.ant-select').filter({ has: page.getByRole('combobox', { name: field, exact: true }) }).click()
    await page.locator('.ant-select-dropdown:visible .ant-select-item-option').filter({ hasText: label }).first().click()
    await expect(page.locator('.ant-select-dropdown:visible')).toHaveCount(0)
    if (field === 'Клиент') await expect(modal.getByText('5 / 8 занятий', { exact: true })).toBeVisible()
  }
  await expect(modal.getByRole('button', { name: 'Создать бронирование' })).toBeEnabled()
})
