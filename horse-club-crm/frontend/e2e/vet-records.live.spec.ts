import { test, expect } from '@playwright/test'

test('admin login, persisted farrier record, quarantine badge and full passport', async ({ page, baseURL }) => {
  const email = process.env.CRM_VET_ADMIN_EMAIL, password = process.env.CRM_VET_ADMIN_PASSWORD, horseId = process.env.CRM_VET_HORSE_ID
  test.skip(!email || !password || !horseId, 'Requires a migrated local test database, an admin and a healthy fixture horse')
  expect(['localhost', '127.0.0.1']).toContain(new URL(baseURL!).hostname)
  test.setTimeout(60000)
  await page.goto('/login'); await page.getByLabel('Email', { exact: true }).fill(email!); await page.getByLabel('Пароль', { exact: true }).fill(password!)
  await page.getByRole('button', { name: 'Войти', exact: true }).click(); await expect(page).toHaveURL(url => url.pathname === '/')
  const horseResponse = await page.request.get(`/api/horses/${horseId}`); expect(horseResponse.ok()).toBe(true)
  const horse = await horseResponse.json(); expect(horse.healthStatus).toBe('HEALTHY'); expect(horse.status).toBe('active'); expect(horse.isUnavailable).toBe(false)
  const title = `E2E расчистка ${Date.now()}`; let recordId: string | undefined
  try {
    await page.goto('/vet'); await page.getByRole('button', { name: 'Добавить ветзапись', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: 'Добавить ветеринарную запись' })
    await dialog.getByRole('combobox', { name: 'Лошадь', exact: true }).fill(horse.name)
    await page.locator('.ant-select-dropdown:visible').getByTitle(horse.name, { exact: true }).click()
    await dialog.getByLabel('Название процедуры').fill(title); await dialog.getByLabel('Врач / коваль / лаборатория').fill('E2E коваль')
    const saving = page.waitForResponse(r => r.url().endsWith('/api/vet/records') && r.request().method() === 'POST')
    await dialog.getByRole('button', { name: 'Сохранить ветзапись' }).click(); const response = await saving
    expect(response.status()).toBe(201); const created = await response.json(); recordId = created.id; expect(created.nextDueDate).toBeTruthy()
    await expect(dialog).not.toBeVisible(); await expect(page.getByText(title, { exact: true })).toBeVisible(); await page.reload()
    const row = page.locator('tr').filter({ hasText: title }); await expect(row).toBeVisible(); await row.getByRole('button', { name: 'Здоровье', exact: true }).click()
    await page.getByRole('combobox', { name: 'Состояние здоровья' }).focus(); await page.keyboard.press('ArrowDown')
    await page.locator('.ant-select-dropdown:visible').getByTitle('Карантин', { exact: true }).click(); await page.getByRole('button', { name: 'Сохранить здоровье' }).click()
    await expect(page.getByRole('button', { name: `${horse.name} · Карантин` })).toBeVisible()
    await page.getByRole('button', { name: `${horse.name} · Карантин` }).click(); await expect(page.getByRole('dialog', { name: 'Ветеринарная карта' }).getByRole('cell').filter({ hasText: title })).toBeVisible()
  } finally {
    expect((await page.request.patch(`/api/vet/horses/${horseId}/health-status`, { data: { healthStatus: 'HEALTHY', quarantineUntil: null } })).ok()).toBe(true)
    if (recordId) expect((await page.request.delete(`/api/vet/records/${recordId}`)).ok()).toBe(true)
  }
})
