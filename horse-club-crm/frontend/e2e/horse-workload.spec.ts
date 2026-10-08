import { test, expect, type Locator, type Page } from '@playwright/test'

const horse = { id: 'h1', name: 'Валдай', maxDailyMinutes: 120, isUnavailable: false }
const client = { id: 'c1', name: 'Анна Орлова', firstName: 'Анна', lastName: 'Орлова' }
const trainer = { id: 't1', name: 'Мария' }
const service = { id: 's1', name: 'Выездка', title: 'Выездка', durationMinutes: 60, maxCapacity: 2, allowMembership: false }
const lesson = { id: 'lesson-a', startTime: '2026-10-08T07:00:00Z', endTime: '2026-10-08T08:00:00Z', status: 'SCHEDULED',
  trainer, service, arena: null, bookings: [{ id: 'b1', client, horse, membership: null }] }
const workloads = (date: string | null, exclude?: string | null) => [
  { horseId: 'h1', horseName: 'Валдай', currentWorkloadMinutes: date === '2026-10-09' ? 100 : exclude === 'lesson-a' ? 0 : 60,
    maxDailyWorkloadMinutes: 120, status: 'AVAILABLE' },
  { horseId: 'h2', horseName: 'Буран', currentWorkloadMinutes: 120, maxDailyWorkloadMinutes: 240, status: 'AVAILABLE' },
]

test.beforeEach(async ({ page }) => {
  await page.route('**/api/bookings?*', route => route.fulfill({ json: [], headers: { 'x-total-count': '0' } }))
  await page.route('**/api/bookings/availability?*', route => {
    const date = new URL(route.request().url()).searchParams.get('from')?.slice(0, 10) || '2026-10-08'
    return route.fulfill({ json: { date, horseWorkloads: workloads('2026-10-08'), arenaOccupancy: [] } })
  })
  await page.clock.setFixedTime(new Date('2026-10-08T09:00:00Z'))
  await page.addInitScript(() => {
    localStorage.setItem('horsecrm.access_token', 'cookie-session')
    localStorage.setItem('horsecrm.role', 'ADMIN')
    localStorage.setItem('horsecrm.email', 'qa@example.com')
  })
  await page.route('**/api/settings/club-schedule', route => route.fulfill({ json: { openTime: '09:00', closeTime: '21:00', daysOfWeekOff: [] } }))
  for (const [resource, data] of Object.entries({ clients: [client], horses: [horse, { ...horse, id: 'h2', name: 'Буран', maxDailyMinutes: 240 }], trainers: [trainer], services: [service], arenas: [] })) {
    await page.route(`**/api/${resource}?*`, route => route.fulfill({ json: data, headers: { 'x-total-count': String(data.length) } }))
  }
  await page.route('**/api/lessons?*', route => route.fulfill({ json: [lesson] }))
  await page.route('**/api/horses/workload?*', route => {
    const params = new URL(route.request().url()).searchParams
    return route.fulfill({ json: workloads(params.get('date'), params.get('excludeLessonId')) })
  })
})

async function selectOption(page: Page, modal: Locator, label: string, text: string) {
  await modal.getByLabel(label, { exact: true }).click()
  await page.getByTitle(text, { exact: true }).last().click()
}

async function openBooking(page: Page) {
  await page.goto('/schedule')
  await page.getByRole('button', { name: 'Новое занятие', exact: true }).click()
  const modal = page.getByRole('dialog', { name: 'Быстрое бронирование' })
  await selectOption(page, modal, 'Услуга', 'Выездка')
  await selectOption(page, modal, 'Тренер', 'Мария')
  await selectOption(page, modal, 'Клиент', 'Анна Орлова')
  await selectOption(page, modal, 'Лошадь участника', 'Валдай — 60 / 120 мин')
  return modal
}

for (const width of [1280, 320, 768]) {
  test(`daily widget, event badge and overload guard at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 })
    const modal = await openBooking(page)
    const save = modal.getByRole('button', { name: 'Создать занятие', exact: true })
    await expect(save).toBeEnabled()
    await modal.getByLabel('Длительность, мин', { exact: true }).fill('61')
    await expect(modal.getByText('Внимание: суммарная нагрузка лошади составит 121 мин (лимит 120 мин)')).toBeVisible()
    await expect(save).toBeDisabled()
    await expect(page.locator('.ant-select-dropdown:visible')).toHaveCount(0)
    await modal.locator('.horse-workload-warning').scrollIntoViewIfNeeded()
    await page.screenshot({ path: `test-results/horse-overload-${width}.png`, animations: 'disabled' })
    await modal.getByLabel('Длительность, мин', { exact: true }).fill('60')
    await expect(save).toBeEnabled()
    await modal.getByRole('button', { name: 'Close', exact: true }).click()
    await page.getByRole('button', { name: 'Нагрузка лошадей', exact: true }).click()
    const panel = page.getByRole('dialog', { name: 'Нагрузка лошадей · 08.10.2026' })
    await expect(panel.getByText('60 / 120 мин', { exact: true })).toBeVisible()
    await panel.getByRole('button', { name: 'Close', exact: true }).click()
    await expect(page.locator('.fc-event .horse-workload-badge').first()).toHaveText('60 / 120 мин')
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  })
}

test('changing booking date recalculates options and blocks overload on the destination day', async ({ page }) => {
  const modal = await openBooking(page)
  await modal.getByLabel('Время начала', { exact: true }).fill('2026-10-09T12:00')
  await expect(modal.getByTitle('Валдай — 100 / 120 мин', { exact: true })).toBeVisible()
  await expect(modal.getByText('Внимание: суммарная нагрузка лошади составит 160 мин (лимит 120 мин)')).toBeVisible()
  await expect(modal.getByRole('button', { name: 'Создать занятие', exact: true })).toBeDisabled()
})

test('transfer excludes the original lesson, preserves participants and sends only time and duration', async ({ page }) => {
  let payload: unknown
  await page.route('**/api/lessons/lesson-a/reschedule', async route => {
    payload = route.request().postDataJSON()
    await route.fulfill({ json: { ...lesson, startTime: '2026-10-08T09:00:00Z', endTime: '2026-10-08T11:00:00Z' } })
  })
  await page.goto('/schedule')
  await page.locator('.fc-event').first().click()
  await page.getByRole('button', { name: 'Перенести занятие', exact: true }).click()
  const modal = page.getByRole('dialog', { name: 'Перенос занятия', exact: true })
  await expect(modal.getByText('Доступно: 120 из 120 мин', { exact: true })).toBeVisible()
  await expect(modal.getByLabel('Лошадь участника', { exact: true })).toBeDisabled()
  await modal.getByLabel('Время начала', { exact: true }).fill('2026-10-08T12:00')
  await modal.getByLabel('Длительность, мин', { exact: true }).fill('120')
  await modal.getByRole('button', { name: 'Сохранить перенос', exact: true }).click()
  await expect(modal).not.toBeVisible()
  expect(payload).toEqual({ startTime: '2026-10-08T09:00:00.000Z', durationMinutes: 120 })
})

test('API failure blocks selected horses, supports retry and empty daily state', async ({ page }) => {
  const modal = await openBooking(page)
  let fail = true
  await page.route('**/api/horses/workload?*', route => route.fulfill(fail
    ? { status: 500, json: { message: 'Данные временно недоступны' } }
    : { json: workloads('2026-10-09') }))
  await modal.getByLabel('Время начала', { exact: true }).fill('2026-10-09T12:00')
  await expect(modal.getByText('Не удалось проверить нагрузку лошадей')).toBeVisible()
  await expect(modal.getByRole('button', { name: 'Создать занятие', exact: true })).toBeDisabled()
  fail = false
  await modal.getByRole('button', { name: 'Повторить проверку', exact: true }).click()
  await expect(modal.getByText('Доступно: 20 из 120 мин')).toBeVisible()
  await modal.getByRole('button', { name: 'Close', exact: true }).click()
  await page.route('**/api/horses/workload?*', route => route.fulfill({ json: [] }))
  await page.route('**/api/bookings/availability?*', route => route.fulfill({ json: { date: '2026-10-08', horseWorkloads: [], arenaOccupancy: [] } }))
  await page.getByRole('button', { name: 'Нагрузка лошадей', exact: true }).click()
  const panel = page.getByRole('dialog', { name: /Нагрузка лошадей/ })
  await panel.getByRole('button', { name: 'Обновить нагрузку', exact: true }).click()
  await expect(panel.getByText('Лошадей пока нет')).toBeVisible()
})

test('calendar date control refreshes the daily widget and navigation updates its date', async ({ page }) => {
  await page.goto('/schedule')
  await page.getByLabel('Дата нагрузки', { exact: true }).fill('2026-10-09')
  await page.getByRole('button', { name: 'Нагрузка лошадей', exact: true }).click()
  const panel = page.getByRole('dialog', { name: 'Нагрузка лошадей · 09.10.2026' })
  await expect(panel.getByText('100 / 120 мин', { exact: true })).toBeVisible()
  await panel.getByRole('button', { name: 'Close', exact: true }).click()
  await page.locator('.fc-next-button').click()
  await expect(page.getByLabel('Дата нагрузки', { exact: true })).not.toHaveValue('2026-10-09')
})

test('slow date lookup disables save and a superseded response cannot replace the new date', async ({ page }) => {
  const modal = await openBooking(page)
  let release: (() => void) | undefined
  const gate = new Promise<void>(resolve => { release = resolve })
  await page.route('**/api/horses/workload?*', async route => {
    const date = new URL(route.request().url()).searchParams.get('date')
    if (date === '2026-10-09') await gate
    await route.fulfill({ json: workloads(date) })
  })
  await modal.getByLabel('Время начала', { exact: true }).fill('2026-10-09T12:00')
  await expect(modal.locator('.ant-spin-spinning')).toBeVisible()
  await expect(modal.getByRole('button', { name: 'Создать занятие', exact: true })).toBeDisabled()
  await modal.getByLabel('Время начала', { exact: true }).fill('2026-10-10T12:00')
  await expect(modal.getByText('Доступно: 60 из 120 мин')).toBeVisible()
  release?.()
  await expect(modal.getByText('Валдай — 60 / 120 мин', { exact: true })).toBeVisible()
  await expect(modal.getByRole('button', { name: 'Создать занятие', exact: true })).toBeEnabled()
})
