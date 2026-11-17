import { test, expect, type Page } from './fixtures'

const id = '00000000-0000-4000-8000-000000000091'
async function login(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem('horsecrm.access_token', 'cookie-session')
    localStorage.setItem('horsecrm.role', 'MANAGER')
    localStorage.setItem('horsecrm.email', 'qa@example.com')
  })
}

for (const width of [1440, 390]) test(`cashbox links, URL tabs, refresh and failure recovery at ${width}px`, async ({ page }) => {
  await login(page)
  await page.clock.install()
  await page.setViewportSize({ width, height: 900 })
  let reads = 0, fail = false
  await page.route('**/api/cashbox/summary', route => {
    reads++
    return fail ? route.fulfill({ status: 503, json: { message: 'Касса временно недоступна' } }) : route.fulfill({ json: { mainBalance: 1500, boardingBalance: 2000, mainOperationsCount: 3, boardingOperationsCount: 2 } })
  })
  const filters: string[] = []
  await page.route('**/api/payments?*', route => {
    filters.push(new URL(route.request().url()).searchParams.get('cashboxType') ?? '')
    return route.fulfill({ json: [], headers: { 'x-total-count': '0' } })
  })
  await page.goto('/payments')
  const link = page.getByRole('link', { name: /Касса постоя.*2.*000/ })
  await expect(link).toBeVisible()
  await link.focus(); await page.keyboard.press('Enter')
  await expect(page).toHaveURL(/cashboxType=BOARDING/)
  await expect.poll(() => filters.at(-1)).toBe('BOARDING')
  await page.getByRole('tab', { name: 'Основная касса', exact: true }).click()
  await expect.poll(() => filters.at(-1)).toBe('MAIN')
  await page.getByRole('tab', { name: 'Все', exact: true }).click()
  await expect.poll(() => filters.at(-1)).toBe('')
  const intervalReads = reads
  await page.clock.fastForward(31_000)
  await expect.poll(() => reads).toBeGreaterThan(intervalReads)
  const before = reads
  fail = true
  await page.evaluate(() => window.dispatchEvent(new Event('cash-desk-paid')))
  await expect(page.getByText('Кассы: данные недоступны')).toBeVisible()
  fail = false
  await page.getByRole('button', { name: 'Повторить', exact: true }).click()
  await expect(link).toBeVisible()
  expect(reads).toBeGreaterThan(before)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  await page.screenshot({ path: `test-results/crm-cashboxes-${width}.png` })
})

for (const surface of ['page', 'drawer']) test(`placed horse sex can be cleared, reopened with keyboard and saved in ${surface}`, async ({ page }) => {
  await login(page)
  const row = { id, name: 'Амур', sex: 'STALLION', stallId: '00000000-0000-4000-8000-000000000811', status: 'active', ownerType: 'club',
    maxDailyMinutes: 240, minRestMinutes: 15, maxRiderWeight: 85, isPublic: true, order: 0,
    memberships: [], boardingContracts: [], bookings: [], payments: [], healthLogs: [] }
  let saved: Record<string, unknown> | undefined
  await page.route(`**/api/horses/${id}`, route => {
    if (route.request().method() === 'PATCH') { saved = route.request().postDataJSON() as Record<string, unknown>; return route.fulfill({ json: { ...row, ...saved } }) }
    return route.fulfill({ json: row })
  })
  await page.route('**/api/horses?*', route => route.fulfill({ json: [row], headers: { 'x-total-count': '1' } }))
  await page.route('**/api/bookings/horse-issues?*', route => route.fulfill({ json: [] }))
  if (surface === 'drawer') {
    await page.goto('/horses')
    await page.getByRole('button', { name: 'Амур', exact: true }).click()
    await page.getByRole('dialog', { name: 'Карточка лошади', exact: true }).getByRole('button', { name: 'Редактировать', exact: true }).click()
  } else await page.goto(`/horses/edit/${id}`)
  const field = page.getByRole('combobox', { name: 'Пол', exact: true })
  await expect(field).toBeEnabled()
  await expect(field.locator('xpath=ancestor::div[contains(@class,"ant-select-selector")]')).toContainText('Жеребец')
  await field.scrollIntoViewIfNeeded()
  await field.locator('xpath=ancestor::div[contains(@class,"ant-select")]').first().hover()
  await field.locator('xpath=ancestor::div[contains(@class,"ant-select")]').first().locator('.ant-select-clear').click()
  await field.focus(); await page.keyboard.press('ArrowDown')
  const popup = page.locator('.ant-select-dropdown:visible')
  await expect(popup.getByText('Кобыла', { exact: true })).toBeVisible()
  await popup.getByText('Кобыла', { exact: true }).click()
  await page.getByRole('button', { name: 'Сохранить', exact: true }).click()
  await expect.poll(() => saved?.sex).toBe('MARE')
  if (surface === 'drawer') await expect(page.getByRole('dialog', { name: 'Редактирование лошади', exact: true })).toBeHidden()
})

test('stall name optional and service room name required in the same form', async ({ page }) => {
  await login(page)
  let saved: Record<string, unknown> | undefined
  const buildingId = '00000000-0000-4000-8000-000000000812'
  await page.route('**/api/stable-buildings', route => route.fulfill({ json: [{ id: buildingId, name: 'Основная конюшня', order: 0 }] }))
  await page.route('**/api/stalls', route => { saved = route.request().postDataJSON() as Record<string, unknown>; return route.fulfill({ status: 201, json: { id, ...saved } }) })
  await page.route('**/api/stalls?*', route => route.fulfill({ json: [], headers: { 'x-total-count': '0' } }))
  await page.goto('/stalls/new')
  await page.getByRole('combobox', { name: /Корпус/ }).click()
  await page.getByTitle('Основная конюшня', { exact: true }).click()
  await page.getByRole('textbox', { name: 'Номер денника', exact: true }).fill('17')
  await page.getByRole('button', { name: 'Сохранить', exact: true }).click()
  await expect.poll(() => saved?.number).toBe('17')
  expect(saved?.name).toBeUndefined()
  await expect(page).toHaveURL(/\/stalls$/)
  saved = undefined
  await page.goto('/stalls/new', { waitUntil: 'domcontentloaded' })
  await page.getByRole('combobox', { name: /Корпус/ }).click()
  await page.getByTitle('Основная конюшня', { exact: true }).click()
  await page.getByRole('combobox', { name: 'Тип помещения', exact: true }).focus()
  await page.keyboard.press('ArrowDown')
  await page.locator('.ant-select-dropdown:visible').getByText('Техническое помещение', { exact: true }).click()
  await page.getByRole('button', { name: 'Сохранить', exact: true }).click()
  await expect(page.getByText('Заполните поле', { exact: false }).first()).toBeVisible()
  expect(saved).toBeUndefined()
  await page.getByRole('textbox', { name: 'Название', exact: true }).fill('Амуничник')
  await page.getByRole('button', { name: 'Сохранить', exact: true }).click()
  await expect.poll(() => saved?.type).toBe('SERVICE')
})
