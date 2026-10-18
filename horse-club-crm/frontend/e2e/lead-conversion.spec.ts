import { test, expect, type Page, type Locator } from './fixtures'

test.setTimeout(45000)

const service = { id: 'service', title: 'Индивидуальная тренировка', durationMinutes: 45 }
const lead = { id: 'lead', firstName: 'Анна', phone: '+79991234567', email: null, preferences: 'Новичок', service, createdAt: '2026-10-11T08:00:00Z' }

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => { localStorage.setItem('horsecrm.access_token', 'cookie-session'); localStorage.setItem('horsecrm.role', 'ADMIN'); localStorage.setItem('horsecrm.email', 'qa@example.com') })
  await page.route('**/api/dashboard/summary', route => route.fulfill({ json: {
    generatedAt: '2026-10-11T08:00:00Z', workDay: { date: '2026-10-11', openAt: '2026-10-11T06:00:00Z', closeAt: '2026-10-11T18:00:00Z', timeZone: 'Europe/Moscow' },
    alerts: [], horseWorkloads: [], leadRequests: [lead], kpi: { lessonsTotal: 0, lessonsCompleted: 0, newLeads: 1, activeMemberships: 0 },
  } }))
  for (const [resource, data] of Object.entries({
    trainers: [{ id: 'trainer', name: 'Мария Волкова', isActive: true }, { id: 'inactive', name: 'Неактивный тренер', isActive: false }],
    horses: [{ id: 'horse', name: 'Валдай', isUnavailable: false, status: 'active' }, { id: 'rest', name: 'Лошадь на отдыхе', isUnavailable: false, status: 'rest' }],
    arenas: [{ id: 'arena', name: 'Крытый манеж', isActive: true }], services: [service],
  })) await page.route(`**/api/${resource}?*`, route => route.fulfill({ json: data, headers: { 'x-total-count': String(data.length) } }))
  await page.route('**/api/bookings/availability?*', route => route.fulfill({ json: {
    horseWorkloads: [{ horseId: 'horse', currentWorkloadMinutes: 0, maxDailyWorkloadMinutes: 240, status: 'AVAILABLE' }], arenaOccupancy: [],
  } }))
})

async function open(page: Page) {
  await page.goto('/')
  await page.locator('#pending-leads').getByRole('button', { name: 'Открыть' }).click()
  return page.getByRole('dialog', { name: 'Обработка заявки', exact: true })
}
async function choose(page: Page, modal: Locator, label: string, value: string) {
  const input = modal.getByLabel(label, { exact: true })
  await input.fill(value)
  const option = page.locator('.ant-select-dropdown:visible .ant-select-item-option').filter({ hasText: value }).first()
  await expect(option).not.toHaveClass(/disabled/)
  await option.click()
  await expect(page.locator('.ant-select-dropdown:visible')).toHaveCount(0)
}
async function fillLesson(page: Page, modal: Locator) {
  await modal.getByLabel('Сразу назначить тренировку').check()
  await modal.getByLabel('Дата и время', { exact: true }).fill('2026-10-14T13:00')
  await choose(page, modal, 'Тренер', 'Мария Волкова')
  await choose(page, modal, 'Лошадь', 'Валдай')
  await choose(page, modal, 'Манеж / локация', 'Крытый манеж')
}

test('client-only conversion omits hidden lesson data when the switch is turned off', async ({ page }) => {
  let payload: Record<string, unknown> | undefined
  await page.route('**/api/leads/lead/accept', route => { payload = route.request().postDataJSON(); return route.fulfill({ json: { success: true } }) })
  const modal = await open(page)
  await fillLesson(page, modal)
  await modal.getByLabel('Сразу назначить тренировку').uncheck()
  await modal.getByRole('button', { name: 'Создать клиента', exact: true }).click()
  await expect(modal).not.toBeVisible()
  expect(payload).toMatchObject({ firstName: 'Анна', phone: '+79991234567' })
  expect(payload).not.toHaveProperty('lesson')
  expect(payload).not.toHaveProperty('assignLesson')
})

test('conflict retains the draft and retry sends one atomic request with club time', async ({ page }) => {
  const payloads: Record<string, unknown>[] = []
  await page.route('**/api/leads/lead/accept', route => {
    payloads.push(route.request().postDataJSON())
    return route.fulfill(payloads.length === 1 ? { status: 409, json: { message: 'Тренер уже занят в этот интервал времени' } } : { json: { success: true, lessonId: 'lesson' } })
  })
  const modal = await open(page)
  await fillLesson(page, modal)
  const save = modal.getByRole('button', { name: 'Создать клиента и назначить занятие', exact: true })
  await expect(save).toBeEnabled()
  await save.click()
  await expect(modal.getByRole('alert')).toContainText('Тренер уже занят')
  await expect(modal.getByLabel('Дата и время', { exact: true })).toHaveValue('2026-10-14T13:00')
  await expect(modal.getByLabel('Лошадь', { exact: true })).toBeVisible()
  await expect(save).toBeEnabled()
  await save.click()
  await expect(modal).not.toBeVisible()
  expect(payloads).toHaveLength(2)
  expect(payloads[1]).toMatchObject({ lesson: { trainerId: 'trainer', horseId: 'horse', arenaId: 'arena', serviceId: 'service', startTime: '2026-10-14T10:00:00.000Z', durationMinutes: 60 } })
})

test('catalog failure can be retried; pending conversion blocks closing and duplicate submission', async ({ page }) => {
  let fail = true, finish: (() => void) | undefined, calls = 0
  await page.route('**/api/trainers?*', route => route.fulfill(fail ? { status: 503, json: { message: 'Справочник недоступен' } } : { json: [{ id: 'trainer', name: 'Мария Волкова', isActive: true }] }))
  await page.route('**/api/leads/lead/accept', async route => {
    calls++
    await new Promise<void>(resolve => { finish = resolve })
    await route.fulfill({ json: { success: true } })
  })
  const modal = await open(page)
  await modal.getByLabel('Сразу назначить тренировку').check()
  await expect(modal.getByRole('alert')).toContainText('Справочник недоступен')
  fail = false
  await modal.getByRole('button', { name: 'Повторить загрузку' }).click()
  await modal.getByLabel('Дата и время', { exact: true }).fill('2026-10-14T13:00')
  await choose(page, modal, 'Тренер', 'Мария Волкова')
  await choose(page, modal, 'Лошадь', 'Валдай')
  const save = modal.getByRole('button', { name: 'Создать клиента и назначить занятие', exact: true })
  await expect(save).toBeEnabled(); await save.click()
  await expect.poll(() => calls).toBe(1)
  await page.keyboard.press('Escape')
  await expect(modal).toBeVisible()
  await expect(modal.getByRole('button', { name: 'Отмена', exact: true })).toBeDisabled()
  expect(calls).toBe(1)
  finish?.()
  await expect(modal).not.toBeVisible()
})

test('narrow viewport keeps keyboard selects and the long primary action reachable', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 })
  const modal = await open(page)
  await fillLesson(page, modal)
  const select = modal.getByLabel('Тренер', { exact: true })
  await select.focus(); await select.press('ArrowDown')
  await expect(page.locator('.ant-select-dropdown:visible')).toBeVisible()
  await expect(page.getByTitle('Неактивный тренер', { exact: true })).toHaveCount(0)
  await page.screenshot({ path: testInfo.outputPath('lead-conversion-mobile.png'), fullPage: true })
  await select.press('Escape')
  await expect(page.locator('.ant-select-dropdown:visible')).toHaveCount(0)
  await expect(modal).toBeVisible()
  await expect(page.getByRole('dialog', { name: 'Закрыть заявку без сохранения?', exact: true })).toHaveCount(0)
  const save = modal.getByRole('button', { name: 'Создать клиента и назначить занятие', exact: true })
  await save.scrollIntoViewIfNeeded()
  await expect(save).toBeInViewport()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
})
