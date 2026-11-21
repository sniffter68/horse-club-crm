import { test, expect } from './fixtures'

const clientId = '00000000-0000-4000-8000-000000000021'
const horseId = '00000000-0000-4000-8000-000000000022'
const membership = { id: '00000000-0000-4000-8000-000000000023', totalLessons: 8, remainedLessons: 0,
  validUntil: '2026-01-01T00:00:00Z', createdAt: '2025-12-01T00:00:00Z', isActive: false,
  pricingPlan: { id: 'plan', name: 'Завершённый абонемент' }, payments: [], members: [], operations: [
    { id: 'op1', type: 'DEBIT', amount: 1, reason: 'Занятие завершено', createdAt: '2025-12-10T10:00:00Z',
      lesson: { id: 'lesson', startTime: '2025-12-10T09:00:00Z', service: { title: 'Выездка' }, trainer: { name: 'Анна Тренер' } } },
    { id: 'op2', type: 'REFUND', amount: 1, reason: 'Отмена занятия', createdAt: '2025-12-11T10:00:00Z',
      lesson: { id: 'lesson', startTime: '2025-12-10T09:00:00Z', service: { title: 'Выездка' }, trainer: { name: 'Анна Тренер' } } },
  ] }
const client = { id: clientId, name: 'Елена Смирнова', firstName: 'Елена', lastName: 'Смирнова', phone: '+79991234567',
  isRider: true, isPayer: true, membership: null, memberships: [membership], boardingContracts: [], bookings: [], payments: [] }
const horse = { id: horseId, name: 'Валдай', ownerType: 'private', owner: client, status: 'active', isUnavailable: false,
  stall: { id: clientId, number: '7', status: 'OCCUPIED', building: { id: clientId, name: 'Северный корпус' } },
  healthLogs: [], boardingContracts: [], currentBoardingContract: null, bookings: [] }

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('horsecrm.access_token', 'cookie-session')
    localStorage.setItem('horsecrm.role', 'ADMIN')
    localStorage.setItem('horsecrm.email', 'qa@example.com')
  })
  await page.route('**/api/clients?*', r => r.fulfill({ json: [client], headers: { 'x-total-count': '1' } }))
  await page.route(`**/api/clients/${clientId}`, r => r.fulfill({ json: client }))
  await page.route('**/api/horses?*', r => r.fulfill({ json: [horse], headers: { 'x-total-count': '1' } }))
  await page.route(`**/api/horses/${horseId}`, r => r.fulfill({ json: horse }))
  await page.route('**/api/bookings/horse-issues?*', r => r.fulfill({ json: [], headers: { 'x-total-count': '0' } }))
  for (const path of ['boarding/expenses', 'vet/records', 'vet/events']) {
    await page.route(`**/api/${path}?*`, r => r.fulfill({ json: { data: [], total: 0 } }))
  }
})

for (const width of [1366, 1440]) test(`clients fit ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 900 })
  await page.goto('/clients')
  await expect(page.getByRole('button', { name: client.name, exact: true }).first()).toBeVisible()
  await page.screenshot({ path: `../docs/reports/operations-clients-${width}.png`, fullPage: true, animations: 'disabled' })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  for (const table of await page.locator('.ant-table-content').all()) {
    expect(await table.evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true)
  }
})

test('client card preserves completed subscriptions and their chronological audit', async ({ page }) => {
  await page.goto('/clients')
  await page.getByRole('button', { name: client.name, exact: true }).first().click()
  const card = page.getByRole('dialog', { name: 'Карточка клиента' })
  await expect(card.getByText('Завершённый абонемент', { exact: true })).toBeVisible()
  await expect(card.getByText('0 / 8 шт.', { exact: true })).toBeVisible()
  const history = card.getByLabel('История занятий абонемента')
  const operations = history.locator('.ant-list-items > .ant-list-item')
  await expect(operations).toHaveCount(2)
  await expect(operations.first()).toContainText('Списание')
  await expect(operations.last()).toContainText('Возврат')
  await expect(history).toContainText('Анна Тренер')
  await expect(history).toContainText('Выездка')
  await history.scrollIntoViewIfNeeded()
  await page.screenshot({ path: '../docs/reports/operations-client-card.png', fullPage: true, animations: 'disabled' })
})

test('horse card exposes owner, actual placement and veterinary journal', async ({ page }) => {
  await page.route('**/api/vet/events?*', route => {
    const status = new URL(route.request().url()).searchParams.get('status') || 'overdue'
    return route.fulfill({ json: { data: [{ id: 'event', horseId, horse: { id: horseId, name: horse.name },
      type: 'vaccination', eventDate: '2026-11-20T09:00:00Z', status, notes: 'Плановая вакцинация' }], total: 1 } })
  })
  await page.goto('/horses')
  await page.getByRole('button', { name: horse.name, exact: true }).first().click()
  const card = page.getByRole('dialog', { name: 'Карточка лошади' })
  await expect(card).toContainText(client.name)
  await expect(card.getByRole('link', { name: /Северный корпус/ })).toBeVisible()
  await page.screenshot({ path: '../docs/reports/operations-horse-placement.png', fullPage: true, animations: 'disabled' })
  await card.getByRole('tab', { name: 'Здоровье и ковка' }).click()
  await expect(card.getByRole('tab', { name: 'Календарь назначений' })).toBeVisible()
  await card.getByRole('tab', { name: 'Календарь назначений' }).click()
  await expect(card.getByRole('combobox', { name: 'Статус ветпроцедур' })).toBeVisible()
  await expect(card.getByText('Просрочено', { exact: true })).toBeVisible()
  for (const [status, label] of [['scheduled', 'Ближайшие 14 дней'], ['completed', 'Выполнено'], ['overdue', 'Просрочено']]) {
    await card.getByRole('combobox', { name: 'Статус ветпроцедур' }).focus()
    await card.getByRole('combobox', { name: 'Статус ветпроцедур' }).press('ArrowDown')
    const response = page.waitForResponse(r => r.url().includes('/vet/events?') && new URL(r.url()).searchParams.get('status') === status)
    await page.locator('.ant-select-dropdown:visible').getByText(label, { exact: true }).click()
    await response
    await expect(card.getByText('Плановая вакцинация')).toBeVisible()
    await expect(page.locator('.ant-select-dropdown:visible')).toHaveCount(0)
  }
  await page.screenshot({ path: '../docs/reports/operations-horse-card.png', fullPage: true, animations: 'disabled' })
})
