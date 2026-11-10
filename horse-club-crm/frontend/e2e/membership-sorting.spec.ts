import { test, expect } from './fixtures'

const rows = [
  { id: '00000000-0000-4000-8000-000000000001', client: { name: 'Борис', firstName: 'Борис', lastName: '' }, serviceTitle: 'Выездка', pricingPlan: null, totalPrice: '8000', remainedLessons: 10, totalLessons: 12, validUntil: '2027-01-02', isActive: false },
  { id: '00000000-0000-4000-8000-000000000002', client: { name: 'Анна', firstName: 'Анна', lastName: '' }, pricingPlan: { name: 'Абонемент' }, totalPrice: '12000', remainedLessons: 2, totalLessons: 12, validUntil: '2026-12-31', isActive: true },
]

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('horsecrm.access_token', 'cookie-session')
    localStorage.setItem('horsecrm.role', 'ADMIN')
    localStorage.setItem('horsecrm.email', 'qa@example.com')
  })
  await page.route('**/api/memberships?*', route => route.fulfill({ json: rows, headers: { 'x-total-count': '2' } }))
})

for (const width of [1366, 1440]) test(`membership sorting cycles, keyboard and compact layout at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 900 })
  await page.goto('/memberships')
  const firstClient = page.locator('tbody tr.ant-table-row').first().getByRole('button').first()
  await expect(firstClient).toHaveText('Борис')
  for (const [label, ascFirst] of [['Клиент', 'Анна'], ['Услуга / тариф', 'Анна'], ['Стоимость', 'Борис'], ['Остаток занятий', 'Анна'], ['Действует до', 'Анна'], ['Статус', 'Анна']]) {
    const header = page.getByRole('columnheader').filter({ has: page.getByRole('button', { name: `${label}:`, exact: false }) })
    const button = header.getByRole('button')
    await button.focus()
    await button.press('Enter')
    await expect(header).toHaveAttribute('aria-sort', 'ascending')
    await expect(firstClient).toHaveText(ascFirst)
    await button.press('Space')
    await expect(header).toHaveAttribute('aria-sort', 'descending')
    await expect(firstClient).toHaveText(ascFirst === 'Анна' ? 'Борис' : 'Анна')
    await button.click()
    await expect(header).toHaveAttribute('aria-sort', 'none')
    await expect(firstClient).toHaveText('Борис')
  }
  const overflow = await page.locator('.ant-table-content').evaluate(element => element.scrollWidth - element.clientWidth)
  expect(overflow).toBeLessThanOrEqual(1)
  await page.screenshot({ path: test.info().outputPath('memberships.png'), fullPage: true })
})

test('membership cards retain readable labels on mobile', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/memberships')
  await expect(page.locator('.responsive-record-item')).toHaveCount(2)
  await expect(page.locator('.responsive-record-label').filter({ hasText: 'Услуга / тариф' })).toHaveCount(2)
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1)
})
