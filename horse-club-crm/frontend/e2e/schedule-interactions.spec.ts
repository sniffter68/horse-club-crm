import { test, expect, type Page } from './fixtures'

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const trainer = { id: id(1), name: 'Мария', fullName: 'Мария Волкова', isActive: true, maxParallelLessons: 2 }
const secondTrainer = { ...trainer, id: id(2), name: 'Олег', fullName: 'Олег Петров' }
const horse = { id: id(3), name: 'Валдай', status: 'active', isUnavailable: false, maxRiderWeight: 85, requiredRestMinutes: 0, minRestMinutes: 0, maxDailyWorkloadMinutes: 240, maxDailyMinutes: 240 }
const arena = { id: id(4), name: 'Крытый манеж', isActive: true, isUnavailable: false, capacity: 6, maxRidersCapacity: 6 }
const client = { id: id(5), name: 'Анна Орлова', firstName: 'Анна', lastName: 'Орлова', phone: '+79991234567', weightKg: 70, memberships: [] }
const initialBooking = { id: id(6), clientId: client.id, horseId: horse.id, trainerId: trainer.id, arenaId: arena.id, membershipId: null, startTime: '2026-11-06T06:00:00Z', endTime: '2026-11-06T07:00:00Z', serviceType: 'dressage', costAmount: '1500', status: 'scheduled', client, horse, trainer, arena }

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 1100 })
  await page.clock.setFixedTime(new Date('2026-11-06T06:00:00Z'))
  await page.addInitScript(() => { localStorage.setItem('horsecrm.access_token', 'cookie-session'); localStorage.setItem('horsecrm.role', 'ADMIN'); localStorage.setItem('horsecrm.email', 'qa@example.com') })
  await page.route('**/api/settings/club-schedule', route => route.fulfill({ json: { openTime: '09:00', closeTime: '21:00', daysOfWeekOff: [] } }))
  for (const [resource, rows] of Object.entries({ trainers: [trainer, secondTrainer], horses: [horse], arenas: [arena], clients: [client], services: [] })) {
    await page.route(`**/api/${resource}?*`, route => route.fulfill({ json: rows, headers: { 'x-total-count': String(rows.length) } }))
  }
  await page.route(`**/api/clients/${client.id}`, route => route.fulfill({ json: client }))
  await page.route('**/api/lessons?*', route => route.fulfill({ json: [] }))
  await page.route('**/api/horses/workload?*', route => route.fulfill({ json: [] }))
  await page.route('**/api/bookings?*', route => route.fulfill({ json: [], headers: { 'x-total-count': '0' } }))
  await page.route('**/api/bookings/horse-issues?*', route => route.fulfill({ json: [], headers: { 'x-total-count': '0' } }))
  await page.route('**/api/bookings/availability?*', route => route.fulfill({ json: { horseWorkloads: [{ horseId: horse.id, currentWorkloadMinutes: 0, maxDailyWorkloadMinutes: 240, status: 'AVAILABLE' }], arenaOccupancy: [] } }))
})

async function board(page: Page, label = 'По тренерам') {
  await page.goto('/schedule')
  const grouping = page.getByRole('combobox', { name: 'Группировка расписания' })
  await grouping.focus(); await grouping.press('ArrowDown'); await page.getByTitle(label, { exact: true }).click()
  await expect(page.locator('.ant-select-dropdown:visible')).toHaveCount(0)
  await expect(page.locator('.resource-lane').first()).toBeVisible()
}

for (const width of [1280, 375]) test(`quick slot booking and advanced form preserve the slot at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 900 })
  let payload: Record<string, unknown> | undefined
  await page.route('**/api/bookings', async route => { payload = route.request().postDataJSON() as Record<string, unknown>; await route.fulfill({ json: { id: id(9) } }) })
  await board(page)
  const slot = page.getByRole('button', { name: 'Забронировать: Мария Волкова, 09:15', exact: true })
  await expect(slot).toBeEnabled()
  await slot.click()
  const popup = page.locator('.ant-popover:visible')
  await expect(popup).toContainText('09:15–10:15')
  const input = popup.getByRole('combobox', { name: 'Клиент', exact: true })
  await input.fill('7999')
  await expect(page.locator('.ant-select-dropdown:visible').getByText('+79991234567')).toBeVisible()
  await input.press('Enter')
  const horses = popup.getByRole('combobox', { name: 'Лошадь', exact: true })
  await horses.focus(); await horses.press('ArrowDown'); await page.locator('.ant-select-dropdown:visible').getByTitle('Валдай', { exact: true }).click()
  await page.screenshot({ path: `test-results/quick-slot-${width}.png` })
  await popup.getByRole('button', { name: 'Расширенные параметры' }).click()
  const advanced = page.getByRole('dialog', { name: 'Бронирование тройного ресурса', exact: true })
  await expect(advanced.getByLabel('Начало', { exact: true })).toHaveValue('06.11.2026 09:15')
  await expect(advanced).toContainText('Анна Орлова')
  await advanced.locator('.ant-modal-close').click()
  await slot.click()
  const clientSelect = popup.getByRole('combobox', { name: 'Клиент', exact: true })
  await clientSelect.focus(); await clientSelect.press('ArrowDown'); await page.locator('.ant-select-dropdown:visible .ant-select-item-option').first().click()
  await horses.focus(); await horses.press('ArrowDown'); await page.locator('.ant-select-dropdown:visible').getByTitle('Валдай', { exact: true }).click()
  await popup.getByRole('button', { name: 'Записать', exact: true }).click()
  await expect(popup).toHaveCount(0)
  expect(payload).toMatchObject({ trainerId: trainer.id, arenaId: arena.id, clientId: client.id, horseId: horse.id, startTime: '2026-11-06T06:15:00.000Z', endTime: '2026-11-06T07:15:00.000Z' })
})

for (const failure of [false, true]) test(`native drag reassigns trainer with optimistic update and ${failure ? 'rollback' : 'save'}`, async ({ page }) => {
  let booking = { ...initialBooking }
  await page.route('**/api/bookings?*', route => route.fulfill({ json: [booking], headers: { 'x-total-count': '1' } }))
  let patch: Record<string, unknown> | undefined
  let release: (() => void) | undefined
  const gate = new Promise<void>(resolve => { release = resolve })
  await page.route(`**/api/bookings/${booking.id}`, async route => {
    patch = route.request().postDataJSON() as Record<string, unknown>
    await gate
    if (failure) await route.fulfill({ status: 409, json: { code: 'HORSE_BUSY', message: 'Лошадь уже занята' } })
    else { booking = { ...booking, ...patch, trainer: secondTrainer }; await route.fulfill({ json: booking }) }
  })
  await board(page)
  const source = page.locator('.resource-booking')
  await expect(source).toHaveAttribute('draggable', 'true')
  const before = await page.locator('.resource-board').boundingBox()
  const target = page.getByRole('button', { name: 'Забронировать: Олег Петров, 10:15', exact: true })
  await source.scrollIntoViewIfNeeded()
  await source.dragTo(target, { sourcePosition: { x: 10, y: 10 }, targetPosition: { x: 10, y: 10 } })
  await expect.poll(() => patch).toBeTruthy()
  expect(patch).toMatchObject({ trainerId: secondTrainer.id, startTime: '2026-11-06T07:15:00.000Z', endTime: '2026-11-06T08:15:00.000Z' })
  await expect(page.locator('.resource-column').nth(1).locator('.resource-booking')).toHaveCount(1)
  const after = await page.locator('.resource-board').boundingBox()
  expect(after?.width).toBe(before?.width)
  release?.()
  if (failure) {
    await expect(page.getByText('Лошадь уже занята в это время. Выберите другую лошадь или интервал.')).toBeVisible()
    await expect(page.locator('.resource-column').first().locator('.resource-booking')).toHaveCount(1)
  } else await expect(page.getByText('Занятие перенесено', { exact: true })).toBeVisible()
})

test('horse conflict is rejected before PATCH and read-only disables slot creation and dragging', async ({ page }) => {
  const occupied = { ...initialBooking, id: id(7), startTime: '2026-11-06T07:15:00Z', endTime: '2026-11-06T08:15:00Z', trainerId: secondTrainer.id, trainer: secondTrainer }
  await page.route('**/api/bookings?*', route => route.fulfill({ json: [initialBooking, occupied], headers: { 'x-total-count': '2' } }))
  let writes = 0
  await page.route(`**/api/bookings/${initialBooking.id}`, route => { writes++; return route.fulfill({ json: initialBooking }) })
  await board(page)
  await page.locator('.resource-column').first().locator('.resource-booking').dragTo(page.getByRole('button', { name: 'Забронировать: Мария Волкова, 10:15', exact: true }), { sourcePosition: { x: 10, y: 10 }, targetPosition: { x: 10, y: 10 } })
  await expect(page.getByText('Лошадь уже занята в это время', { exact: true })).toBeVisible()
  expect(writes).toBe(0)
  await page.route('**/api/settings/my-permissions*', route => route.fulfill({ json: { role: 'MANAGER', modules: [{ module: 'SCHEDULE', isEnabled: true, accessLevel: 'READ_ONLY' }] } }))
  await page.addInitScript(() => localStorage.setItem('horsecrm.role', 'MANAGER'))
  await board(page)
  await expect(page.locator('.resource-booking').first()).toHaveAttribute('draggable', 'false')
  await expect(page.locator('.resource-slot').first()).toBeDisabled()
})

test('trainer capacity uses reservations outside the visible filters', async ({ page }) => {
  const occupied = [7, 8].map(n => ({ ...initialBooking, id: id(n), horseId: id(n + 10), horse: { ...horse, id: id(n + 10) }, trainerId: secondTrainer.id, trainer: secondTrainer, startTime: '2026-11-06T07:15:00Z', endTime: '2026-11-06T08:15:00Z' }))
  await page.route('**/api/bookings?*', route => {
    const url = new URL(route.request().url())
    const rows = url.searchParams.get('from')?.startsWith('2026-11-06T07:15') ? occupied : [initialBooking]
    return route.fulfill({ json: rows, headers: { 'x-total-count': String(rows.length) } })
  })
  let writes = 0
  await page.route(`**/api/bookings/${initialBooking.id}`, route => { writes++; return route.fulfill({ json: initialBooking }) })
  await board(page)
  await expect(page.locator('.resource-booking')).toHaveAttribute('draggable', 'true')
  await page.locator('.resource-booking').dragTo(page.getByRole('button', { name: 'Забронировать: Олег Петров, 10:15', exact: true }), { sourcePosition: { x: 10, y: 10 }, targetPosition: { x: 10, y: 10 } })
  await expect(page.getByText('У тренера достигнут максимум одновременных всадников (2)', { exact: true })).toBeVisible()
  expect(writes).toBe(0)
})

test('legacy lesson moves vertically and between arenas through the lesson endpoint', async ({ page }) => {
  const secondArena = { ...arena, id: id(20), name: 'Плац' }
  const lesson = { id: id(21), startTime: initialBooking.startTime, endTime: initialBooking.endTime, status: 'SCHEDULED', trainer, arena,
    service: { id: id(22), name: 'Выездка', title: 'Выездка', durationMinutes: 60, maxCapacity: 1, allowMembership: false }, bookings: [{ id: id(23), client, horse, membership: null }] }
  await page.route('**/api/arenas?*', route => route.fulfill({ json: [arena, secondArena], headers: { 'x-total-count': '2' } }))
  await page.route('**/api/lessons?*', route => route.fulfill({ json: [lesson] }))
  let patch: Record<string, unknown> | undefined
  await page.route(`**/api/lessons/${lesson.id}/reschedule`, route => { patch = route.request().postDataJSON() as Record<string, unknown>; return route.fulfill({ json: lesson }) })
  await board(page, 'По локациям')
  await expect(page.locator('.resource-booking')).toHaveAttribute('draggable', 'true')
  await page.locator('.resource-booking').dragTo(page.getByRole('button', { name: 'Забронировать: Плац, 10:15', exact: true }), { sourcePosition: { x: 10, y: 10 }, targetPosition: { x: 10, y: 10 } })
  await expect.poll(() => patch).toBeTruthy()
  expect(patch).toEqual({ startTime: '2026-11-06T07:15:00.000Z', durationMinutes: 60, trainerId: trainer.id, arenaId: secondArena.id })
})

test('quick form keeps values after failure and Escape returns focus to its slot', async ({ page }) => {
  await page.route('**/api/bookings', route => route.fulfill({ status: 409, json: { code: 'CLIENT_BUSY', message: 'Клиент занят' } }))
  await board(page)
  const slot = page.getByRole('button', { name: 'Забронировать: Мария Волкова, 09:15', exact: true })
  await expect(slot).toBeEnabled(); await slot.focus(); await slot.press('Enter')
  const popup = page.locator('.ant-popover:visible')
  const select = popup.getByRole('combobox', { name: 'Клиент', exact: true })
  await select.fill('Анна')
  await expect(page.locator('.ant-select-dropdown:visible .ant-select-item-option').filter({ hasText: 'Анна Орлова' })).toHaveCount(1)
  await select.press('Enter')
  const horses = popup.getByRole('combobox', { name: 'Лошадь', exact: true })
  await horses.focus(); await horses.press('ArrowDown'); await page.locator('.ant-select-dropdown:visible').getByTitle('Валдай', { exact: true }).click()
  await popup.getByRole('button', { name: 'Записать', exact: true }).click()
  await expect(popup.getByRole('alert')).toContainText('Клиент уже записан')
  await expect(popup).toContainText('Анна Орлова')
  await popup.getByRole('button', { name: 'Расширенные параметры' }).focus()
  await page.keyboard.press('Escape')
  await expect(popup).toHaveCount(0); await expect(slot).toBeFocused()
})
