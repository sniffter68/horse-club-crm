import { test, expect } from './fixtures'

const id = '00000000-0000-4000-8000-000000000091'
async function expectCompactToggle(control: import('./fixtures').Locator, checked: boolean) {
  await expect(control).toHaveCSS('width', '38px')
  await expect(control).toHaveCSS('height', '22px')
  const handle = control.locator('.ant-switch-handle')
  await expect(handle).toHaveCSS('width', '18px')
  await expect(handle).toHaveCSS('height', '18px')
  await expect.poll(() => control.evaluate(el => {
    const track = el.getBoundingClientRect()
    const thumb = el.querySelector('.ant-switch-handle')?.getBoundingClientRect()
    return thumb ? Math.round(thumb.left - track.left) : null
  })).toBe(checked ? 18 : 2)
  const label = control.locator('..')
  await expect(label).toHaveCSS('padding', '10px 14px')
  await expect(label).toHaveCSS('gap', '12px')
  expect(await label.evaluate(el => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(1)
}

for (const mode of ['light', 'dark']) for (const width of [390, 1440]) {
  test(`horse toggles save false and recover after failure: ${mode} ${width}`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 900 })
    await page.addInitScript(mode => {
      localStorage.setItem('horsecrm.access_token', 'cookie-session')
      localStorage.setItem('horsecrm.role', 'ADMIN')
      localStorage.setItem('horsecrm.email', 'qa@example.com')
      localStorage.setItem('horsecrm.color_mode', mode)
    }, mode)
    const errors: string[] = []
    page.on('pageerror', error => errors.push(error.message))
    let row = { id, name: 'Валдай', status: 'active', ownerType: 'club', isUnavailable: false,
      maxDailyMinutes: 120, minRestMinutes: 45, maxRiderWeight: 85, order: 0,
      allowIndividual: true, allowGroup: false, allowWalk: true, allowSpecial: true,
      boardingContracts: [], healthLogs: [], bookings: [] }
    let fail = true
    await page.route('**/api/horses?*', route => route.fulfill({ json: [row], headers: { 'x-total-count': '1' } }))
    await page.route(`**/api/horses/${id}`, async route => {
      if (route.request().method() === 'PATCH') {
        if (fail) { fail = false; return route.fulfill({ status: 500, json: { message: 'Не удалось сохранить' } }) }
        const body = route.request().postDataJSON() as Record<string, unknown>
        expect(body.allowWalk).toBe(false)
        expect(body.allowGroup).toBe(true)
        row = { ...row, ...body }
      }
      return route.fulfill({ json: row })
    })
    await page.route('**/api/bookings/horse-issues?*', route => route.fulfill({ json: [], headers: { 'x-total-count': '0' } }))
    await page.goto('/horses')
    await page.getByRole('button', { name: 'Валдай', exact: true }).click()
    const card = page.getByRole('dialog', { name: 'Карточка лошади', exact: true })
    await expect(card.getByText('Прогулки и выезды', { exact: true })).toBeVisible()
    await card.getByRole('button', { name: 'Редактировать', exact: true }).click()
    const drawer = page.getByRole('dialog', { name: 'Редактирование лошади', exact: true })
    const walk = drawer.getByRole('switch', { name: 'Прогулки и выезды', exact: true })
    const group = drawer.getByRole('switch', { name: 'Групповые занятия', exact: true })
    await expect(walk).toBeChecked()
    await expect(group).not.toBeChecked()
    await expectCompactToggle(walk, true)
    await expectCompactToggle(group, false)
    // The padding remains part of the label's click target.
    await drawer.locator('label').filter({ hasText: 'Прогулки и выезды' }).click({ position: { x: 4, y: 4 } })
    await expect(walk).not.toBeChecked()
    await expectCompactToggle(walk, false)
    await group.focus()
    await group.press('Space')
    await expect(group).toBeChecked()
    await expectCompactToggle(group, true)
    const describedBy = await walk.getAttribute('aria-describedby')
    expect(describedBy).toBeTruthy()
    await expect(page.locator(`[id="${describedBy}"]`)).toHaveText('Полевые выезды и конные прогулки')
    const overflow = await drawer.evaluate(el => el.scrollWidth - el.clientWidth)
    expect(overflow).toBeLessThanOrEqual(1)
    await page.screenshot({ path: testInfo.outputPath(`toggles-${mode}-${width}.png`), animations: 'disabled' })
    await drawer.getByRole('button', { name: 'Сохранить', exact: true }).click()
    await expect(drawer).toBeVisible()
    await expect(walk).not.toBeChecked()
    await drawer.getByRole('button', { name: 'Сохранить', exact: true }).click()
    await expect(drawer).toBeHidden()
    await expect(card.getByText('Прогулки и выезды', { exact: true })).toHaveCount(0)
    await expect(card.getByText('Групповые занятия', { exact: true })).toBeVisible()
    expect(errors).toEqual([])
  })
}

for (const mode of ['light', 'dark']) test(`new horse defaults and toggle tokens in ${mode} theme`, async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 900 })
  await page.addInitScript(mode => {
    localStorage.setItem('horsecrm.access_token', 'cookie-session')
    localStorage.setItem('horsecrm.role', 'ADMIN')
    localStorage.setItem('horsecrm.email', 'qa@example.com')
    localStorage.setItem('horsecrm.color_mode', mode)
  }, mode)
  await page.route('**/api/horses?*', route => route.fulfill({ json: [], headers: { 'x-total-count': '0' } }))
  await page.route('**/api/horses', async route => {
    const data = route.request().postDataJSON() as Record<string, unknown>
    expect(data).toMatchObject({ allowIndividual: false, allowGroup: true, allowWalk: true, allowSpecial: true })
    return route.fulfill({ status: 201, json: { id, ...data } })
  })
  await page.goto('/horses/new')
  const individual = page.getByRole('switch', { name: 'Индивидуальные тренировки', exact: true })
  for (const label of ['Индивидуальные тренировки', 'Групповые занятия', 'Прогулки и выезды', 'Иппотерапия и фотосессии']) {
    await expect(page.getByRole('switch', { name: label, exact: true })).toBeChecked()
  }
  await page.getByRole('textbox', { name: 'Кличка', exact: true }).fill('Валдай')
  await individual.click()
  await expectCompactToggle(individual, false)
  await individual.scrollIntoViewIfNeeded()
  await page.screenshot({ path: testInfo.outputPath(`create-${mode}.png`), animations: 'disabled' })
  const saved = page.waitForResponse(response => response.url().endsWith('/api/horses') && response.request().method() === 'POST')
  await page.getByRole('button', { name: 'Сохранить', exact: true }).click()
  await saved
  await expect(page).toHaveURL(/\/horses$/)
})

