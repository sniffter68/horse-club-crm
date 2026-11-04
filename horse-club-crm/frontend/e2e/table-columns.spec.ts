import { test, expect, type Page } from './fixtures'

const id = '11111111-1111-4111-8111-111111111111'
const longText = 'Очень длинное описание особенностей и предпочтений '.repeat(15)
const record = {
  id, name: 'Амур', fullName: 'Анна Иванова', firstName: 'Анна', lastName: 'Иванова', email: 'qa@example.com',
  phone: '+79991234567', role: 'ADMIN', roleTitle: 'Тренер', createdAt: '2026-10-01T12:00:00Z', isActive: true,
  breed: 'Ахалтекинская', coat: 'Гнедая', isUnavailable: false, maxDailyMinutes: 240, minRestMinutes: 15,
  description: longText, qualification: longText, maxDailyLoad: 480, baseRate: 1500, payments: [],
  title: 'Индивидуальное занятие', durationMinutes: 60, maxCapacity: 4, cancellationWindowHours: 24,
  allowMembership: true, price: 12000, capacity: 12, totalLessons: 8, remainedLessons: 5, validDays: 30,
  validUntil: '2026-12-01', totalPrice: 12000, client: { id, firstName: 'Анна', lastName: 'Иванова' },
  horse: { id, name: 'Амур' }, stall: { name: '12' }, monthlyRate: 25000, status: 'ACTIVE',
  pricingPlan: { name: 'Восемь занятий' }, user: { role: 'TRAINER' }, shifts: [],
}
const resources = ['horses', 'trainers', 'users', 'staff', 'memberships', 'pricing-plans', 'services', 'arenas', 'boarding-contracts']

async function setup(page: Page, readOnly = false) {
  await page.addInitScript(readOnly => {
    localStorage.setItem('horsecrm.access_token', 'cookie-session')
    localStorage.setItem('horsecrm.role', readOnly ? 'MANAGER' : 'ADMIN')
    localStorage.setItem('horsecrm.email', 'qa@example.com')
  }, readOnly)
  await page.route('**/api/settings/my-permissions*', route => route.fulfill({ json: { role: readOnly ? 'MANAGER' : 'ADMIN', modules:
    ['SCHEDULE', 'STABLES', 'STAFF_PAYROLL', 'CASHBOX', 'VETERINARY'].map(module => ({ module, isEnabled: true, accessLevel: readOnly ? 'READ_ONLY' : 'FULL' })) } }))
  for (const resource of resources) await page.route(`**/api/${resource}?*`, route => route.fulfill({
    json: resource === 'staff' ? { data: [record], total: 1 } : [record], headers: { 'x-total-count': '1' },
  }))
}

for (const width of [1366, 1440]) for (const resource of resources) {
  test(`${resource}: compact columns at ${width}px`, async ({ page }, info) => {
    await setup(page)
    await page.setViewportSize({ width, height: 900 })
    await page.goto(`/${resource}`)
    const table = page.locator('.crm-entity-table')
    await expect(table.locator('tbody tr.ant-table-row')).toHaveCount(1)
    await expect(page.getByRole('button', { name: 'Настройка колонок', exact: true })).toBeVisible()
    await expect(table.locator('th.ant-table-cell-fix-left').first()).toBeVisible()
    if (resource !== 'memberships') await expect(table.locator('th.ant-table-cell-fix-right')).toHaveText('Действия')
    const overflow = await table.evaluate(element => ({
      page: document.documentElement.scrollWidth - window.innerWidth,
      table: Math.max(...[...element.querySelectorAll('.ant-table-content, .ant-table-body')].map(el => el.scrollWidth - el.clientWidth)),
    }))
    expect(overflow.page).toBeLessThanOrEqual(1)
    expect(overflow.table).toBeLessThanOrEqual(1)
    await page.screenshot({ path: info.outputPath(`${resource}-${width}.png`) })
  })
}

for (const tab of ['payroll', 'statements', 'rates']) test(`staff ${tab}: compact independent table`, async ({ page }) => {
  await setup(page)
  await page.setViewportSize({ width: 1366, height: 900 })
  const payroll = { ...record, staffId: id, staff: record, shiftsCount: 4, lessonsCount: 8, totalAmount: 15000,
    shiftsTotal: 5000, lessonsTotal: 10000, bonuses: 0, penalties: 0, periodStart: '2026-11-01', periodEnd: '2026-11-30' }
  for (const endpoint of ['calculate', 'calculations']) await page.route(`**/api/payroll/${endpoint}?*`, route => route.fulfill({ json: { data: [payroll], total: 1 } }))
  await page.goto(`/staff?tab=${tab}`)
  const table = page.locator('.crm-entity-table')
  await expect(table.locator('tbody tr.ant-table-row')).toHaveCount(1)
  await expect(table.locator('th.ant-table-cell-fix-left').first()).toBeVisible()
  await expect(table.locator('th.ant-table-cell-fix-right')).toHaveText('Действия')
  expect(await table.locator('.ant-table-content').evaluate(el => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(1)
  await page.getByRole('button', { name: 'Настройка колонок', exact: true }).click()
  const option = page.getByRole('checkbox').first()
  const checked = await option.isChecked()
  await option.setChecked(!checked)
  expect(await page.evaluate(key => localStorage.getItem(key), `horse_crm_staff_${tab}_columns_v1`)).not.toBeNull()
})

test('corrupt preferences do not prevent error, empty and recovered catalogue states', async ({ page }) => {
  await setup(page)
  await page.addInitScript(() => localStorage.setItem('horse_crm_horses_columns_v1', '{broken'))
  await page.route('**/api/horses?*', route => route.fulfill({ status: 403, json: { message: 'Доступ временно закрыт' } }))
  await page.goto('/horses')
  await expect(page.getByRole('alert').filter({ hasText: 'Не удалось загрузить каталог' })).toBeVisible()
  await page.route('**/api/horses?*', route => route.fulfill({ json: [], headers: { 'x-total-count': '0' } }))
  await page.reload()
  await expect(page.locator('.crm-entity-table .ant-empty')).toBeVisible()
  await page.route('**/api/horses?*', route => route.fulfill({ json: [record], headers: { 'x-total-count': '1' } }))
  await page.reload()
  await expect(page.locator('.crm-entity-table tbody tr.ant-table-row')).toHaveCount(1)
  await page.getByRole('button', { name: 'Настройка колонок', exact: true }).click()
  await expect(page.getByRole('checkbox', { name: 'Порода', exact: true })).toBeChecked()
  await expect(page.getByRole('checkbox', { name: 'Особенности', exact: true })).not.toBeChecked()
})

test('visibility, order, reset and independent storage survive reload', async ({ page }) => {
  await setup(page)
  await page.goto('/horses')
  const open = () => page.getByRole('button', { name: 'Настройка колонок', exact: true }).click()
  await open()
  await page.getByRole('checkbox', { name: 'Особенности', exact: true }).check()
  await page.getByRole('button', { name: 'Особенности: выше', exact: true }).click()
  await page.getByRole('checkbox', { name: 'Порода', exact: true }).uncheck()
  const saved = await page.evaluate(() => localStorage.getItem('horse_crm_horses_columns_v1'))
  await page.reload()
  await open()
  await expect(page.getByRole('checkbox', { name: 'Порода', exact: true })).not.toBeChecked()
  await expect(page.getByRole('checkbox', { name: 'Особенности', exact: true })).toBeChecked()
  const keys = await page.locator('.crm-entity-table th').allTextContents()
  expect(keys.indexOf('Особенности')).toBeLessThan(keys.indexOf('Масть'))
  await page.keyboard.press('Escape')
  await expect(page.getByRole('button', { name: 'Настройка колонок', exact: true })).toBeFocused()
  await page.locator('.table-cell-text').filter({ hasText: longText }).first().focus()
  await expect(page.getByRole('tooltip').filter({ hasText: longText })).toContainText(longText)
  await page.goto('/arenas')
  await open()
  await page.getByRole('checkbox', { name: 'Описание', exact: true }).uncheck()
  expect(await page.evaluate(() => localStorage.getItem('horse_crm_horses_columns_v1'))).toBe(saved)
  await page.goto('/horses')
  await open()
  await page.getByRole('button', { name: 'Сбросить настройки', exact: true }).click()
  await expect(page.getByRole('checkbox', { name: 'Порода', exact: true })).toBeChecked()
  await expect(page.getByRole('checkbox', { name: 'Особенности', exact: true })).not.toBeChecked()
})

test('read-only, failed persistence and mobile cards preserve access', async ({ page }) => {
  await setup(page, true)
  await page.addInitScript(() => {
    const setItem = Storage.prototype.setItem
    Storage.prototype.setItem = function(key: string, value: string) {
      if (key.startsWith('horse_crm_')) throw new DOMException('Storage unavailable', 'QuotaExceededError')
      setItem.call(this, key, value)
    }
  })
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/horses')
  await expect(page.locator('.responsive-record-list')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Редактировать', exact: true })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Удалить', exact: true })).toHaveCount(0)
  await page.getByRole('button', { name: 'Настройка колонок', exact: true }).click()
  await page.getByRole('checkbox', { name: 'Особенности', exact: true }).check()
  await expect(page.getByRole('status')).toContainText('браузер не разрешил сохранение')
  await page.keyboard.press('Escape')
  await expect(page.locator('.responsive-record-list').getByText('Особенности', { exact: true })).toBeVisible()
})
