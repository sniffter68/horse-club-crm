import { test, expect } from './fixtures'

for (const resource of ['clients', 'horses', 'trainers']) {
  for (const width of [1280, 390]) test(`live ${resource} search at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 })
    await page.addInitScript(() => {
      localStorage.setItem('horsecrm.access_token', 'cookie-session')
      localStorage.setItem('horsecrm.email', 'qa@example.com')
      localStorage.setItem('horsecrm.role', 'ADMIN')
    })
    const rows = ['Анна', 'Борис'].map((name, i) => ({
      id: `00000000-0000-4000-8000-00000000000${i + 1}`, name, firstName: name, lastName: '', phone: '+7 (900) 123-45-67',
      breed: 'Орловская', createdAt: '2026-10-01', clientType: 'REGULAR', isRider: true, isPayer: true,
      isUnavailable: false, maxDailyMinutes: 180, minRestMinutes: 30, maxDailyLoad: 180,
    }))
    const queries: string[] = []
    await page.route(`**/api/${resource}?*`, async route => {
      const q = new URL(route.request().url()).searchParams.get('q') || ''
      queries.push(q)
      if (q === 'ошибка') return route.fulfill({ status: 400, json: { message: 'Ошибка поиска' } })
      if (q === 'Бор') await new Promise(resolve => setTimeout(resolve, 700))
      const data = rows.filter(row => row.name.toLowerCase().includes(q.toLowerCase()))
      await route.fulfill({ json: data, headers: { 'x-total-count': String(data.length) } })
    })
    await page.goto(`/${resource}`)
    const input = page.getByRole('combobox', { name: 'Поиск', exact: true })
    await expect(input).toBeVisible()
    await expect(page.getByRole('button', { name: 'Борис', exact: true })).toBeVisible()
    const before = queries.length
    await input.pressSequentially('Ан', { delay: 40 })
    await expect(input).toBeFocused()
    await expect(page.getByRole('button', { name: 'Борис', exact: true })).toHaveCount(0)
    expect(queries.slice(before)).toEqual(['Ан'])
    await expect(page.locator('.ant-select-item-option-content mark')).toHaveText('Ан')
    await input.press('Escape')
    await input.fill('Аннаx')
    await input.press('Tab')
    const clear = page.getByRole('button', { name: 'Очистить поиск', exact: true })
    await expect(clear).toBeFocused()
    await clear.press('Enter')
    await expect(page.getByRole('button', { name: 'Борис', exact: true })).toBeVisible()
    await page.waitForTimeout(400)
    expect(queries).not.toContain('Аннаx')
    await input.fill('Бор')
    await expect.poll(() => queries.includes('Бор')).toBe(true)
    await input.fill('Ан')
    await expect(page.getByRole('button', { name: 'Анна', exact: true })).toBeVisible()
    await page.waitForTimeout(850)
    await expect(input).toHaveValue('Ан')
    await expect(page.getByRole('button', { name: 'Борис', exact: true })).toHaveCount(0)
    await input.fill('нет совпадений')
    await expect(page.getByText(/^(No data|Нет данных)$/).last()).toBeVisible()
    await input.fill('ошибка')
    await expect(page.locator('.ant-alert-description').getByText('Ошибка поиска', { exact: true })).toBeVisible()
    await input.fill('')
    await expect(page.getByRole('button', { name: 'Борис', exact: true })).toBeVisible()
    await expect(input).toBeFocused()
    // IME composition must not trigger searches or submit prematurely.
    const compositionStart = queries.length
    await input.dispatchEvent('compositionstart')
    await input.fill('Ан')
    await page.waitForTimeout(400)
    expect(queries.length).toBe(compositionStart)
    await input.dispatchEvent('compositionend', { data: 'Ан' })
    await expect(page.locator('.ant-select-item-option-content mark')).toHaveText('Ан')
    if (resource === 'clients' && width === 390) await page.screenshot({ path: 'test-results/live-search-mobile.png', fullPage: true })
    await page.route(`**/api/${resource}/${rows[0].id}`, route => route.fulfill({ json: {
      ...rows[0], memberships: [], bookings: [], payments: [], boardingContracts: [], healthLogs: [],
    } }))
    if (resource === 'trainers') {
      await input.press('ArrowDown')
      await input.press('Enter')
    } else await page.locator('.ant-select-item-option:visible').filter({ hasText: 'Анна' }).click()
    const title = resource === 'clients' ? 'Карточка клиента' : resource === 'horses' ? 'Карточка лошади' : 'Карточка тренера'
    await expect(page.getByRole('dialog', { name: title })).toBeVisible()
    await expect(input).toHaveValue('Анна')
  })
}

for (const width of [1280, 390]) test(`booking search preserves client and horse selection at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 900 })
  await page.addInitScript(() => {
    localStorage.setItem('horsecrm.access_token', 'cookie-session')
    localStorage.setItem('horsecrm.role', 'ADMIN')
    localStorage.setItem('horsecrm.email', 'qa@example.com')
  })
  const id = (n: number) => `00000000-0000-4000-8000-00000000000${n}`
  const client = { id: id(1), name: 'Анна', phone: '+7 (900) 123-45-67', memberships: [] }
  const horses = [{ id: id(2), name: 'Буран', status: 'active', healthStatus: 'HEALTHY' }, { id: id(3), name: 'Буревестник', status: 'active', healthStatus: 'TREATMENT' }]
  const catalogs = { clients: [client], horses, trainers: [{ id: id(4), name: 'Мария', isActive: true }], arenas: [], services: [], lessons: [], bookings: [] }
  for (const [resource, rows] of Object.entries(catalogs)) await page.route(`**/api/${resource}?*`, route => route.fulfill({ json: rows, headers: { 'x-total-count': String(rows.length) } }))
  await page.route(`**/api/clients/${id(1)}`, route => route.fulfill({ json: client }))
  await page.route('**/api/settings/club-schedule*', route => route.fulfill({ json: { openTime: '09:00', closeTime: '21:00', daysOfWeekOff: [] } }))
  await page.route('**/api/bookings/availability?*', route => route.fulfill({ json: { horseWorkloads: horses.map(horse => ({ horseId: horse.id, currentWorkloadMinutes: 0, maxDailyWorkloadMinutes: 240, status: 'AVAILABLE' })), arenaOccupancy: [] } }))
  await page.goto('/schedule')
  await page.getByRole('button', { name: 'Записать на тренировку', exact: true }).click()
  const drawer = page.getByRole('dialog', { name: 'Записать на тренировку', exact: true })
  const clientInput = drawer.getByRole('combobox', { name: 'Клиент', exact: true })
  await clientInput.fill('Ан')
  const clientOption = page.locator('.ant-select-item-option:visible').filter({ hasText: 'Анна' })
  await expect(clientOption.locator('mark')).toHaveText('Ан')
  await clientOption.click()
  const horseInput = drawer.getByRole('combobox', { name: 'Лошадь', exact: true })
  await horseInput.fill('Бур')
  const available = page.locator('.ant-select-item-option:visible').filter({ hasText: 'Буран' })
  const blocked = page.locator('.ant-select-item-option:visible').filter({ hasText: 'Буревестник' })
  await expect(available).not.toHaveClass(/disabled/)
  await expect(blocked).toHaveClass(/disabled/)
  await expect(available.locator('mark')).toHaveText('Бур')
  await horseInput.press('ArrowDown')
  await horseInput.press('Enter')
  await expect(drawer.locator('.ant-select-selection-item').filter({ hasText: 'Буран' })).toBeVisible()
  await expect(drawer.locator('.ant-select-selection-item').filter({ hasText: 'Анна' })).toBeVisible()
})
