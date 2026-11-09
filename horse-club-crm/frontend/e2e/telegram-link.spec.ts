import { test, expect, type Page } from './fixtures'

const id = '11111111-1111-4111-8111-111111111111'
const name = 'Анна Орлова'
const unlinked = { telegramUserId: null as string | null, telegramUsername: null as string | null }

async function clientCard(page: Page, readOnly = false) {
  await page.addInitScript(() => {
    localStorage.setItem('horsecrm.access_token', 'cookie-session')
    localStorage.setItem('horsecrm.email', 'qa@example.com')
    localStorage.setItem('horsecrm.role', 'ADMIN')
  })
  if (readOnly) await page.route('**/api/settings/my-permissions*', route => route.fulfill({ json: { role: 'ADMIN', modules: ['SCHEDULE', 'STAFF_PAYROLL'].map(module => ({ module, isEnabled: true, accessLevel: 'READ_ONLY' })) } }))
  const identity = { ...unlinked }
  const row = () => ({ id, name, firstName: 'Анна', lastName: 'Орлова', isRider: true, isPayer: true, phone: null,
    clientType: 'REGULAR', createdAt: '2026-10-01', membership: null, memberships: [], boardingContracts: [], bookings: [], payments: [], healthLogs: [], ...identity })
  await page.route('**/api/clients?*', route => route.fulfill({ json: [row()], headers: { 'x-total-count': '1' } }))
  await page.route(`**/api/clients/${id}`, route => route.fulfill({ json: row() }))
  await page.goto('/clients')
  await page.getByRole('button', { name, exact: true }).click()
  return { identity, card: page.getByRole('dialog', { name: 'Карточка клиента', exact: true }) }
}

for (const width of [1280, 320]) test(`client Telegram code, loading, recovery, bot confirmation and unlink at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 900 })
  const { identity, card } = await clientCard(page)
  let fail = true, failUnlink = true, requests = 0
  await page.route(`**/api/clients/${id}/telegram-link`, async route => {
    requests++
    await new Promise(resolve => setTimeout(resolve, 250))
    if (fail) return route.fulfill({ status: 503, json: { message: 'Не удалось получить код. Повторите попытку.' } })
    await route.fulfill({ json: { code: '123456', expiresAt: new Date(Date.now() + 900000).toISOString(), deepLink: `https://t.me/horseclub68_bot?start=link_client_${id}_abcdefghijkl` } })
  })
  await page.route(`**/api/clients/${id}/telegram`, async route => {
    if (route.request().method() === 'DELETE' && failUnlink) return route.fulfill({ status: 409, json: { message: 'Не удалось отвязать Telegram. Повторите попытку.' } })
    if (route.request().method() === 'DELETE') Object.assign(identity, unlinked)
    await route.fulfill({ json: identity })
  })
  await expect(card.getByText('Telegram не привязан', { exact: true })).toBeVisible()
  await expect(card.getByText('VK не привязан', { exact: true })).toBeVisible()
  await card.getByRole('button', { name: 'Привязать Telegram' }).click()
  const dialog = page.getByRole('dialog', { name: `Привязка Telegram · ${name}`, exact: true })
  await expect(dialog.getByLabel('Получаем код привязки')).toBeVisible()
  await expect(dialog.getByRole('alert')).toContainText('Не удалось получить код')
  fail = false
  await dialog.getByRole('button', { name: 'Получить новый код' }).focus()
  await page.keyboard.press('Enter')
  await expect(dialog.getByText('123456', { exact: true })).toBeVisible()
  await expect(dialog.getByRole('link', { name: 'Открыть в Telegram' })).toHaveAttribute('href', /horseclub68_bot\?start=link_client_/)
  expect(requests).toBe(2)
  await expect(dialog).toHaveCSS('transform', 'none')
  await page.screenshot({ path: test.info().outputPath('telegram-link.png') })
  identity.telegramUserId = '123456789012'; identity.telegramUsername = 'anna'
  await expect(dialog).not.toBeVisible({ timeout: 10000 })
  await expect(card.getByText('Telegram: @anna', { exact: true })).toBeVisible()
  await card.getByRole('button', { name: 'Отвязать', exact: true }).click()
  const confirmation = page.getByRole('dialog', { name: /^Отвязать Telegram/ })
  await confirmation.getByRole('button', { name: 'Отмена', exact: true }).click()
  await expect(card.getByText('Telegram: @anna', { exact: true })).toBeVisible()
  await card.getByRole('button', { name: 'Отвязать', exact: true }).click()
  await confirmation.getByRole('button', { name: 'Отвязать', exact: true }).click()
  await expect(confirmation.getByRole('alert')).toContainText('Не удалось отвязать')
  failUnlink = false
  await confirmation.getByRole('button', { name: 'Отвязать', exact: true }).click()
  await expect(card.getByText('Telegram не привязан', { exact: true })).toBeVisible()
})

test('READ_ONLY client card shows Telegram status and hides mutations', async ({ page }) => {
  const { card } = await clientCard(page, true)
  await expect(card.getByText('Telegram не привязан', { exact: true })).toBeVisible()
  await expect(card.getByRole('button', { name: 'Привязать Telegram' })).toHaveCount(0)
})

test('expired code disappears, renews, and Escape restores keyboard focus', async ({ page }) => {
  const { card } = await clientCard(page)
  let expired = true
  await page.route(`**/api/clients/${id}/telegram-link`, route => route.fulfill({ json: {
    code: '654321', expiresAt: new Date(Date.now() + (expired ? -1000 : 900000)).toISOString(), deepLink: 'https://t.me/horseclub68_bot?start=test',
  } }))
  await page.route(`**/api/clients/${id}/telegram`, route => route.fulfill({ json: unlinked }))
  await page.emulateMedia({ reducedMotion: 'reduce' })
  const trigger = card.getByRole('button', { name: 'Привязать Telegram' })
  await trigger.click()
  const dialog = page.getByRole('dialog', { name: `Привязка Telegram · ${name}`, exact: true })
  await expect(dialog.getByText('Срок действия кода истёк')).toBeVisible()
  await expect(dialog.getByRole('link', { name: 'Открыть в Telegram' })).toHaveCount(0)
  expired = false; await dialog.getByRole('button', { name: 'Получить новый код' }).click()
  await expect(dialog.getByText('654321', { exact: true })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(dialog).not.toBeVisible()
  await expect(trigger).toBeFocused()
})

for (const role of ['TRAINER', 'ADMIN', 'OTHER']) test(`user Telegram issues server-validated ${role} role flag`, async ({ page }) => {
  await page.addInitScript(() => { localStorage.setItem('horsecrm.access_token', 'cookie-session'); localStorage.setItem('horsecrm.role', 'ADMIN'); localStorage.setItem('horsecrm.email', 'qa@example.com') })
  const row = { id, email: 'trainer@example.com', role, createdAt: '2026-10-01', ...unlinked }
  await page.route('**/api/users?*', route => route.fulfill({ json: [row], headers: { 'x-total-count': '1' } }))
  await page.route(`**/api/users/${id}/telegram-link`, async route => {
    expect(route.request().postDataJSON()).toEqual({ role: role === 'ADMIN' ? 'admin' : role === 'TRAINER' ? 'trainer' : 'staff' })
    await route.fulfill({ json: { code: '123456', expiresAt: new Date(Date.now() + 900000).toISOString(), deepLink: 'https://t.me/horseclub68_bot?start=test' } })
  })
  await page.route(`**/api/users/${id}/telegram`, route => route.fulfill({ json: unlinked }))
  await page.goto('/users')
  await page.getByRole('button', { name: 'Привязать Telegram' }).click()
  await expect(page.getByRole('dialog').getByText('123456', { exact: true })).toBeVisible()
})

test('staff drawer opens Telegram linking over its existing profile in dark mode', async ({ page }) => {
  const identity = { ...unlinked }
  await page.setViewportSize({ width: 390, height: 850 })
  await page.addInitScript(() => localStorage.setItem('horsecrm.color_mode', 'dark'))
  await page.addInitScript(() => { localStorage.setItem('horsecrm.access_token', 'cookie-session'); localStorage.setItem('horsecrm.role', 'ADMIN'); localStorage.setItem('horsecrm.email', 'qa@example.com') })
  const person = { id, userId: id, fullName: 'Иван Тренер', roleTitle: 'Тренер', isActive: true, phone: null,
    shiftRate: null, lessonRate: null, groupLessonRate: null, lessonPercentage: null, user: { role: 'TRAINER', vkId: '77', ...unlinked } }
  await page.route('**/api/staff?*', route => route.fulfill({ json: { data: [person], total: 1 } }))
  await page.route(`**/api/users/${id}/telegram-link`, async route => {
    expect(route.request().postDataJSON()).toEqual({ role: 'trainer' })
    await route.fulfill({ json: { code: '123456', expiresAt: new Date(Date.now() + 900000).toISOString(), deepLink: 'https://t.me/horseclub68_bot?start=test' } })
  })
  await page.route(`**/api/users/${id}/telegram`, route => route.fulfill({ json: identity }))
  await page.goto('/staff?tab=rates')
  await page.getByRole('button', { name: /Редактировать/ }).click()
  const drawer = page.getByRole('dialog')
  await drawer.getByRole('button', { name: 'Привязать Telegram' }).click()
  const dialog = page.getByRole('dialog', { name: 'Привязка Telegram · Иван Тренер', exact: true })
  await expect(dialog.getByText('123456', { exact: true })).toBeVisible()
  await expect(dialog).toHaveCSS('transform', 'none')
  await page.screenshot({ path: test.info().outputPath('staff-telegram-dark.png') })
  await page.keyboard.press('Escape')
  await expect(dialog).not.toBeVisible()
  await expect(drawer.getByLabel('VK ID или ссылка на страницу')).toBeVisible()
  await drawer.getByRole('button', { name: 'Привязать Telegram' }).click()
  await expect(dialog.getByText('123456', { exact: true })).toBeVisible()
  identity.telegramUserId = '42'
  await expect(dialog).not.toBeVisible({ timeout: 10000 })
  await expect(drawer.getByText('ID: 42', { exact: true })).toBeVisible()
  await expect(drawer.getByLabel('VK ID или ссылка на страницу')).toBeVisible()
})
