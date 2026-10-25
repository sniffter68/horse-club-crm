import { test, expect } from './fixtures'

const id = '11111111-1111-4111-8111-111111111111'
const profile = { id, name: 'Анна Орлова', firstName: 'Анна', lastName: 'Орлова', phone: null, vkId: null as string | null,
  membership: null, isRider: true, isPayer: false, createdAt: '2026-10-08T10:00:00Z', preferences: '' }
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('horsecrm.access_token', 'cookie-session')
    localStorage.setItem('horsecrm.email', 'qa@example.com')
    localStorage.setItem('horsecrm.role', 'ADMIN')
  })
})

for (const width of [1280, 320]) test(`direct VK link, error recovery and clearing at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 850 })
  let vkId: string | null = null
  let fail = true
  await page.route('**/api/clients?*', route => route.fulfill({ json: [{ ...profile, vkId }], headers: { 'x-total-count': '1' } }))
  await page.route(`**/api/clients/${id}`, async route => {
    if (route.request().method() !== 'PATCH') return route.fulfill({ json: { ...profile, vkId } })
    const input = route.request().postDataJSON()
    expect(Object.keys(input)).toEqual(['vkId'])
    if (fail) return route.fulfill({ status: 409, json: { message: 'Этот VK ID уже привязан к другому клиенту или сотруднику' } })
    vkId = input.vkId ? '42' : null
    await route.fulfill({ json: { ...profile, vkId } })
  })
  await page.goto('/clients')
  const trigger = page.getByRole('button', { name: 'Привязать VK', exact: true })
  await trigger.click()
  const drawer = page.getByRole('dialog')
  const input = drawer.getByLabel('VK ID или ссылка на страницу')
  await input.fill('https://vk.com/username')
  await drawer.getByRole('button', { name: 'Сохранить', exact: true }).click()
  await expect(drawer.getByRole('alert')).toContainText('уже привязан')
  await expect(input).toHaveValue('https://vk.com/username')
  fail = false
  await drawer.getByRole('button', { name: 'Сохранить', exact: true }).click()
  await expect(drawer).not.toBeVisible()
  await expect(page.getByRole('link', { name: 'Страница ВКонтакте' })).toHaveAttribute('href', 'https://vk.com/id42')
  await page.getByRole('button', { name: 'Изменить VK', exact: true }).click()
  await expect(input).toHaveValue('42')
  await input.fill('')
  await drawer.getByRole('button', { name: 'Сохранить', exact: true }).click()
  await expect(trigger).toBeVisible()
  expect(vkId).toBeNull()
  await expect(page.getByText('VK не привязан', { exact: true })).toBeVisible()
})

test('all employee roles support direct binding from user cards', async ({ page }) => {
  let vkId: string | null = null
  await page.route('**/api/users?*', route => route.fulfill({ json: [{ id, email: 'trainer@example.com', role: 'TRAINER', createdAt: profile.createdAt, vkId }], headers: { 'x-total-count': '1' } }))
  await page.route(`**/api/users/${id}`, async route => {
    expect(route.request().postDataJSON()).toEqual({ vkId: '@trainer' })
    vkId = '77'
    await route.fulfill({ json: { id, vkId } })
  })
  await page.goto('/users')
  await page.getByRole('button', { name: 'Привязать VK', exact: true }).click()
  const drawer = page.getByRole('dialog')
  await drawer.getByLabel('VK ID или ссылка на страницу').fill('@trainer')
  await drawer.getByRole('button', { name: 'Сохранить', exact: true }).click()
  await expect(page.getByRole('link', { name: 'Страница ВКонтакте' })).toHaveAttribute('href', 'https://vk.com/id77')
})

test('staff drawer saves VK with the employee profile and displays its existing link', async ({ page }) => {
  const person = { id, userId: id, fullName: 'Иван Тренер', roleTitle: 'Тренер', isActive: true, phone: null,
    shiftRate: null, lessonRate: null, groupLessonRate: null, lessonPercentage: null, user: { vkId: '77' } }
  let saved = false
  await page.route('**/api/staff?*', route => route.fulfill({ json: { data: [person], total: 1 } }))
  await page.route(`**/api/staff/${id}`, async route => {
    const body = route.request().postDataJSON()
    expect(body.vkId).toBe('vk.com/coach')
    expect(body.fullName).toBe(person.fullName)
    person.user.vkId = '88'; saved = true
    await route.fulfill({ json: person })
  })
  await page.goto('/staff?tab=rates')
  await page.getByRole('button', { name: /Редактировать/ }).click()
  const drawer = page.getByRole('dialog')
  await expect(drawer.getByRole('link', { name: 'Страница ВКонтакте' })).toHaveAttribute('href', 'https://vk.com/id77')
  await drawer.getByLabel('VK ID или ссылка на страницу').fill('vk.com/coach')
  await drawer.getByRole('button', { name: 'Сохранить', exact: true }).click()
  await expect(drawer).not.toBeVisible()
  expect(saved).toBe(true)
})

test('read-only catalog hides VK mutations', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('horsecrm.role', 'TRAINER'))
  await page.route('**/api/clients?*', route => route.fulfill({ json: [profile], headers: { 'x-total-count': '1' } }))
  await page.goto('/clients')
  await expect(page.getByRole('button', { name: 'Анна Орлова', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Привязать VK', exact: true })).toHaveCount(0)
})

test('drawer supports dark theme, reduced motion and Escape', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.route('**/api/clients?*', route => route.fulfill({ json: [profile], headers: { 'x-total-count': '1' } }))
  await page.goto('/clients')
  await page.getByRole('button', { name: 'Включить тёмную тему' }).click()
  await expect(page.getByRole('button', { name: 'Включить светлую тему' })).toBeVisible()
  const trigger = page.getByRole('button', { name: 'Привязать VK', exact: true })
  await trigger.click()
  await expect(page.getByRole('dialog').getByLabel('VK ID или ссылка на страницу')).toBeVisible()
  await page.screenshot({ path: 'test-results/vk-direct-dark.png', fullPage: true })
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).not.toBeVisible()
  await expect(trigger).toBeFocused()
})
