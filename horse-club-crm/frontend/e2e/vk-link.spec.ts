import { test, expect } from '@playwright/test'

const profile = { id: '11111111-1111-4111-8111-111111111111', name: 'Анна Орлова', firstName: 'Анна', lastName: 'Орлова',
  phone: '+79991234567', vkUserId: null as string | null, membership: null, isRider: true, isPayer: false,
  createdAt: '2026-10-08T10:00:00Z', preferences: '', qualification: 'Тренер', maxDailyLoad: 180, baseRate: 1000 }
const invite = () => ({ code: '0123', expiresAt: new Date(Date.now() + 300000).toISOString(),
  instruction: 'привязать +79991234567 0123', communityUrl: 'https://vk.me/club123' })

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('horsecrm.access_token', 'cookie-session')
    localStorage.setItem('horsecrm.email', 'qa@example.com')
    localStorage.setItem('horsecrm.role', 'ADMIN')
  })
})

for (const width of [1280, 320]) test(`VK invite, refresh and confirmed unlink at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 850 })
  let linked = false, issued = 0, unlinked = 0
  await page.route('**/api/clients?*', route => route.fulfill({ json: [{ ...profile, vkUserId: linked ? '42' : null }], headers: { 'x-total-count': '1' } }))
  await page.route('**/api/vk/link-codes', async route => {
    expect(route.request().postDataJSON()).toEqual({ kind: 'CLIENT', id: profile.id })
    issued++
    await route.fulfill({ json: invite() })
  })
  await page.route('**/api/vk/link-codes/unlink', async route => {
    expect(route.request().postDataJSON()).toEqual({ kind: 'CLIENT', id: profile.id })
    linked = false; unlinked++
    await route.fulfill({ json: { success: true } })
  })
  await page.goto('/clients')
  await expect(page.getByText('VK не привязан', { exact: true })).toBeVisible()
  expect(issued).toBe(0)
  const trigger = page.getByRole('button', { name: 'Привязать VK', exact: true })
  await trigger.click()
  const modal = page.getByRole('dialog')
  await expect(modal.getByText('0123', { exact: true })).toBeVisible()
  await expect(modal.getByText(invite().instruction, { exact: true })).toBeVisible()
  await expect(modal.getByRole('link', { name: 'Открыть бота в VK' })).toHaveAttribute('href', 'https://vk.me/club123')
  await expect.poll(() => page.evaluate(() => Boolean(document.activeElement?.closest('.ant-modal-wrap')))).toBe(true)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  await page.screenshot({ path: `test-results/vk-invite-${width}.png`, fullPage: true })
  await page.keyboard.press('Escape')
  await expect(modal).not.toBeVisible()
  await expect(trigger).toBeFocused()
  await trigger.click()
  await expect(modal.getByText('0123', { exact: true })).toBeVisible()
  linked = true
  await modal.getByRole('button', { name: 'Готово, обновить статус' }).click()
  await expect(page.getByText('VK подключён', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Отвязать VK', exact: true }).click()
  expect(unlinked).toBe(0)
  await page.getByRole('button', { name: 'Оставить', exact: true }).click()
  expect(unlinked).toBe(0)
  await page.getByRole('button', { name: 'Отвязать VK', exact: true }).click()
  await page.getByRole('button', { name: 'Отвязать', exact: true }).click()
  await expect(page.getByText('VK не привязан', { exact: true })).toBeVisible()
  expect(unlinked).toBe(1)
  await expect(page.getByRole('button', { name: 'Редактировать', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Удалить', exact: true })).toBeVisible()
})

test('trainer uses the same invite UI with TRAINER payload', async ({ page }) => {
  await page.route('**/api/trainers?*', route => route.fulfill({ json: [profile], headers: { 'x-total-count': '1' } }))
  await page.route('**/api/vk/link-codes', async route => {
    expect(route.request().postDataJSON()).toEqual({ kind: 'TRAINER', id: profile.id })
    await route.fulfill({ json: invite() })
  })
  await page.goto('/trainers')
  await page.getByRole('button', { name: 'Привязать VK', exact: true }).click()
  await expect(page.getByRole('dialog').getByText('0123', { exact: true })).toBeVisible()
})

test('invite loading, persistent API error, retry and expiry recovery', async ({ page }) => {
  let release: (() => void) | undefined, fail = true
  const gate = new Promise<void>(resolve => { release = resolve })
  await page.route('**/api/clients?*', route => route.fulfill({ json: [profile], headers: { 'x-total-count': '1' } }))
  await page.route('**/api/vk/link-codes', async route => {
    await gate
    await route.fulfill(fail ? { status: 409, json: { message: 'Профиль уже привязан' } }
      : { json: { ...invite(), expiresAt: new Date(Date.now() - 1000).toISOString() } })
  })
  await page.goto('/clients')
  await page.getByRole('button', { name: 'Привязать VK', exact: true }).click()
  const modal = page.getByRole('dialog')
  await expect(modal.locator('.ant-skeleton')).toBeVisible()
  release?.()
  await expect(modal.getByRole('alert')).toContainText('Профиль уже привязан')
  fail = false
  await modal.getByRole('button', { name: 'Повторить' }).click()
  await expect(modal.getByRole('alert')).toContainText('Срок действия кода истёк')
  await expect(modal.getByRole('button', { name: 'Получить новый код' })).toBeVisible()
  await expect(modal.getByText('0123', { exact: true })).toHaveCount(0)
})

test('failed unlink preserves linked status and exposes retry', async ({ page }) => {
  await page.route('**/api/clients?*', route => route.fulfill({ json: [{ ...profile, vkUserId: '42' }], headers: { 'x-total-count': '1' } }))
  await page.route('**/api/vk/link-codes/unlink', route => route.fulfill({ status: 503, json: { message: 'Сервер недоступен' } }))
  await page.goto('/clients')
  await page.getByRole('button', { name: 'Отвязать VK', exact: true }).click()
  await page.getByRole('button', { name: 'Отвязать', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('Сервер недоступен')
  await expect(page.getByText('VK подключён', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Отвязать VK', exact: true })).toBeEnabled()
})

test('ADMIN configures and clears lead recipient without exposing it for MANAGER users', async ({ page }) => {
  let recipient: string | null = null
  await page.route('**/api/users?*', route => route.fulfill({ json: [
    { id: profile.id, email: 'admin@example.com', role: 'ADMIN', createdAt: profile.createdAt, vkUserId: recipient },
    { id: 'manager', email: 'manager@example.com', role: 'MANAGER', createdAt: profile.createdAt },
  ], headers: { 'x-total-count': '2' } }))
  await page.route(`**/api/users/${profile.id}/vk`, async route => {
    recipient = route.request().postDataJSON().vkUserId
    await route.fulfill({ json: { id: profile.id, vkUserId: recipient } })
  })
  await page.goto('/users')
  await expect(page.getByRole('button', { name: 'Настроить VK уведомления' })).toHaveCount(1)
  await page.getByRole('button', { name: 'Настроить VK уведомления' }).click()
  await page.getByLabel('ID пользователя VK').fill('invalid')
  await expect(page.getByRole('button', { name: 'Сохранить', exact: true })).toBeDisabled()
  await page.getByLabel('ID пользователя VK').fill('42')
  await page.getByRole('button', { name: 'Сохранить', exact: true }).click()
  await page.getByRole('button', { name: 'VK уведомления подключены' }).click()
  await page.getByLabel('ID пользователя VK').fill('')
  await page.getByRole('button', { name: 'Сохранить', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Настроить VK уведомления' })).toBeVisible()
  expect(recipient).toBe(null)
})

test('trainer read-only catalog hides VK account management', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('horsecrm.role', 'TRAINER'))
  await page.route('**/api/clients?*', route => route.fulfill({ json: [profile], headers: { 'x-total-count': '1' } }))
  await page.goto('/clients')
  await expect(page.getByRole('button', { name: 'Анна Орлова', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Привязать VK', exact: true })).toHaveCount(0)
})

test('expired session during invitation returns to login', async ({ page }) => {
  await page.route('**/api/clients?*', route => route.fulfill({ json: [profile], headers: { 'x-total-count': '1' } }))
  await page.route('**/api/vk/link-codes', route => route.fulfill({ status: 401, json: { message: 'Сессия истекла' } }))
  await page.goto('/clients')
  await page.getByRole('button', { name: 'Привязать VK', exact: true }).click()
  await expect(page).toHaveURL(/\/login/)
})

test('dark theme and reduced motion preserve readable code and keyboard dismissal', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.route('**/api/clients?*', route => route.fulfill({ json: [profile], headers: { 'x-total-count': '1' } }))
  await page.route('**/api/vk/link-codes', route => route.fulfill({ json: invite() }))
  await page.goto('/clients')
  await page.getByRole('button', { name: 'Включить тёмную тему' }).click()
  const trigger = page.getByRole('button', { name: 'Привязать VK', exact: true })
  await trigger.click()
  const modal = page.getByRole('dialog')
  await expect(modal.locator('.vk-invite-code')).toHaveCSS('color', 'rgb(228, 218, 208)')
  await page.screenshot({ path: 'test-results/vk-invite-dark.png', fullPage: true })
  await page.keyboard.press('Escape')
  await expect(modal).not.toBeVisible()
  await expect(trigger).toBeFocused()
})
