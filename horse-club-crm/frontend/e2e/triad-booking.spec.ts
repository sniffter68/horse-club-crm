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
  for (const name of ['Завершить', 'Неявка (No-show)', 'Отменить']) await expect(page.getByRole('button', { name, exact: true })).toHaveCount(0)
})

for (const [action, label, confirmation, status, statusLabel] of [
  ['complete', 'Завершить', 'Завершить и списать', 'completed', 'Проведено'],
  ['no-show', 'Неявка (No-show)', 'Зафиксировать неявку', 'no_show', 'Неявка'],
]) test(`lifecycle ${action} confirms billing, refreshes calendar and locks the terminal outcome`, async ({ page }) => {
  let current = booking
  await page.route('**/api/bookings?*', route => route.fulfill({ json: [current], headers: { 'x-total-count': '1' } }))
  await page.route(`**/api/bookings/booking1/${action}`, route => { expect(route.request().method()).toBe('PATCH'); current = { ...booking, status }; return route.fulfill({ json: current }) })
  await page.goto('/schedule'); await page.locator('.fc-event').filter({ hasText: 'Валдай' }).click()
  const detail = page.getByRole('dialog', { name: 'Карточка бронирования' })
  await detail.getByRole('button', { name: label, exact: true }).click()
  await expect(page.getByText(/С абонемента на занятия спишется 1 занятие/)).toBeVisible()
  await page.getByRole('button', { name: confirmation, exact: true }).click()
  await expect(detail).not.toBeVisible()
  await expect(page.locator('.fc-event').filter({ hasText: statusLabel })).toBeVisible()
  await page.locator('.fc-event').filter({ hasText: 'Валдай' }).click()
  await expect(detail.getByRole('button', { name: 'Завершить', exact: true })).toHaveCount(0)
  await expect(detail.getByRole('button', { name: 'Редактировать бронирование' })).toBeDisabled()
})

for (const kind of ['penalty', 'free', 'club']) test(`cancellation ${kind} explains policy and submits the initiator and reason`, async ({ page }) => {
  await page.clock.setFixedTime(new Date(kind === 'free' ? '2026-10-08T18:00:00Z' : '2026-10-09T02:00:00Z'))
  let payload: unknown
  await page.route('**/api/bookings?*', route => route.fulfill({ json: [booking], headers: { 'x-total-count': '1' } }))
  await page.route('**/api/bookings/booking1/cancel', route => { payload = route.request().postDataJSON(); return route.fulfill({ json: { ...booking, status: kind === 'club' ? 'cancelled_club' : kind === 'free' ? 'cancelled_client' : 'penalty_cancellation' } }) })
  await page.goto('/schedule'); await page.locator('.fc-event').filter({ hasText: 'Валдай' }).click()
  await page.getByRole('dialog', { name: 'Карточка бронирования' }).getByRole('button', { name: 'Отменить', exact: true }).click()
  const modal = page.getByRole('dialog', { name: 'Отмена бронирования' })
  if (kind === 'club') {
    const initiator = modal.getByRole('combobox', { name: 'Инициатор отмены' })
    await initiator.focus(); await initiator.press('ArrowDown'); await page.getByTitle('Клуб', { exact: true }).click()
    await expect(modal.getByText(/Привязанный абонемент продлится на 7 дней/)).toBeVisible()
  }
  if (kind === 'penalty') await expect(modal.getByRole('alert').filter({ hasText: 'менее 12 часов' })).toBeVisible()
  else await expect(modal.getByText(/Будет применено штрафное списание занятия/)).toHaveCount(0)
  await modal.getByLabel('Причина отмены', { exact: true }).fill(' Изменение планов ')
  await modal.getByRole('button', { name: 'Подтвердить отмену' }).click()
  await expect(modal).not.toBeVisible()
  expect(payload).toEqual({ cancelledBy: kind === 'club' ? 'club' : 'client', reason: 'Изменение планов' })
})

test('billing conflict keeps details open and permits an idempotent retry', async ({ page }) => {
  let calls = 0
  await page.route('**/api/bookings?*', route => route.fulfill({ json: [booking], headers: { 'x-total-count': '1' } }))
  await page.route('**/api/bookings/booking1/complete', route => route.fulfill(++calls === 1
    ? { status: 409, json: { code: 'MEMBERSHIP_INSUFFICIENT', message: 'Недостаточно занятий или средств на абонементе' } }
    : { json: { ...booking, status: 'completed' } }))
  await page.goto('/schedule'); await page.locator('.fc-event').filter({ hasText: 'Валдай' }).click()
  const detail = page.getByRole('dialog', { name: 'Карточка бронирования' })
  for (let attempt = 0; attempt < 2; attempt++) {
    await detail.getByRole('button', { name: 'Завершить', exact: true }).click()
    await page.getByRole('button', { name: 'Завершить и списать', exact: true }).click()
    if (!attempt) await expect(detail.getByRole('alert')).toContainText('Недостаточно занятий')
  }
  await expect(detail).not.toBeVisible(); expect(calls).toBe(2)
})

test('mobile cancellation validates reason and retains it on API failure', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 900 })
  await page.route('**/api/bookings?*', route => route.fulfill({ json: [booking], headers: { 'x-total-count': '1' } }))
  await page.route('**/api/bookings/booking1/cancel', route => route.fulfill({ status: 409, json: { message: 'Недостаточно занятий или средств на абонементе' } }))
  await page.goto('/schedule'); await page.locator('.fc-event').filter({ hasText: 'Валдай' }).click()
  await page.getByRole('dialog', { name: 'Карточка бронирования' }).getByRole('button', { name: 'Отменить', exact: true }).click()
  const modal = page.getByRole('dialog', { name: 'Отмена бронирования' })
  await modal.getByRole('button', { name: 'Подтвердить отмену' }).click()
  await expect(modal.getByText('Укажите причину отмены')).toBeVisible()
  await modal.getByLabel('Причина отмены', { exact: true }).fill('Изменение планов')
  await modal.getByRole('button', { name: 'Подтвердить отмену' }).click()
  await expect(modal.getByRole('alert').filter({ hasText: 'Недостаточно занятий' })).toBeVisible()
  await expect(modal.getByLabel('Причина отмены', { exact: true })).toHaveValue('Изменение планов')
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  await page.screenshot({ path: 'test-results/booking-cancellation-320.png', animations: 'disabled' })
})

test('pending billing prevents closing, editing and duplicate status requests', async ({ page }) => {
  let resolve!: () => void, calls = 0
  const gate = new Promise<void>(done => { resolve = done })
  await page.route('**/api/bookings?*', route => route.fulfill({ json: [booking], headers: { 'x-total-count': '1' } }))
  await page.route('**/api/bookings/booking1/complete', async route => { calls++; await gate; await route.fulfill({ json: { ...booking, status: 'completed' } }) })
  await page.goto('/schedule'); await page.locator('.fc-event').filter({ hasText: 'Валдай' }).click()
  const detail = page.getByRole('dialog', { name: 'Карточка бронирования' })
  await detail.getByRole('button', { name: 'Завершить', exact: true }).click()
  await page.getByRole('button', { name: 'Завершить и списать' }).click()
  await expect(detail.getByRole('button', { name: 'Редактировать бронирование' })).toBeDisabled()
  await page.keyboard.press('Escape'); await expect(detail).toBeVisible()
  expect(calls).toBe(1); resolve(); await expect(detail).not.toBeVisible()
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

for (const width of [1280, 375]) {
  test(`replaces horse after Rules Engine conflict at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 })
    let attempts = 0
    let current = booking
    await page.route('**/api/bookings?*', route => route.fulfill({ json: [current], headers: { 'x-total-count': '1' } }))
    await page.route('**/api/bookings/booking1/horse', async route => {
      expect(route.request().method()).toBe('PATCH')
      expect(route.request().postDataJSON()).toEqual({ horseId: 'h2', reason: 'Хромота' })
      attempts++
      if (attempts === 1) return route.fulfill({ status: 409, json: { code: 'HORSE_REST_VIOLATION', message: 'Лошадь не успеет отдохнуть' } })
      current = { ...booking, horseId: 'h2', horse: { ...horse, id: 'h2', name: 'Буран' } }
      return route.fulfill({ json: current })
    })
    await page.goto('/schedule')
    await page.locator('.fc-event').first().click()
    await page.getByRole('button', { name: 'Заменить лошадь', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: 'Заменить лошадь', exact: true })
    await choose(page, dialog, 'Новая лошадь', 'Буран')
    await dialog.getByLabel('Причина замены').fill('Хромота')
    await dialog.getByRole('button', { name: 'Заменить лошадь', exact: true }).click()
    await expect(dialog.getByRole('alert')).toContainText('Лошадь не успеет отдохнуть')
    await expect(dialog.getByLabel('Причина замены')).toHaveValue('Хромота')
    await dialog.getByRole('button', { name: 'Заменить лошадь', exact: true }).click()
    await expect(dialog).not.toBeVisible()
    await expect(page.locator('.fc-event').filter({ hasText: 'Буран' }).first()).toBeVisible()
    expect(attempts).toBe(2)
  })
}
