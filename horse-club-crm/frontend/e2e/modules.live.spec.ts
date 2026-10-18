import { test, expect } from '@playwright/test'

test('real administrator disables veterinary, blocks API and direct URL, then restores access', async ({ page }) => {
  test.skip(process.env.RUN_MODULE_TESTS !== '1', 'Uses the disposable database in run-modules-postgres.cjs')
  await page.goto('/login')
  await page.getByLabel('Email', { exact: true }).fill('modules-admin@test.local')
  await page.getByLabel('Пароль', { exact: true }).fill('modules-test-password')
  await page.getByRole('button', { name: 'Войти', exact: true }).click()
  await expect(page).not.toHaveURL(/\/login/)
  const openSettings = async () => {
    await page.goto('/settings')
    await page.getByRole('tab', { name: 'Модули и права доступа', exact: true }).click()
  }
  try {
    await openSettings()
    await page.getByRole('switch', { name: 'Ветеринарный учет' }).click()
    await page.getByRole('dialog', { name: 'Отключить модуль?' }).getByRole('button', { name: 'Сохранить', exact: true }).click()
    await expect(page.getByRole('switch', { name: 'Ветеринарный учет' })).not.toBeChecked()
    await expect(page.locator('aside a[href="/vet"]')).toHaveCount(0)
    expect((await page.request.get('/api/vet/records')).status()).toBe(403)
    await page.goto('/vet')
    await expect(page.getByText('Раздел недоступен или отключен в настройках клуба')).toBeVisible()
    await openSettings()
    await page.getByRole('switch', { name: 'Ветеринарный учет' }).click()
    await page.getByRole('dialog', { name: 'Включить модуль?' }).getByRole('button', { name: 'Сохранить', exact: true }).click()
    await expect(page.getByRole('switch', { name: 'Ветеринарный учет' })).toBeChecked()
    expect((await page.request.get('/api/vet/records')).status()).toBe(200)
    await page.goto('/vet')
    await expect(page.getByRole('heading', { name: 'Ветеринарный журнал', exact: true })).toBeVisible()
  } finally {
    await page.request.patch('/api/settings/modules/toggle', { data: { module: 'VETERINARY', isEnabled: true } })
  }
})

test('hidden payroll retains a scoped personal endpoint for trainer and stable worker', async ({ playwright }) => {
  test.skip(process.env.RUN_MODULE_TESTS !== '1', 'Uses the disposable database in run-modules-postgres.cjs')
  for (const role of ['trainer', 'stable_worker']) {
    const context = await playwright.request.newContext({ baseURL: process.env.CRM_TEST_BASE_URL })
    try {
      const login = await context.post('/api/auth/login', { data: { email: `modules-${role}@test.local`, password: 'modules-test-password' } })
      expect(login.status()).toBe(200)
      expect((await context.get('/api/staff')).status()).toBe(403)
      expect((await context.get('/api/payroll/calculate?from=2026-10-01&to=2026-10-19')).status()).toBe(403)
      const mine = await context.get('/api/payroll/me?from=2026-10-01&to=2026-10-19')
      expect(mine.status()).toBe(200)
      expect((await mine.json()).data).toHaveLength(1)
      expect((await context.get('/api/payroll/me?from=2026-10-01&to=2026-10-19&staffId=00000000-0000-4000-8000-000000000001')).status()).toBe(403)
    } finally { await context.dispose() }
  }
})
