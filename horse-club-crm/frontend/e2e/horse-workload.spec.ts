import { openCalendarLesson } from './openCalendarLesson'
import { test, expect, type Locator, type Page } from './fixtures'

const horse = { id: '00000000-0000-4000-8000-000000000901', name: 'Валдай', maxDailyMinutes: 120, isUnavailable: false }
const client = { id: '00000000-0000-4000-8000-000000000903', name: 'Анна Орлова', firstName: 'Анна', lastName: 'Орлова' }
const trainer = { id: '00000000-0000-4000-8000-000000000904', name: 'Мария' }
const service = { id: '00000000-0000-4000-8000-000000000905', name: 'Выездка', title: 'Выездка', durationMinutes: 60, maxCapacity: 2, allowMembership: false }
const lesson = { id: '00000000-0000-4000-8000-000000000906', startTime: '2026-10-08T07:00:00Z', endTime: '2026-10-08T08:00:00Z', status: 'SCHEDULED',
  trainer, service, arena: null, bookings: [{ id: '00000000-0000-4000-8000-000000000907', client, horse, membership: null }] }
const workloads = (date: string | null, exclude?: string | null) => [
  { horseId: '00000000-0000-4000-8000-000000000901', horseName: 'Валдай', currentWorkloadMinutes: date === '2026-10-09' ? 100 : exclude === '00000000-0000-4000-8000-000000000906' ? 0 : 60,
    maxDailyWorkloadMinutes: 120, status: 'AVAILABLE' },
  { horseId: '00000000-0000-4000-8000-000000000902', horseName: 'Буран', currentWorkloadMinutes: 120, maxDailyWorkloadMinutes: 240, status: 'AVAILABLE' },
]

test.beforeEach(async ({ page }) => {
  await page.route('**/api/bookings/horse-issues?*', route => route.fulfill({ json: [], headers: { 'x-total-count': '0' } }))
  await page.route('**/api/bookings?*', route => route.fulfill({ json: [], headers: { 'x-total-count': '0' } }))
  await page.route('**/api/bookings/availability?*', route => {
    const from = new URL(route.request().url()).searchParams.get('from')
    const date = from ? new Date(from).toLocaleDateString('en-CA', { timeZone: 'Europe/Moscow' }) : '2026-10-08'
    return route.fulfill({ json: { date, horseWorkloads: workloads(date), arenaOccupancy: [] } })
  })
  await page.route(`**/api/clients/${client.id}`, route => route.fulfill({ json: { ...client, memberships: [] } }))
  await page.clock.setFixedTime(new Date('2026-10-08T09:00:00Z'))
  await page.addInitScript(() => {
    localStorage.setItem('horsecrm.access_token', 'cookie-session')
    localStorage.setItem('horsecrm.role', 'ADMIN')
    localStorage.setItem('horsecrm.email', 'qa@example.com')
  })
  await page.route('**/api/settings/club-schedule', route => route.fulfill({ json: { openTime: '09:00', closeTime: '21:00', daysOfWeekOff: [] } }))
  for (const [resource, data] of Object.entries({ clients: [client], horses: [horse, { ...horse, id: '00000000-0000-4000-8000-000000000902', name: 'Буран', maxDailyMinutes: 240 }], trainers: [trainer], services: [service], arenas: [] })) {
    await page.route(`**/api/${resource}?*`, route => route.fulfill({ json: data, headers: { 'x-total-count': String(data.length) } }))
  }
  await page.route('**/api/lessons?*', route => route.fulfill({ json: [lesson] }))
  await page.route('**/api/horses/workload?*', route => {
    const params = new URL(route.request().url()).searchParams
    return route.fulfill({ json: workloads(params.get('date'), params.get('excludeLessonId')) })
  })
})

async function selectOption(page: Page, modal: Locator, label: string, text: string) {
  const input = modal.getByLabel(label, { exact: true }).last()
  await input.focus()
  await input.press('ArrowDown')
  await page.locator('.ant-select-dropdown:visible .ant-select-item-option').filter({ hasText: text }).last().click()
}

async function setStart(page: Page, modal: Locator, value: string) {
  const input = modal.locator('.ant-picker-input input').first()
  await input.fill(value)
  await input.press('Enter')
  await expect(page.locator('.booking-date-popup:visible')).toHaveCount(0)
}

async function openBooking(page: Page) {
  await page.goto('/schedule')
  await openCalendarLesson(page)
  const modal = page.getByRole('dialog', { name: 'Записать на тренировку' })
  await selectOption(page, modal, 'Услуга', 'Выездка')
  await selectOption(page, modal, 'Тренер', 'Мария')
  await selectOption(page, modal, 'Клиент', 'Анна Орлова')
  await selectOption(page, modal, 'Лошадь', 'Валдай')
  return modal
}

for (const width of [1280, 320, 768]) {
  test(`daily widget, event badge and overload guard at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 })
    const modal = await openBooking(page)
    const save = modal.getByRole('button', { name: 'Записать на тренировку', exact: true })
    await expect(save).toBeEnabled()
    await modal.getByRole('spinbutton').first().fill('61')
    await expect(modal.getByText('Лошадь недоступна или превышен дневной лимит. Выберите другую лошадь или время.')).toBeVisible()
    await expect(save).toBeDisabled()
    await expect(page.locator('.ant-select-dropdown:visible')).toHaveCount(0)
    await modal.getByRole('alert').first().scrollIntoViewIfNeeded()
    await page.screenshot({ path: `test-results/horse-overload-${width}.png`, animations: 'disabled' })
    await modal.getByRole('spinbutton').first().fill('60')
    await expect(save).toBeEnabled()
    await modal.getByRole('button', { name: 'Закрыть', exact: true }).click()
    await page.getByRole('dialog', { name: 'Закрыть без сохранения?' }).getByRole('button', { name: 'Закрыть', exact: true }).click()
    await page.getByRole('button', { name: 'Нагрузка лошадей', exact: true }).click()
    const panel = page.getByRole('dialog', { name: 'Нагрузка лошадей · 08.10.2026' })
    await expect(panel.getByText('60 / 120 мин', { exact: true })).toBeVisible()
    await panel.getByRole('button', { name: 'Close', exact: true }).click()
    await expect(page.locator('.fc-event .horse-workload-badge')).toHaveCount(0)
    await page.locator('.fc-event').first().click()
    const detail = page.getByRole('dialog', { name: 'Карточка занятия' })
    await expect(detail.locator('.horse-workload-badge').first()).toHaveText('60 / 120 мин')
    await detail.getByRole('button', { name: 'Close', exact: true }).click()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  })
}

test('changing booking date recalculates options and blocks overload on the destination day', async ({ page }) => {
  const modal = await openBooking(page)
  await setStart(page, modal, '09.10.2026 12:00')
  await expect(modal.getByText('Лошадь недоступна или превышен дневной лимит. Выберите другую лошадь или время.')).toBeVisible()
  await expect(modal.getByRole('button', { name: 'Записать на тренировку', exact: true })).toBeDisabled()
})

test('transfer excludes the original lesson, preserves participants and sends only time and duration', async ({ page }) => {
  let payload: unknown
  await page.route('**/api/lessons/00000000-0000-4000-8000-000000000906/reschedule', async route => {
    payload = route.request().postDataJSON()
    await route.fulfill({ json: { ...lesson, startTime: '2026-10-08T09:00:00Z', endTime: '2026-10-08T11:00:00Z' } })
  })
  await page.goto('/schedule')
  await page.locator('.fc-event').first().click()
  await page.getByRole('button', { name: 'Перенести занятие', exact: true }).click()
  const modal = page.getByRole('dialog', { name: 'Перенос занятия', exact: true })
  await expect(modal.getByRole('spinbutton').first()).toBeVisible()
  await expect(modal.getByLabel('Услуга', { exact: true })).toBeDisabled()
  await setStart(page, modal, '08.10.2026 12:00')
  await modal.getByRole('spinbutton').first().fill('120')
  await modal.getByRole('button', { name: 'Сохранить перенос', exact: true }).click()
  await expect(modal).not.toBeVisible()
  expect(payload).toEqual({ startTime: '2026-10-08T09:00:00.000Z', durationMinutes: 120, trainerId: trainer.id })
})

test('API failure blocks selected horses, supports retry and empty daily state', async ({ page }) => {
  const modal = await openBooking(page)
  let fail = true
  await page.route('**/api/bookings/availability?*', route => route.fulfill(fail
    ? { status: 500, json: { message: 'Данные временно недоступны' } }
    : { json: { horseWorkloads: workloads('2026-10-09'), arenaOccupancy: [] } }))
  await setStart(page, modal, '09.10.2026 12:00')
  await expect(modal.getByRole('alert').filter({ hasText: 'Данные временно недоступны' })).toBeVisible()
  await expect(modal.getByRole('button', { name: 'Записать на тренировку', exact: true })).toBeDisabled()
  fail = false
  await modal.getByRole('button', { name: 'Повторить', exact: true }).click()
  await expect(modal.getByText('Лошадь недоступна или превышен дневной лимит. Выберите другую лошадь или время.')).toBeVisible()
  await modal.getByRole('button', { name: 'Закрыть', exact: true }).click()
  await page.getByRole('dialog', { name: 'Закрыть без сохранения?' }).getByRole('button', { name: 'Закрыть', exact: true }).click()
  await page.route('**/api/horses/workload?*', route => route.fulfill({ json: [] }))
  await page.route('**/api/bookings/availability?*', route => route.fulfill({ json: { horseWorkloads: [], arenaOccupancy: [] } }))
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
  let release!: () => void
  const gate = new Promise<void>(resolve => { release = resolve })
  let started = false
  await page.route('**/api/bookings/availability?*', async route => {
    const date = new URL(route.request().url()).searchParams.get('from')?.slice(0, 10) ?? ''
    if (date === '2026-10-09') { started = true; await gate }
    await route.fulfill({ json: { horseWorkloads: workloads(date), arenaOccupancy: [] } })
  })
  await setStart(page, modal, '09.10.2026 12:00')
  await expect.poll(() => started).toBe(true)
  await expect(modal.getByRole('button', { name: 'Записать на тренировку', exact: true })).toBeDisabled()
  await setStart(page, modal, '10.10.2026 12:00')
  await expect(modal.getByRole('button', { name: 'Записать на тренировку', exact: true })).toBeEnabled()
  release()
  await expect(modal.locator('.ant-picker-input input').first()).toHaveValue('10.10.2026 12:00')
  await expect(modal.getByRole('button', { name: 'Записать на тренировку', exact: true })).toBeEnabled()
})

test('service availability is a soft warning and refreshes when the service changes', async ({ page }) => {
  const horses = [{ ...horse, allowGroup: false, allowWalk: true }]
  await page.route('**/api/horses?*', route => route.fulfill({ json: horses, headers: { 'x-total-count': '1' } }))
  await page.route('**/api/services?*', route => route.fulfill({ json: [service,
    { ...service, id: '00000000-0000-4000-8000-000000000908', title: 'Прогулка', name: 'Прогулка' }], headers: { 'x-total-count': '2' } }))
  test.setTimeout(40_000)
  const modal = await test.step('open booking with flagged horse', () => openBooking(page))
  await expect(modal.getByRole('status').filter({ hasText: 'отключено в карточке лошади' })).toContainText('Групповые занятия')
  await expect(modal.getByTitle('Валдай · направление отключено', { exact: true })).toBeVisible()
  const availability = page.waitForRequest(request => request.url().includes('/bookings/availability?') && new URL(request.url()).searchParams.get('serviceDirection') === 'allowWalk')
  await test.step('change service', () => selectOption(page, modal, 'Услуга', 'Прогулка'))
  await test.step('refresh availability for walk', () => availability)
  await expect(modal.getByRole('status').filter({ hasText: 'отключено в карточке лошади' })).toHaveCount(0)
})
