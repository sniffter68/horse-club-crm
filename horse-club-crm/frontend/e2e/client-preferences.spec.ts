import { test, expect, type Page, type Locator } from './fixtures'

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const trainers = [1, 2].map(n => ({ id: id(n), name: `Тренер ${n}`, isActive: true }))
const horses = [3, 4].map(n => ({ id: id(n), name: `Лошадь ${n}`, status: 'active', healthStatus: 'HEALTHY', isUnavailable: false, maxRiderWeight: 100, maxDailyMinutes: 120 }))
const clients = [5, 6, 7].map((n, i) => ({ id: id(n), name: `Клиент ${n}`, firstName: 'Клиент', lastName: String(n), phone: '+79991234567', isRider: true, isPayer: false, createdAt: '2026-10-01',
  preferredTrainerId: trainers[i]?.id ?? null, preferredHorseId: horses[i]?.id ?? null, memberships: [], bookings: [], payments: [], boardingContracts: [] }))

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => { localStorage.setItem('horsecrm.access_token', 'cookie-session'); localStorage.setItem('horsecrm.role', 'ADMIN'); localStorage.setItem('horsecrm.email', 'qa@example.com') })
  await page.route('**/api/**', route => {
    const url = new URL(route.request().url()), path = url.pathname.replace('/api/', '')
    const catalogs: Record<string, unknown[]> = { clients, horses, trainers, arenas: [], services: [] }
    if (path === 'settings/club-schedule') return route.fulfill({ json: { openTime: '09:00', closeTime: '21:00', daysOfWeekOff: [] } })
    if (path === 'bookings/availability') return route.fulfill({ json: { horseWorkloads: [], arenaOccupancy: [] } })
    if (path.startsWith('clients/')) return route.fulfill({ json: clients.find(row => row.id === path.split('/')[1]) })
    return route.fulfill({ json: catalogs[path] ?? [], headers: { 'x-total-count': String(catalogs[path]?.length ?? 0) } })
  })
  // Override the catch-all for connected permission fixtures.
  await page.route('**/api/settings/my-permissions*', route => route.fulfill({ json: { role: 'ADMIN', modules: ['SCHEDULE', 'STABLES', 'STAFF_PAYROLL', 'CASHBOX', 'VETERINARY'].map(module => ({ module, isEnabled: true, accessLevel: 'FULL' })) } }))
})

async function choose(page: Page, dialog: Locator, label: string, text: string) {
  const input = dialog.getByRole('combobox', { name: label, exact: true })
  await input.scrollIntoViewIfNeeded()
  await input.focus(); await input.fill(text)
  await expect(page.locator('.ant-select-dropdown:visible .ant-select-item-option').filter({ hasText: text }).first()).toBeVisible()
  if (label === 'Клиент') await page.locator('.ant-select-dropdown:visible .ant-select-item-option').filter({ hasText: text }).first().click()
  else await input.press('Enter')
  await expect(page.locator('.ant-select-dropdown:visible')).toHaveCount(0)
}
async function selected(dialog: Locator, label: string, text: string) {
  await expect(dialog.getByRole('combobox', { name: label, exact: true }).locator('xpath=ancestor::div[contains(@class,"ant-select-selector")]')).toContainText(text)
}

for (const width of [1440, 390]) test(`booking defaults follow client and preserve manual changes at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 900 })
  await page.goto('/schedule')
  await page.getByRole('button', { name: 'Новое бронирование', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Бронирование тройного ресурса' })
  await choose(page, dialog, 'Клиент', 'Клиент 5')
  await selected(dialog, 'Тренер', 'Тренер 1'); await selected(dialog, 'Лошадь', 'Лошадь 3')
  await choose(page, dialog, 'Клиент', 'Клиент 6')
  await selected(dialog, 'Тренер', 'Тренер 2'); await selected(dialog, 'Лошадь', 'Лошадь 4')
  await choose(page, dialog, 'Клиент', 'Клиент 7')
  for (const label of ['Тренер', 'Лошадь']) await expect(dialog.getByRole('combobox', { name: label, exact: true }).locator('xpath=ancestor::div[contains(@class,"ant-select-selector")]').locator('.ant-select-selection-item')).toHaveCount(0)
  await choose(page, dialog, 'Клиент', 'Клиент 6')
  await selected(dialog, 'Тренер', 'Тренер 2'); await selected(dialog, 'Лошадь', 'Лошадь 4')
  await choose(page, dialog, 'Тренер', 'Тренер 1')
  await choose(page, dialog, 'Лошадь', 'Лошадь 3')
  await choose(page, dialog, 'Клиент', 'Клиент 7')
  await selected(dialog, 'Тренер', 'Тренер 1'); await selected(dialog, 'Лошадь', 'Лошадь 3')
  await dialog.getByRole('combobox', { name: 'Тренер', exact: true }).focus()
  await page.keyboard.press('ArrowDown')
  await expect(page.locator('.ant-select-dropdown:visible')).toBeVisible()
  await page.screenshot({ path: `test-results/client-preferences-${width}.png` })
  await page.keyboard.press('Escape')
  await expect(dialog).toBeVisible()
})

test('lesson participant uses defaults even when the service has no membership', async ({ page }) => {
  await page.goto('/schedule'); await page.getByRole('button', { name: 'Новое занятие', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Быстрое бронирование' })
  await choose(page, dialog, 'Клиент', 'Клиент 5')
  await selected(dialog, 'Тренер', 'Тренер 1'); await selected(dialog, 'Лошадь участника', 'Лошадь 3')
  await choose(page, dialog, 'Тренер', 'Тренер 2')
  await choose(page, dialog, 'Лошадь участника', 'Лошадь 4')
  await choose(page, dialog, 'Клиент', 'Клиент 7')
  await selected(dialog, 'Тренер', 'Тренер 2'); await selected(dialog, 'Лошадь участника', 'Лошадь 4')
})

test('slow client details never overwrite manual resources', async ({ page }) => {
  let release!: () => void
  const gate = new Promise<void>(resolve => { release = resolve })
  await page.route(`**/api/clients/${id(5)}`, async route => { await gate; await route.fulfill({ json: clients[0] }) })
  await page.goto('/schedule'); await page.getByRole('button', { name: 'Новое бронирование', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Бронирование тройного ресурса' })
  await choose(page, dialog, 'Клиент', 'Клиент 5')
  await choose(page, dialog, 'Тренер', 'Тренер 2'); await choose(page, dialog, 'Лошадь', 'Лошадь 4')
  release()
  await expect(dialog.getByText('Нет активного абонемента или депозита')).toBeVisible()
  await selected(dialog, 'Тренер', 'Тренер 2'); await selected(dialog, 'Лошадь', 'Лошадь 4')
})

test('inactive trainers and horses in treatment are not automatically selected', async ({ page }) => {
  await page.route('**/api/trainers?*', route => route.fulfill({ json: trainers.map(row => ({ ...row, isActive: false })), headers: { 'x-total-count': '2' } }))
  await page.route('**/api/horses?*', route => route.fulfill({ json: horses.map(row => ({ ...row, healthStatus: 'TREATMENT' })), headers: { 'x-total-count': '2' } }))
  await page.goto('/schedule'); await page.getByRole('button', { name: 'Новое бронирование', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Бронирование тройного ресурса' })
  await choose(page, dialog, 'Клиент', 'Клиент 5')
  await expect(dialog.getByText('Нет активного абонемента или депозита')).toBeVisible()
  for (const label of ['Тренер', 'Лошадь']) await expect(dialog.getByRole('combobox', { name: label, exact: true }).locator('xpath=ancestor::div[contains(@class,"ant-select-selector")]').locator('.ant-select-selection-item')).toHaveCount(0)
})

test('client drawer saves preferences, retains values after failure, and resets to null', async ({ page }) => {
  let row = { ...clients[0], preferredTrainerId: null as string | null, preferredHorseId: null as string | null }
  let fail = true
  const payloads: Record<string, unknown>[] = []
  await page.route(`**/api/clients/${id(5)}`, route => {
    if (route.request().method() === 'PATCH') {
      const payload = route.request().postDataJSON(); payloads.push(payload)
      if (fail) return route.fulfill({ status: 409, json: { message: 'Повторите сохранение' } })
      row = { ...row, ...payload }
    }
    return route.fulfill({ json: row })
  })
  await page.goto('/clients'); await page.getByRole('button', { name: 'Клиент 5', exact: true }).click()
  const card = page.getByRole('dialog', { name: 'Карточка клиента', exact: true })
  await card.getByRole('button', { name: 'Редактировать', exact: true }).click()
  const drawer = page.getByRole('dialog', { name: 'Редактирование клиента', exact: true })
  await choose(page, drawer, 'Тренер по умолчанию', 'Тренер 1'); await choose(page, drawer, 'Лошадь по умолчанию', 'Лошадь 3')
  await drawer.getByRole('button', { name: 'Сохранить', exact: true }).click()
  await expect(drawer.getByRole('alert')).toContainText('Повторите сохранение')
  await selected(drawer, 'Тренер по умолчанию', 'Тренер 1')
  fail = false
  await drawer.getByRole('button', { name: 'Сохранить', exact: true }).click(); await expect(drawer).toBeHidden()
  expect(payloads.at(-1)).toMatchObject({ preferredTrainerId: id(1), preferredHorseId: id(3) })
  await card.getByRole('button', { name: 'Редактировать', exact: true }).click()
  await selected(drawer, 'Лошадь по умолчанию', 'Лошадь 3')
  await choose(page, drawer, 'Тренер по умолчанию', 'Не назначен'); await choose(page, drawer, 'Лошадь по умолчанию', 'Не назначена')
  await drawer.getByRole('button', { name: 'Сохранить', exact: true }).click(); await expect(drawer).toBeHidden()
  expect(payloads.at(-1)).toMatchObject({ preferredTrainerId: null, preferredHorseId: null })
})

