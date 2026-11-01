import { test, expect, type Page } from './fixtures'

async function setup(page: Page, role = 'ADMIN') {
  await page.addInitScript(role => {
    localStorage.setItem('horsecrm.access_token', 'cookie-session'); localStorage.setItem('horsecrm.role', role); localStorage.setItem('horsecrm.email', 'qa@example.com')
  }, role)
  await page.route('**/api/settings/club-schedule', route => route.fulfill({ json: { openTime: '09:00', closeTime: '21:00', daysOfWeekOff: [] } }))
  await page.route('**/api/settings/vk', route => route.fulfill({ json: { communityId: '123', configured: true, callbackUrl: 'https://crm.horseclub68.ru/api/vk/callback', hasAccessToken: true, hasConfirmationToken: true, hasSecretKey: true } }))
  await page.goto('/settings')
}
test('VK settings mask secrets, check draft values, preserve failed input and save without reload', async ({ page }) => {
  await setup(page)
  await page.getByRole('tab', { name: 'Интеграция VK' }).click()
  await expect(page.getByText('Бот настроен', { exact: true })).toBeVisible()
  await expect(page.getByText('https://crm.horseclub68.ru/api/vk/callback', { exact: true })).toBeVisible()
  const token = page.getByLabel('Токен доступа', { exact: true })
  await token.fill('draft-secret'); await expect(token).toHaveAttribute('type', 'password')
  await page.getByRole('button', { name: 'Показать токен доступа' }).focus()
  await page.keyboard.press('Enter'); await expect(token).toHaveAttribute('type', 'text')
  await page.getByRole('button', { name: 'Скрыть токен доступа' }).click()
  let release: () => void = () => {}
  const pending = new Promise<void>(resolve => { release = resolve })
  await page.route('**/api/settings/vk/check', async route => {
    expect(route.request().postDataJSON().accessToken).toBe('draft-secret')
    await pending; await route.fulfill({ status: 400, json: { message: 'Проверьте права токена' } })
  })
  await page.getByRole('button', { name: 'Проверить подключение' }).click()
  await expect(page.getByRole('button', { name: 'Сохранить', exact: true }).last()).toBeDisabled()
  release(); await expect(page.getByRole('alert')).toContainText('Проверьте права токена'); await expect(token).toHaveValue('draft-secret')
  await page.route('**/api/settings/vk/check', route => route.fulfill({ json: { connected: true, message: 'Токен и ключ подтверждения проверены' } }))
  await page.getByRole('button', { name: 'Проверить подключение' }).click()
  await expect(page.getByText('Подключение проверено', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Сохранить', exact: true }).last().click()
  await expect(token).toHaveValue('')
  await page.setViewportSize({ width: 390, height: 844 })
  await expect(page.getByRole('button', { name: 'Проверить подключение' })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  await page.screenshot({ path: '../test-results/vk-settings-mobile.png', fullPage: true })
})
test('trainer cannot see VK credentials settings', async ({ page }) => {
  await setup(page, 'TRAINER'); await expect(page.getByRole('tab', { name: 'Интеграция VK' })).toHaveCount(0)
})
