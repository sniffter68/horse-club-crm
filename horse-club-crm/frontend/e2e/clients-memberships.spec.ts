import { test, expect } from '@playwright/test'

const client = { id: 'client-a', name: 'Анна Орлова', firstName: 'Анна', lastName: 'Орлова',
  phone: '+79991234567', isRider: true, isPayer: true, preferences: '', createdAt: '2026-10-01T10:00:00Z',
  membership: { id: 'm-a', planName: 'Клубный · 8 занятий', remainingUnits: 5, totalUnits: 8,
    validUntil: '2099-12-31T12:00:00Z', status: 'ACTIVE' } }

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('horsecrm.access_token', 'cookie-session')
    localStorage.setItem('horsecrm.email', 'qa@example.com')
    localStorage.setItem('horsecrm.role', 'ADMIN')
  })
  await page.route('**/api/clients?*', route => route.fulfill({
    json: [client, { ...client, id: 'client-b', name: 'Борис Иванов', firstName: 'Борис', lastName: 'Иванов', membership: null }],
    headers: { 'x-total-count': '2' },
  }))
})

test('issue membership opens the existing form with the correct client selected', async ({ page }) => {
  await page.route('**/api/pricing-plans?*', route => route.fulfill({ json: [], headers: { 'x-total-count': '0' } }))
  await page.goto('/clients')
  await page.getByRole('link', { name: '+ Выдать абонемент' }).click()
  await expect(page).toHaveURL(/\/memberships\/new\?clientId=client-b/)
  await expect(page.locator('.ant-select-selection-item').first()).toHaveText('Борис Иванов')
})

for (const width of [1280, 390]) {
  test(`balance, lazy ledger, signed changes and keyboard close at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 850 })
    let requests = 0
    await page.route('**/api/clients/client-a/membership-ledger?*', async route => {
      requests++
      await route.fulfill({ headers: { 'x-total-count': '2' }, json: [
        { id: 'op1', type: 'DEBIT', amount: 1, reason: 'Занятие завершено', createdAt: '2026-10-08T10:15:00Z',
          lesson: { id: 'lesson', startTime: '2026-10-08T09:00:00Z', status: 'COMPLETED', service: { title: 'Выездка' } }, membership: { pricingPlan: { name: 'Клубный' } } },
        { id: 'op2', type: 'CREDIT', amount: 8, reason: 'Выдача абонемента', createdAt: '2026-10-01T10:00:00Z', lesson: null, membership: { pricingPlan: null } },
      ] })
    })
    await page.goto('/clients')
    await expect(page.getByText('5 / 8', { exact: true })).toBeVisible()
    await expect(page.getByText('Нет активного абонемента')).toBeVisible()
    await expect(page.getByRole('link', { name: '+ Выдать абонемент' })).toHaveAttribute('href', '/memberships/new?clientId=client-b')
    expect(requests).toBe(0)
    const trigger = page.getByRole('button', { name: 'История баланса', exact: true }).first()
    await trigger.click()
    const modal = page.getByRole('dialog')
    await expect(modal.getByText('−1', { exact: true })).toBeVisible()
    await expect(modal.getByText('+8', { exact: true })).toBeVisible()
    await expect(modal.getByText('Списание за тренировку', { exact: true })).toBeVisible()
    await expect(modal.getByText('Выездка', { exact: false })).toBeVisible()
    await expect.poll(() => page.evaluate(() => Boolean(document.activeElement?.closest('.ant-modal-wrap')))).toBe(true)
    await page.screenshot({ path: `test-results/client-ledger-${width}.png`, fullPage: true })
    await page.keyboard.press('Escape')
    await expect(modal).not.toBeVisible()
    await expect(trigger).toBeFocused()
    await expect(page.getByRole('button', { name: 'Редактировать', exact: true }).first()).toBeVisible()
    await expect(page.getByRole('button', { name: 'Удалить', exact: true }).first()).toBeVisible()
  })
}

test('ledger loading, error recovery, empty state and client switching', async ({ page }) => {
  let release: (() => void) | undefined
  const gate = new Promise<void>(resolve => { release = resolve })
  let fail = true
  await page.route('**/api/clients/client-a/membership-ledger?*', async route => {
    await gate
    await route.fulfill(fail ? { status: 500, json: { message: 'История временно недоступна' } }
      : { json: [], headers: { 'x-total-count': '0' } })
  })
  await page.route('**/api/clients/client-b/membership-ledger?*', route => route.fulfill({ json: [], headers: { 'x-total-count': '0' } }))
  await page.goto('/clients')
  await page.getByRole('button', { name: 'История баланса', exact: true }).first().click()
  await expect(page.getByRole('dialog').locator('.ant-spin-spinning')).toBeVisible()
  release?.()
  await expect(page.getByRole('dialog').getByRole('alert')).toContainText('Не удалось загрузить историю баланса')
  fail = false
  await page.getByRole('button', { name: 'Повторить' }).click()
  await expect(page.getByText('Операций по абонементам пока нет')).toBeVisible()
  await expect.poll(() => page.evaluate(() => Boolean(document.activeElement?.closest('.ant-modal-wrap')))).toBe(true)
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: 'История баланса', exact: true }).nth(1).click()
  await expect(page.getByRole('dialog')).toContainText('Борис Иванов')
  await expect(page.getByText('Операций по абонементам пока нет')).toBeVisible()
})
