import { test, expect, type Page } from './fixtures'

const id = '11111111-1111-4111-8111-111111111111'
const name = 'Анна Орлова'
const unlinked = { telegramUserId: null as string | null, telegramUsername: null as string | null }

async function login(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem('horsecrm.access_token', 'cookie-session')
    localStorage.setItem('horsecrm.email', 'qa@example.com')
    localStorage.setItem('horsecrm.role', 'ADMIN')
  })
}

async function clientCard(page: Page, readOnly = false) {
  await login(page)
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

for (const width of [1280, 320]) test(`client Telegram direct save, recovery and unlink at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 900 })
  const { identity, card } = await clientCard(page)
  let fail = true, failUnlink = true, requests = 0
  await page.route(`**/api/clients/${id}/telegram`, async route => {
    if (route.request().method() === 'PATCH') {
      requests++
      expect(route.request().postDataJSON()).toEqual({ username: 'https://t.me/Anna_User' })
      await new Promise(resolve => setTimeout(resolve, 250))
      if (fail) return route.fulfill({ status: 409, json: { message: 'Telegram уже привязан к другому профилю' } })
      identity.telegramUsername = 'anna_user'
    }
    if (route.request().method() === 'DELETE') {
      if (failUnlink) return route.fulfill({ status: 409, json: { message: 'Не удалось отвязать Telegram' } })
      Object.assign(identity, unlinked)
    }
    await route.fulfill({ json: identity })
  })
  await expect(card.getByText('Telegram не привязан', { exact: true })).toBeVisible()
  await card.getByRole('button', { name: 'Привязать Telegram' }).click()
  const dialog = page.getByRole('dialog', { name: `Привязка Telegram · ${name}`, exact: true })
  const input = dialog.getByLabel('Telegram (username или ID)')
  await expect(input).toHaveAttribute('placeholder', '@username или https://t.me/username')
  await dialog.getByRole('button', { name: 'Сохранить', exact: true }).click()
  expect(requests).toBe(0)
  await input.fill('https://t.me/Anna_User')
  await dialog.getByRole('button', { name: 'Сохранить', exact: true }).click()
  await expect(input).toBeDisabled()
  await expect(dialog.getByRole('alert')).toContainText('Telegram уже привязан')
  await expect(input).toHaveValue('https://t.me/Anna_User')
  fail = false
  await page.screenshot({ path: test.info().outputPath('telegram-link.png') })
  await input.press('Enter')
  await expect(dialog).not.toBeVisible()
  expect(requests).toBe(2)
  await expect(card.getByText('Telegram: @anna_user', { exact: true })).toBeVisible()
  await expect(card.getByRole('link', { name: '@anna_user', exact: true })).toHaveAttribute('href', 'https://t.me/anna_user')
  await card.getByRole('button', { name: 'Отвязать', exact: true }).click()
  const confirmation = page.getByRole('dialog', { name: /^Отвязать Telegram/ })
  await confirmation.getByRole('button', { name: 'Отмена', exact: true }).click()
  await expect(card.getByText('Telegram: @anna_user', { exact: true })).toBeVisible()
  await card.getByRole('button', { name: 'Отвязать', exact: true }).click()
  await confirmation.getByRole('button', { name: 'Отвязать', exact: true }).click()
  await expect(confirmation.getByRole('alert')).toContainText('Не удалось отвязать')
  failUnlink = false
  await confirmation.getByRole('button', { name: 'Отвязать', exact: true }).click()
  await expect(card.getByText('Telegram не привязан', { exact: true })).toBeVisible()
})

test('READ_ONLY client card hides Telegram mutations', async ({ page }) => {
  const { card } = await clientCard(page, true)
  await expect(card.getByText('Telegram не привязан', { exact: true })).toBeVisible()
  await expect(card.getByRole('button', { name: 'Привязать Telegram' })).toHaveCount(0)
})

test('Escape returns focus without issuing a link request', async ({ page }) => {
  const { card } = await clientCard(page)
  let requests = 0
  await page.route('**/api/clients/*/telegram*', route => { requests++; return route.abort() })
  const trigger = card.getByRole('button', { name: 'Привязать Telegram' })
  await trigger.click()
  const dialog = page.getByRole('dialog', { name: `Привязка Telegram · ${name}`, exact: true })
  await expect(dialog.getByLabel('Telegram (username или ID)')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(dialog).not.toBeVisible()
  await expect(trigger).toBeFocused()
  expect(requests).toBe(0)
})

for (const role of ['TRAINER', 'ADMIN', 'OTHER']) test(`user Telegram saves numeric ID for ${role}`, async ({ page }) => {
  await login(page)
  const row = { id, email: 'trainer@example.com', role, createdAt: '2026-10-01', ...unlinked }
  await page.route('**/api/users?*', route => route.fulfill({ json: [row], headers: { 'x-total-count': '1' } }))
  await page.route(`**/api/users/${id}/telegram`, async route => {
    expect(route.request().method()).toBe('PATCH')
    expect(route.request().postDataJSON()).toEqual({ username: '123456789012' })
    row.telegramUserId = '123456789012'
    await route.fulfill({ json: row })
  })
  await page.goto('/users')
  await page.getByRole('button', { name: 'Привязать Telegram' }).click()
  const dialog = page.getByRole('dialog', { name: 'Привязка Telegram · trainer@example.com', exact: true })
  await dialog.getByLabel('Telegram (username или ID)').fill('123456789012')
  await dialog.getByRole('button', { name: 'Сохранить', exact: true }).click()
  await expect(dialog).not.toBeVisible()
  await expect(page.getByText('ID: 123456789012', { exact: true })).toBeVisible()
})

test('staff Telegram drawer preserves profile context in dark mode', async ({ page }) => {
  await login(page)
  await page.setViewportSize({ width: 390, height: 850 })
  await page.addInitScript(() => localStorage.setItem('horsecrm.color_mode', 'dark'))
  const person = { id, userId: id, fullName: 'Иван Тренер', roleTitle: 'Тренер', isActive: true, phone: null,
    shiftRate: null, lessonRate: null, groupLessonRate: null, lessonPercentage: null, user: { role: 'TRAINER', vkId: '77', ...unlinked } }
  await page.route('**/api/staff?*', route => route.fulfill({ json: { data: [person], total: 1 } }))
  await page.route(`**/api/users/${id}/telegram`, async route => {
    expect(route.request().postDataJSON()).toEqual({ username: '@trainer_user' })
    person.user.telegramUsername = 'trainer_user'
    await route.fulfill({ json: person.user })
  })
  await page.goto('/staff?tab=rates')
  await page.getByRole('button', { name: /Редактировать/ }).click()
  const staffDrawer = page.getByRole('dialog').first()
  await staffDrawer.getByRole('button', { name: 'Привязать Telegram' }).click()
  const dialog = page.getByRole('dialog', { name: 'Привязка Telegram · Иван Тренер', exact: true })
  await dialog.getByLabel('Telegram (username или ID)').fill('@trainer_user')
  await expect(page.locator('.ant-drawer-content-wrapper').filter({ has: dialog })).toHaveCSS('transform', 'none')
  await page.screenshot({ path: test.info().outputPath('staff-telegram-dark.png') })
  await dialog.getByRole('button', { name: 'Сохранить', exact: true }).click()
  await expect(dialog).not.toBeVisible()
  await expect(staffDrawer.getByText('Telegram: @trainer_user', { exact: true })).toBeVisible()
  await expect(staffDrawer.getByLabel('VK ID или ссылка на страницу')).toBeVisible()
})
