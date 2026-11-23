import { test, expect, type Page } from './fixtures'

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('horsecrm.access_token', 'cookie-session')
    localStorage.setItem('horsecrm.role', 'MANAGER')
    localStorage.setItem('horsecrm.email', 'qa@example.com')
  })
  await page.route('**/api/**', route => {
    const url = new URL(route.request().url())
    let json: unknown = []
    if (url.pathname.endsWith('/my-permissions')) json = { role: 'MANAGER', modules:
      ['SCHEDULE', 'STABLES', 'VETERINARY', 'CASHBOX', 'STAFF_PAYROLL'].map(module => ({ module, isEnabled: true, accessLevel: 'FULL' })) }
    else if (url.pathname.endsWith('/access/me')) json = { role: 'MANAGER', permissions: { lessonCreateOwn: true, lessonCreateAny: true, healthRead: true, healthWrite: true } }
    else if (url.pathname.endsWith('/club-schedule')) json = { openTime: '09:00', closeTime: '21:00', daysOfWeekOff: [] }
    else if (url.pathname.endsWith('/availability')) json = { horseWorkloads: [], arenaOccupancy: [] }
    else if (url.pathname.endsWith('/cashbox/summary')) json = { mainBalance: 0, boardingBalance: 0, mainOperationsCount: 0, boardingOperationsCount: 0 }
    else if (url.pathname.endsWith('/finance/journal')) json = { data: [], total: 0 }
    if (url.pathname.endsWith('/leads/events')) return route.fulfill({ contentType: 'text/event-stream', body: ': heartbeat\n\n' })
    return route.fulfill({ json, headers: { 'x-total-count': '0' } })
  })
  await page.setViewportSize({ width: 390, height: 844 })
})

async function noPageOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1)
}

test('horse label activates the field and validation describes errors at 390px', async ({ page }) => {
  await page.goto('/horses/new')
  const sex = page.getByRole('combobox', { name: 'Пол', exact: true })
  await expect(sex).toHaveAttribute('id', 'sex')
  await page.locator('label[for="sex"]').click()
  await expect(sex).toBeFocused()
  await sex.press('ArrowDown')
  await sex.press('Enter')
  await expect(page.locator('form')).toHaveAttribute('novalidate', '')
  await page.getByRole('button', { name: 'Сохранить', exact: true }).click()
  await expect(page.getByLabel('Кличка', { exact: true })).toHaveAttribute('aria-invalid', 'true')
  const errorId = await page.getByLabel('Кличка', { exact: true }).getAttribute('aria-describedby')
  expect(errorId).toBeTruthy()
  await expect(page.locator(`[id="${errorId}"]`)).toContainText('Заполните поле')
  await noPageOverflow(page)
})

test('journal search label, both range inputs and Russian popup at 390px', async ({ page }, testInfo) => {
  await page.goto('/lesson-history')
  const search = page.getByRole('combobox', { name: 'Поиск', exact: true })
  await page.locator('label[for="q"]').click()
  await expect(search).toBeFocused()
  await search.fill('Несуществующий клиент')
  await page.getByRole('button', { name: 'Очистить поиск' }).click()
  await expect(search).toHaveValue('')
  await expect(search).toBeFocused()
  const dates = page.getByRole('textbox', { name: 'Период занятий', exact: true })
  await expect(dates).toHaveCount(2)
  await expect(dates.nth(0)).toHaveAttribute('placeholder', 'Начальная дата')
  await expect(dates.nth(1)).toHaveAttribute('placeholder', 'Конечная дата')
  await dates.first().click()
  const popup = page.locator('.ant-picker-dropdown:visible')
  await expect(popup).toBeVisible()
  await expect(popup).not.toHaveClass(/-(appear|enter)(-|\s|$)/)
  const bounds = await popup.boundingBox()
  expect(bounds?.x).toBeGreaterThanOrEqual(0)
  expect((bounds?.x ?? 0) + (bounds?.width ?? 0)).toBeLessThanOrEqual(390)
  expect(bounds?.y).toBeGreaterThanOrEqual(0)
  expect((bounds?.y ?? 0) + (bounds?.height ?? 0)).toBeLessThanOrEqual(844)
  await page.screenshot({ path: testInfo.outputPath('journal-period-390.png') })
  await dates.first().press('Escape')
  await expect(popup).toBeHidden()
  await noPageOverflow(page)
})

for (const appearance of ['light', 'dark'] as const) {
  test(`long client values and measured text contrast in ${appearance}`, async ({ page }, testInfo) => {
    await page.addInitScript(mode => localStorage.setItem('horsecrm.color_mode', mode), appearance)
    await page.route('**/api/clients?*', route => route.fulfill({ json: [{ id: '00000000-0000-4000-8000-000000000091',
      name: 'ОченьДлиннаяФамилия'.repeat(8), firstName: 'ОченьДлиннаяФамилия'.repeat(8), lastName: '',
      phone: '+79991234567', clientType: 'REGULAR', createdAt: '2026-10-01', membership: null }], headers: { 'x-total-count': '1' } }))
    await page.goto('/clients')
    const phone = page.locator('.data-mono').filter({ hasText: '+79991234567' }).first()
    await expect(phone).toBeVisible()
    const contrast = await phone.evaluate(element => {
      const rgb = (value: string) => (value.match(/[\d.]+/g) ?? []).map(Number)
      const luminance = (values: number[]) => values.slice(0, 3).reduce((sum, value, index) => {
        const v = value / 255
        return sum + (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4) * [0.2126, 0.7152, 0.0722][index]
      }, 0)
      let parent: Element | null = element
      let background = 'transparent'
      while (parent) {
        background = getComputedStyle(parent).backgroundColor
        if (background !== 'transparent' && background !== 'rgba(0, 0, 0, 0)') break
        parent = parent.parentElement
      }
      const foregroundL = luminance(rgb(getComputedStyle(element).color))
      const backgroundL = luminance(rgb(background))
      return (Math.max(foregroundL, backgroundL) + 0.05) / (Math.min(foregroundL, backgroundL) + 0.05)
    })
    expect(contrast).toBeGreaterThanOrEqual(4.5)
    await noPageOverflow(page)
    await page.screenshot({ path: testInfo.outputPath(`clients-${appearance}-390.png`) })
    await testInfo.attach('contrast', { body: JSON.stringify({ appearance, contrast }), contentType: 'application/json' })
  })
}

test('main empty screens keep forms and controls inside the mobile viewport', async ({ page }) => {
  for (const path of ['/horses', '/stalls', '/stable', '/payments', '/cash-desk', '/staff', '/settings', '/schedule']) {
    await page.goto(path)
    await expect(page.getByRole('button', { name: 'Открыть меню навигации', exact: true })).toBeVisible()
    await expect(page.locator('.ant-spin-spinning')).toHaveCount(0)
    await noPageOverflow(page)
    expect(await page.locator('form:not([novalidate])').count()).toBe(0)
  }
})
