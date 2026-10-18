import { test, expect, type Page } from './fixtures'

const userId = '00000000-0000-4000-8000-000000000001'
const ownId = '00000000-0000-4000-8000-000000000002'
const otherId = '00000000-0000-4000-8000-000000000003'
const horse = { id: '00000000-0000-4000-8000-000000000004', name: 'Валдай', status: 'active', isUnavailable: false, maxRiderWeight: 90 }
const replacement = { ...horse, id: '00000000-0000-4000-8000-000000000005', name: 'Буран' }
const client = { id: '00000000-0000-4000-8000-000000000006', firstName: 'Анна', name: 'Анна', weightKg: 70 }
const own = { id: ownId, name: 'Мария', isActive: true }, other = { id: otherId, name: 'Ольга', isActive: true }
const arena = { id: 'a1', name: 'Манеж', isActive: true }
const permissions = { horseReplaceOwn: true, horseReplaceAny: false, healthRead: true, healthWrite: false, financeRead: false, boardingAccess: true }
const adminPermissions = { ...permissions, horseReplaceAny: true, healthWrite: true, financeRead: true }
const bookings = [own, other].map((trainer, index) => ({
  id: `00000000-0000-4000-8000-00000000001${index}`, clientId: client.id, client, horseId: horse.id, horse, trainerId: trainer.id, trainer, arenaId: arena.id, arena,
  startTime: `2026-10-15T${index ? '10' : '07'}:00:00Z`, endTime: `2026-10-15T${index ? '11' : '08'}:00:00Z`, status: 'scheduled', serviceType: 'dressage', costAmount: 1500,
}))

async function setup(page: Page, role = 'TRAINER', policy = permissions) {
  await page.clock.setFixedTime(new Date('2026-10-15T06:00:00Z'))
  await page.addInitScript(role => {
    localStorage.setItem('horsecrm.access_token', 'cookie-session'); localStorage.setItem('horsecrm.role', role); localStorage.setItem('horsecrm.email', 'qa@example.com')
  }, role)
  await page.route('**/api/settings/access/me*', route => route.fulfill({ json: { userId, trainerId: ownId, role, permissions: policy } }))
  await page.route('**/api/settings/club-schedule', route => route.fulfill({ json: { openTime: '09:00', closeTime: '21:00', daysOfWeekOff: [] } }))
  for (const [resource, data] of Object.entries({ clients: [client], horses: [horse, replacement], trainers: [own, other], arenas: [arena], services: [], lessons: [], bookings })) {
    await page.route(`**/api/${resource}?*`, route => route.fulfill({ json: data, headers: { 'x-total-count': String(data.length) } }))
  }
  await page.route('**/api/bookings/horse-issues?*', route => route.fulfill({ json: [], headers: { 'x-total-count': '0' } }))
  await page.route('**/api/horses/workload?*', route => route.fulfill({ json: [] }))
  await page.route('**/api/bookings/availability?*', route => route.fulfill({ json: { horseWorkloads: [], arenaOccupancy: [] } }))
  await page.route('**/api/bookings/*/available-horses', route => route.fulfill({ json: [replacement] }))
}

for (const role of ['TRAINER', 'ADMIN', 'MANAGER']) test(`${role} can replace a horse in an allowed lesson`, async ({ page }) => {
  await setup(page, role)
  let saved = false
  const selected = role === 'TRAINER' ? bookings[0] : bookings[1]
  await page.route(`**/api/bookings/${selected.id}/horse`, route => {
    expect(route.request().postDataJSON()).toEqual({ horseId: replacement.id }); saved = true
    return route.fulfill({ json: { ...selected, horseId: replacement.id } })
  })
  await page.goto('/schedule')
  await page.locator('.fc-event').filter({ hasText: role === 'TRAINER' ? 'Мария' : 'Ольга' }).click()
  await page.getByRole('button', { name: 'Сменить лошадь', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Сменить лошадь' })
  const select = dialog.getByRole('combobox', { name: 'Новая лошадь' })
  await expect(select).toBeEnabled(); await select.focus(); await select.press('ArrowDown'); await select.press('Enter')
  await dialog.getByRole('button', { name: 'Сохранить', exact: true }).click()
  await expect(dialog).toHaveCount(0); expect(saved).toBe(true)
})

test('trainer has no replacement action in a colleague lesson and a rejected request explains ownership', async ({ page }) => {
  await setup(page)
  await page.route(`**/api/bookings/${bookings[1].id}/horse`, route => route.fulfill({ status: 403, json: { message: 'Вы можете заменять лошадей только в своих занятиях' } }))
  await page.goto('/schedule')
  await page.locator('.fc-event').filter({ hasText: 'Ольга' }).click()
  const card = page.getByRole('dialog', { name: 'Карточка бронирования' })
  await expect(card.getByRole('button', { name: 'Сменить лошадь', exact: true })).toHaveCount(0)
  // HTTP authorization itself is covered with the real Nest controller in backend/test/role-access.test.cjs.
  const response = await page.evaluate(async ({ id, horseId }) => {
    const result = await fetch(`/api/bookings/${id}/horse`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ horseId }) })
    return { status: result.status, data: await result.json() }
  }, { id: bookings[1].id, horseId: replacement.id })
  expect(response).toMatchObject({ status: 403, data: { message: 'Вы можете заменять лошадей только в своих занятиях' } })
})

test('revoked own-lesson permission hides replacement even in the trainer lesson', async ({ page }) => {
  await setup(page, 'TRAINER', { ...permissions, horseReplaceOwn: false })
  await page.goto('/schedule'); await page.locator('.fc-event').filter({ hasText: 'Мария' }).click()
  await expect(page.getByRole('dialog', { name: 'Карточка бронирования' }).getByRole('button', { name: 'Сменить лошадь', exact: true })).toHaveCount(0)
})

test('legacy group lesson uses the assigned trainer for replacement', async ({ page }) => {
  await setup(page)
  await page.route('**/api/bookings?*', route => route.fulfill({ json: [], headers: { 'x-total-count': '0' } }))
  await page.route('**/api/lessons?*', route => route.fulfill({ json: [{ id: 'lesson', startTime: bookings[0].startTime, endTime: bookings[0].endTime,
    status: 'SCHEDULED', trainer: own, service: { title: 'Выездка' }, arena, bookings: [{ id: bookings[0].id, client, horse, membership: null }] }] }))
  await page.goto('/schedule'); await page.locator('.fc-event').first().click()
  await expect(page.getByRole('dialog', { name: 'Карточка занятия' }).getByRole('button', { name: 'Сменить лошадь', exact: true })).toBeVisible()
})

async function setupRoles(page: Page) {
  await setup(page, 'ADMIN')
  let trainerPolicy = { ...permissions }
  await page.route('**/api/users?*', route => route.fulfill({ json: [{ id: userId, email: 'trainer@example.com', role: 'TRAINER', trainerId: null }], headers: { 'x-total-count': '1' } }))
  await page.route('**/api/settings/role-access', route => route.fulfill({ json: [{ role: 'ADMIN', ...adminPermissions }, { role: 'TRAINER', ...trainerPolicy }] }))
  await page.route('**/api/settings/role-access/TRAINER', route => {
    trainerPolicy = route.request().postDataJSON()
    expect(trainerPolicy.horseReplaceAny).toBe(false)
    expect(Object.keys(trainerPolicy)).toHaveLength(6)
    return route.fulfill({ json: { role: 'TRAINER', ...trainerPolicy } })
  })
  await page.goto('/settings'); await page.getByRole('tab', { name: 'Роли и доступ' }).click()
  return () => trainerPolicy
}

for (const width of [1280, 375]) test(`administrator configures persistent role permissions at ${width}px`, async ({ page }, testInfo) => {
  await page.setViewportSize({ width, height: 900 })
  const policy = await setupRoles(page)
  const ownSwitch = page.getByRole('switch', { name: 'Тренер: Замена лошади в своих занятиях' })
  await expect(ownSwitch).toBeChecked()
  await expect(page.getByRole('switch', { name: 'Тренер: Замена лошади в любых занятиях' })).toBeDisabled()
  await ownSwitch.click()
  await page.getByRole('button', { name: 'Сохранить права', exact: true }).click()
  const confirm = page.getByRole('dialog')
  await expect(confirm).toContainText('все учётные записи тренеров')
  await confirm.getByRole('button', { name: 'Сохранить права', exact: true }).click()
  await expect(confirm).toHaveCount(0)
  expect(policy().horseReplaceOwn).toBe(false)
  await page.reload(); await page.getByRole('tab', { name: 'Роли и доступ' }).click()
  await expect(ownSwitch).toBeEnabled()
  await expect(ownSwitch).not.toBeChecked()
  await expect(page.locator('.ant-tabs-tabpane-active .ant-spin-container')).toHaveCSS('opacity', '1')
  await page.screenshot({ path: testInfo.outputPath(`roles-${width}.png`), fullPage: true })
})

test('administrator links a trainer account and confirms session revocation', async ({ page }) => {
  await setupRoles(page)
  let saved = false
  await page.route(`**/api/users/${userId}/trainer`, route => {
    expect(route.request().postDataJSON()).toEqual({ trainerId: ownId }); saved = true
    return route.fulfill({ json: { id: userId, trainerId: ownId } })
  })
  for (const [field, value] of [['Учётная запись тренера', 'trainer@example.com'], ['Тренер в расписании', 'Мария']]) {
    const select = page.getByRole('combobox', { name: field }); await select.focus(); await select.fill(value); await select.press('ArrowDown'); await select.press('Enter')
  }
  await page.getByRole('button', { name: 'Сохранить привязку', exact: true }).click()
  const confirm = page.getByRole('dialog'); await expect(confirm).toContainText('сессии')
  await confirm.getByRole('button', { name: 'Сохранить привязку', exact: true }).click()
  await expect(confirm).toHaveCount(0); expect(saved).toBe(true)
})

test('trainer cannot open role management; finance grant is read only and revocation blocks the report', async ({ page }) => {
  await setup(page, 'TRAINER', { ...permissions, financeRead: true })
  await page.route('**/api/payments/summary?*', route => route.fulfill({ json: { totalCash: '100', totalCard: '200', totalRevenue: '300', operationsCount: 0, operations: [] } }))
  await page.goto('/settings'); await expect(page.getByRole('tab', { name: 'Роли и доступ' })).toHaveCount(0)
  await page.goto('/financial-reports'); await expect(page.getByRole('heading', { name: 'Финансовые отчёты' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Принять платёж' })).toHaveCount(0)
  await page.route('**/api/settings/access/me*', route => route.fulfill({ json: { role: 'TRAINER', userId, trainerId: ownId, permissions } }))
  await page.reload(); await expect(page.getByText('У вашей роли нет доступа к этому разделу')).toBeVisible()
})
