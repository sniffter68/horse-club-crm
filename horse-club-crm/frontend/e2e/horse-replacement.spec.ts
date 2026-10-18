import { test, expect } from './fixtures'

const horse = { id: 'h1', name: 'Валдай', status: 'sick', isUnavailable: true, maxRiderWeight: 85, maxDailyMinutes: 120, minRestMinutes: 45 }
const free = { ...horse, id: 'h2', name: 'Буран', status: 'active', isUnavailable: false }
const client = { id: 'c1', name: 'Анна Орлова', firstName: 'Анна', weightKg: 70 }
const startTime = '2026-10-16T07:00:00Z', endTime = '2026-10-16T08:00:00Z'
const issue = { id: 'b1', horseId: horse.id, horseName: horse.name, client, startTime, endTime }
test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-10-15T06:00:00Z'))
  await page.addInitScript(() => { localStorage.setItem('horsecrm.access_token', 'cookie-session'); localStorage.setItem('horsecrm.role', 'ADMIN'); localStorage.setItem('horsecrm.email', 'qa@example.com') })
  await page.route('**/api/settings/club-schedule', route => route.fulfill({ json: { openTime: '09:00', closeTime: '21:00', daysOfWeekOff: [] } }))
  for (const [resource, data] of Object.entries({ clients: [client], horses: [horse, free], trainers: [], services: [], arenas: [], lessons: [], bookings: [] })) {
    await page.route(`**/api/${resource}?*`, route => route.fulfill({ json: data, headers: { 'x-total-count': String(data.length) } }))
  }
  await page.route('**/api/horses/workload?*', route => route.fulfill({ json: [] }))
  await page.route('**/api/bookings/availability?*', route => route.fulfill({ json: { horseWorkloads: [], arenaOccupancy: [] } }))
  await page.route('**/api/bookings/horse-issues?*', route => route.fulfill({ json: [issue], headers: { 'x-total-count': '1' } }))
  await page.route('**/api/bookings/b1/available-horses', route => route.fulfill({ json: [free] }))
})
for (const width of [1280, 375]) test(`repairs a future problem from the banner with keyboard selection at ${width}px`, async ({ page }, testInfo) => {
  await page.setViewportSize({ width, height: 900 })
  let saved = false
  await page.route('**/api/bookings/horse-issues?*', route => route.fulfill({ json: saved ? [] : [issue], headers: { 'x-total-count': saved ? '0' : '1' } }))
  await page.route('**/api/bookings/b1/horse', route => {
    expect(route.request().postDataJSON()).toEqual({ horseId: 'h2' }); saved = true
    return route.fulfill({ json: { id: 'b1', horseId: 'h2' } })
  })
  await page.goto('/schedule')
  await expect(page.getByText('Требуют замены лошади: 1')).toBeVisible()
  await page.getByRole('button', { name: 'Сменить лошадь', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Сменить лошадь' })
  const select = dialog.getByRole('combobox', { name: 'Новая лошадь' })
  await expect(select).toBeEnabled(); await select.focus(); await select.press('ArrowDown')
  await expect(page.locator('.ant-select-dropdown:visible')).toContainText('Буран')
  await expect(page.locator('.ant-modal:visible')).toHaveCSS('transform', 'none')
  await expect(page.locator('.ant-select-dropdown:visible')).toHaveCSS('opacity', '1')
  await page.screenshot({ path: testInfo.outputPath('replacement-popup.png') })
  await select.press('Enter')
  await dialog.getByRole('button', { name: 'Сохранить', exact: true }).click()
  await expect(dialog).toHaveCount(0)
  await expect(page.getByText('Требуют замены лошади: 1')).toHaveCount(0)
  expect(saved).toBe(true)
})
test('preserves the selected horse and reason after a concurrent conflict', async ({ page }) => {
  await page.route('**/api/bookings/b1/horse', route => route.fulfill({ status: 409, json: { code: 'HORSE_REST_VIOLATION', message: 'Лошади нужен отдых' } }))
  await page.goto('/schedule'); await page.getByRole('button', { name: 'Сменить лошадь', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Сменить лошадь' })
  const select = dialog.getByRole('combobox', { name: 'Новая лошадь' })
  await expect(select).toBeEnabled(); await select.focus(); await select.press('ArrowDown'); await select.press('Enter')
  await dialog.getByLabel('Причина замены').fill('Болезнь')
  await dialog.getByRole('button', { name: 'Сохранить', exact: true }).click()
  await expect(dialog.getByRole('alert')).toContainText('Лошади нужен отдых')
  await expect(dialog.getByLabel('Причина замены')).toHaveValue('Болезнь')
  await expect(dialog.getByText('Буран · до 85 кг')).toBeVisible()
})
test('availability failure offers retry and empty availability blocks saving', async ({ page }) => {
  let failed = true
  await page.route('**/api/bookings/b1/available-horses', route => route.fulfill(failed ? { status: 503, json: { message: 'Повторите загрузку' } } : { json: [] }))
  await page.goto('/schedule'); await page.getByRole('button', { name: 'Сменить лошадь', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Сменить лошадь' })
  await expect(dialog.getByRole('alert')).toBeVisible()
  await expect(dialog.getByRole('button', { name: 'Сохранить', exact: true })).toBeDisabled()
  failed = false; await dialog.getByRole('button', { name: 'Повторить', exact: true }).click()
  await expect(dialog.getByRole('combobox', { name: 'Новая лошадь' })).toBeEnabled()
  await dialog.getByRole('combobox', { name: 'Новая лошадь' }).click()
  await expect(page.getByText('На это время нет доступных лошадей')).toBeVisible()
  await page.keyboard.press('Escape'); await page.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)
})

test('horse card previews future lessons before changing status and offers quick replacement afterward', async ({ page }) => {
  let statusSaved = false
  const details = { ...free, id: 'h1', name: 'Валдай', healthLogs: [], boardingContracts: [], bookings: [] }
  await page.route('**/api/horses/h1', async route => {
    if (route.request().method() === 'PATCH') { expect(route.request().postDataJSON()).toEqual({ status: 'sick' }); statusSaved = true }
    return route.fulfill({ json: { ...details, status: statusSaved ? 'sick' : 'active', isUnavailable: statusSaved } })
  })
  await page.goto('/horses')
  await page.getByRole('button', { name: 'Валдай', exact: true }).click()
  const card = page.getByRole('dialog', { name: 'Карточка лошади' })
  await expect(card).toHaveCSS('transform', 'none')
  await expect(card.getByRole('button', { name: 'Сменить лошадь', exact: true })).toBeVisible()
  await card.getByRole('button', { name: 'Изменить статус лошади' }).click()
  const status = page.getByRole('dialog', { name: 'Статус: Валдай' })
  await expect(status).toHaveCSS('transform', 'none')
  await status.getByRole('combobox', { name: 'Статус лошади' }).focus()
  await page.keyboard.press('ArrowDown')
  await page.getByTitle('Болеет', { exact: true }).click()
  await expect(status.getByText('Предстоящие занятия с этой лошадью')).toBeVisible()
  await expect(status.getByText('Анна', { exact: true })).toBeVisible()
  await status.getByRole('button', { name: 'Сохранить статус' }).click()
  await expect(status).toHaveCount(0)
  expect(statusSaved).toBe(true)
  await card.getByRole('button', { name: 'Сменить лошадь', exact: true }).click()
  await expect(page.getByRole('dialog', { name: 'Сменить лошадь' }).getByRole('combobox', { name: 'Новая лошадь' })).toBeEnabled()
})

test('legacy lesson participant can replace a horse beside its unavailable badge', async ({ page }) => {
  const trainer = { id: 't1', name: 'Мария' }, service = { id: 's1', title: 'Выездка' }
  await page.route('**/api/lessons?*', route => route.fulfill({ json: [{ id: 'l1', startTime, endTime, trainer, service, status: 'SCHEDULED', arena: null, bookings: [{ id: 'b1', client, horse, membership: null }] }] }))
  await page.route('**/api/horses/workload?*', route => route.fulfill({ json: [{ horseId: 'h1', horseName: 'Валдай', currentWorkloadMinutes: 60, maxDailyWorkloadMinutes: 120, status: 'UNAVAILABLE' }] }))
  await page.route('**/api/bookings/b1/horse', route => route.fulfill({ json: { id: 'b1', horseId: 'h2' } }))
  await page.goto('/schedule'); await page.locator('.fc-event').first().click()
  const card = page.getByRole('dialog', { name: 'Карточка занятия' })
  await expect(card.getByText(/Недоступна/)).toBeVisible()
  await card.getByRole('button', { name: 'Сменить лошадь', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Сменить лошадь' })
  const select = dialog.getByRole('combobox', { name: 'Новая лошадь' })
  await expect(select).toBeEnabled(); await select.focus(); await select.press('ArrowDown'); await select.press('Enter')
  await dialog.getByRole('button', { name: 'Сохранить', exact: true }).click()
  await expect(dialog).toHaveCount(0); await expect(card).toHaveCount(0)
})

test('trainer sees problems without replacement actions', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('horsecrm.role', 'TRAINER'))
  await page.goto('/schedule')
  await expect(page.getByText('Требуют замены лошади: 1')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Сменить лошадь', exact: true })).toHaveCount(0)
})
