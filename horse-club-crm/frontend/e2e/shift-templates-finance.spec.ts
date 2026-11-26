import { test, expect, type Page } from './fixtures'

const id = '11111111-1111-4111-8111-111111111111'
async function setup(page: Page, role: 'ADMIN' | 'MANAGER' = 'ADMIN') {
  await page.addInitScript(value => {
    localStorage.setItem('horsecrm.access_token', 'cookie-session')
    localStorage.setItem('horsecrm.role', value)
    localStorage.setItem('horsecrm.email', 'admin@test.local')
  }, role)
  await page.clock.setFixedTime(new Date('2026-11-25T12:00:00+03:00'))
  await page.route('**/api/settings/club-schedule', route => route.fulfill({ json: { openTime: '09:00', closeTime: '18:00', daysOfWeekOff: [] } }))
  await page.route('**/api/staff?*', route => route.fulfill({ json: { data: [{ id, userId: id, fullName: 'Анна Иванова', roleTitle: 'Тренер', isActive: true }], total: 1 } }))
  await page.route(`**/api/staff/${id}/paid-periods`, route => route.fulfill({ json: [] }))
}

for (const width of [390, 1440]) for (const theme of ['light', 'dark']) test(`weekly preview, retry and day interval ${width} ${theme}`, async ({ page }, info) => {
  await page.setViewportSize({ width, height: 900 })
  await setup(page)
  await page.addInitScript(value => localStorage.setItem('horsecrm.color_mode', value), theme)
  let shifts = [23, 24].map(day => ({ id: `33333333-3333-4333-8333-${String(day).padStart(12, '0')}`, staffId: id, date: `2026-11-${day}`, startTime: '09:00', endTime: '18:00', status: 'SCHEDULED' }))
  await page.route('**/api/staff/shifts?*', route => route.fulfill({ json: { data: shifts, total: shifts.length } }))
  let fail = true
  const payloads: Array<{ staffId: string; days: Array<{ date: string; kind: string; startTime: string; endTime: string }> }> = []
  await page.route('**/api/staff/shifts', route => {
    payloads.push(route.request().postDataJSON())
    if (fail) { fail = false; return route.fulfill({ status: 409, json: { message: 'Неделя изменилась. Повторите сохранение' } }) }
    return route.fulfill({ json: { count: payloads.at(-1)?.days.length } })
  })
  await page.goto('/staff?tab=shifts&month=2026-11')
  await expect(page.locator('html')).toHaveAttribute('data-theme', theme)
  await page.getByRole('button', { name: 'Применить шаблон', exact: true }).click()
  const drawer = page.getByRole('dialog', { name: 'Применить шаблон', exact: true })
  await expect(drawer).toBeVisible()
  await expect(drawer.getByLabel('Предпросмотр недели')).toContainText('45 ч')
  for (const [label, hours] of [['2 через 2', '27 ч'], ['Отпуск', '0 ч'], ['Выходные на всю неделю', '0 ч'], ['5 через 2', '45 ч']]) {
    await drawer.getByRole('combobox', { name: 'Шаблон недели', exact: true }).focus()
    await drawer.getByRole('combobox', { name: 'Шаблон недели', exact: true }).press('ArrowDown')
    await page.locator('.ant-select-dropdown:visible').getByText(label, { exact: true }).click()
    await expect(drawer.getByLabel('Предпросмотр недели')).toContainText(hours)
  }
  expect(payloads).toHaveLength(0)
  await drawer.getByText('Применить шаблон', { exact: true }).click()
  await page.screenshot({ path: info.outputPath(`week-${width}-${theme}.png`), fullPage: true, animations: 'disabled' })
  await drawer.getByRole('button', { name: 'Применить к неделе', exact: true }).click()
  await expect(drawer).toBeVisible()
  await expect(page.getByText('Неделя изменилась. Повторите сохранение')).toBeVisible()
  await drawer.getByRole('button', { name: 'Применить к неделе', exact: true }).click()
  await expect(drawer).toBeHidden()
  expect(payloads[1].days).toHaveLength(7)
  expect(payloads[1].days.filter(day => day.kind === 'WORK')).toHaveLength(5)
  if (width === 390) await page.getByRole('button', { name: 'Изменить смену', exact: true }).first().click()
  else await page.locator('.staff-shift-button').first().click()
  const editor = page.getByRole('dialog', { name: 'Изменить смену', exact: true })
  await editor.getByRole('button', { name: '10:00–21:00', exact: true }).click()
  await expect(editor).toContainText('Продолжительность: 11 ч')
  await editor.getByRole('button', { name: 'Применить этот интервал ко всем рабочим дням недели' }).click()
  await expect(editor.getByLabel('Предпросмотр недели')).toContainText('22 ч')
  await editor.getByRole('button', { name: 'Сохранить смену', exact: true }).click()
  await expect(editor).toBeHidden()
  expect(payloads[2].days.every(day => day.startTime === '10:00' && day.endTime === '21:00')).toBe(true)
  shifts = []
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
})

for (const width of [390, 1440]) test(`all financial KPIs filter the journal ${width}`, async ({ page }, info) => {
  await page.setViewportSize({ width, height: 900 })
  await setup(page)
  await page.route('**/api/payments/shifts/current', route => route.fulfill({ json: null }))
  await page.route('**/api/finance/summary?*', route => route.fulfill({ json: { totalRevenue: '1000', totalCash: '300', totalCard: '700', totalMemberships: '500', totalExpenses: '200', operations: [], operationsCount: 0 } }))
  const cases = [
    ['Общие поступления', 'INCOME', null, null], ['Наличные', 'INCOME', 'CASH', null], ['Безналичные', 'INCOME', 'BANK', null], ['Продажи абонементов', 'INCOME', null, 'MEMBERSHIP'], ['Расходы', 'EXPENSE', null, null],
  ] as const
  for (const [title, operation, method, source] of cases) {
    await page.goto('/finance?period=week')
    await expect(page.getByRole('link', { name: `${title}: открыть журнал`, exact: true })).toBeVisible()
    const request = page.waitForRequest(req => req.url().includes('/finance/journal?'))
    await page.getByRole('link', { name: `${title}: открыть журнал`, exact: true }).click()
    const query = new URL((await request).url()).searchParams
    expect(query.get('operationType')).toBe(operation)
    expect(query.get('paymentMethod')).toBe(method)
    expect(query.get('source')).toBe(source)
    expect(new Date(query.get('from')!).toISOString()).toBe('2026-11-22T21:00:00.000Z')
    expect(new Date(query.get('to')!).toISOString()).toBe('2026-11-25T21:00:00.000Z')
    await expect(page.getByRole('combobox', { name: 'Тип операции', exact: true })).toBeVisible()
    await expect(page.locator('#cash-journal .ant-card-head')).toBeInViewport()
    await expect(page.getByText('По выбранным фильтрам операций нет')).toBeVisible()
  }
  await page.screenshot({ path: info.outputPath(`finance-${width}.png`), fullPage: true, animations: 'disabled' })
})

test('read-only staff cannot apply templates or change shifts', async ({ page }) => {
  await setup(page, 'MANAGER')
  await page.route('**/api/settings/my-permissions*', route => route.fulfill({ json: { role: 'MANAGER', modules: [{ module: 'STAFF_PAYROLL', isEnabled: true, accessLevel: 'READ_ONLY' }] } }))
  await page.route('**/api/staff/shifts?*', route => route.fulfill({ json: { data: [], total: 0 } }))
  await page.goto('/staff?tab=shifts')
  await expect(page.getByRole('heading', { name: 'Персонал', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Применить шаблон', exact: true })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Запланировать смену', exact: true })).toHaveCount(0)
})
