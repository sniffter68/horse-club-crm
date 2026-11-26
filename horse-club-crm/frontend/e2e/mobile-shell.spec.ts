import { expect, test, type Page } from './fixtures'

async function back(page: Page) {
  await page.evaluate(async () => {
    const modulePath = '/src/mobile/backButton.ts'
    const { handleAndroidBack } = await import(/* @vite-ignore */ modulePath) as { handleAndroidBack: () => void }
    handleAndroidBack()
  })
}

test('PWA manifest and icons are available; root Back retains the login screen', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/login')
  await expect(page.getByRole('button', { name: 'Войти', exact: true })).toBeVisible()
  const manifest = await page.request.get('/manifest.webmanifest')
  expect(await manifest.json()).toMatchObject({ name: 'Horse Club CRM', display: 'standalone' })
  for (const size of [192, 512]) {
    const icon = await page.request.get(`/icons/icon-${size}.png`)
    expect(icon.ok()).toBe(true)
    const png = await icon.body()
    expect(png.readUInt32BE(16)).toBe(size)
    expect(png.readUInt32BE(20)).toBe(size)
  }
  await back(page)
  await expect(page).toHaveURL(/\/login$/)
  await page.screenshot({ path: test.info().outputPath('login-mobile.png') })
})

test('Android Back closes the navigation drawer, then traverses CRM routes', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.addInitScript(() => {
    localStorage.setItem('horsecrm.access_token', 'cookie-session')
    localStorage.setItem('horsecrm.role', 'ADMIN')
    localStorage.setItem('horsecrm.email', 'qa@example.com')
  })
  await page.route('**/api/**', route => {
    if (/\/settings\//.test(route.request().url()) || /\/cashbox\/|\/leads\/events/.test(route.request().url())) return route.fallback()
    return route.fulfill({ json: [], headers: { 'x-total-count': '0' } })
  })
  const horse = { id: '00000000-0000-4000-8000-000000000801', name: 'Амур', status: 'active', breed: 'Орловская',
    ownerType: 'club', maxDailyMinutes: 240, minRestMinutes: 15, memberships: [], boardingContracts: [], bookings: [], payments: [], healthLogs: [] }
  await page.route('**/api/horses?*', route => route.fulfill({ json: [horse], headers: { 'x-total-count': '1' } }))
  await page.route(`**/api/horses/${horse.id}`, route => route.fulfill({ json: horse }))
  await page.goto('/horses')
  await page.getByRole('button', { name: 'Амур', exact: true }).click()
  const card = page.getByRole('dialog', { name: 'Карточка лошади', exact: true })
  await expect(card).toBeVisible()
  await card.getByRole('button', { name: 'Редактировать', exact: true }).click()
  const editor = page.locator('.entry-drawer')
  await expect(editor).toBeVisible()
  await back(page)
  await expect(editor).not.toBeVisible()
  await expect(card).toBeVisible()
  await back(page)
  await expect(card).not.toBeVisible()
  await expect(page).toHaveURL(/\/horses(?:\?|$)/)
  await page.getByRole('button', { name: 'Открыть меню навигации' }).click()
  await expect(page.locator('.mobile-navigation-drawer')).toBeVisible()
  await back(page)
  await expect(page.locator('.mobile-navigation-drawer')).not.toBeVisible()
  await expect(page).toHaveURL(/\/horses(?:\?|$)/)
  await page.getByRole('button', { name: 'Открыть меню навигации' }).click()
  await page.locator('.mobile-navigation-drawer').getByRole('menuitem', { name: /Клиенты и финансы/ }).click()
  await page.locator('.mobile-navigation-drawer').getByRole('link', { name: 'Клиенты', exact: true }).click()
  await expect(page).toHaveURL(/\/clients(?:\?|$)/)
  await expect(page.locator('.mobile-navigation-drawer')).not.toBeVisible()
  await back(page)
  await expect(page).toHaveURL(/\/horses(?:\?|$)/)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
})
