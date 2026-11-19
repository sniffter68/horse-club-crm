import { test, expect } from './fixtures'

const trainerId = '11111111-1111-4111-8111-111111111111'
const userId = '22222222-2222-4222-8222-222222222222'
for (const width of [1440, 390]) for (const mode of ['create', 'link'] as const) {
  test(`existing trainer ${mode} access at ${width}px`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 844 })
    await page.addInitScript(() => {
      localStorage.setItem('horsecrm.access_token', 'cookie-session')
      localStorage.setItem('horsecrm.role', 'ADMIN')
      localStorage.setItem('horsecrm.email', 'admin@test.local')
    })
    let linked = false, attempts = 0
    const trainer = () => ({ id: trainerId, name: 'Тренер без логина', phone: '+79991234567', isActive: true, maxDailyLoad: 480, maxParallelLessons: 4, baseRate: '0', qualification: null,
      user: linked ? { id: userId, email: 'trainer@test.local', crmAccess: true } : null })
    await page.route('**/api/trainers**', async route => {
      const req = route.request(), url = new URL(req.url())
      if (req.method() === 'POST' && url.pathname.endsWith('/account')) {
        attempts++
        expect(url.pathname).toBe(`/api/trainers/${trainerId}/account`)
        expect(req.postDataJSON()).toEqual(mode === 'create' ? { email: 'trainer@test.local', password: 'temporary-password-123' } : { userId })
        if (attempts === 1) return route.fulfill({ status: 409, json: { message: 'Повторите после обновления' } })
        linked = true; return route.fulfill({ json: trainer().user })
      }
      expect(req.method()).toBe('GET')
      return route.fulfill({ json: url.pathname.endsWith(trainerId) ? trainer() : [trainer()], headers: { 'x-total-count': '1' } })
    })
    await page.route('**/api/users**', route => route.fulfill({ json: [{ id: userId, email: 'trainer@test.local', role: 'TRAINER', trainerId: null }], headers: { 'x-total-count': '1' } }))
    await page.goto('/trainers')
    await page.getByRole('button', { name: 'Тренер без логина', exact: true }).first().click()
    const card = page.getByRole('dialog', { name: 'Карточка тренера' })
    await expect(card.getByText('Доступ в CRM: не выдан', { exact: true })).toBeVisible()
    await card.getByRole('button', { name: mode === 'create' ? 'Выдать доступ (создать логин)' : 'Привязать учётку', exact: true }).click()
    const drawer = page.getByRole('dialog', { name: mode === 'create' ? 'Выдать доступ в CRM' : 'Привязать учётку', exact: true })
    if (mode === 'create') {
      await drawer.getByLabel('Email для входа', { exact: true }).fill('trainer@test.local')
      await drawer.getByLabel('Временный пароль', { exact: true }).fill('temporary-password-123')
    } else {
      await drawer.getByRole('combobox', { name: 'Учётная запись тренера' }).click()
      await drawer.getByRole('combobox', { name: 'Учётная запись тренера' }).press('ArrowDown')
      await expect(page.getByRole('option', { name: 'trainer@test.local', exact: true })).toBeVisible()
      await page.screenshot({ path: info.outputPath(`trainer-account-options-${width}.png`), fullPage: true })
      await page.getByRole('option', { name: 'trainer@test.local', exact: true }).click()
    }
    await page.screenshot({ path: info.outputPath(`trainer-account-drawer-${mode}-${width}.png`), fullPage: true })
    const submit = drawer.getByRole('button', { name: mode === 'create' ? 'Создать логин' : 'Привязать учётку', exact: true })
    await submit.click()
    await expect(drawer.getByText('Повторите после обновления', { exact: true })).toBeVisible()
    if (mode === 'create') await expect(drawer.getByLabel('Email для входа', { exact: true })).toHaveValue('trainer@test.local')
    await submit.click()
    await expect(drawer).toBeHidden()
    await expect(card.getByText('Доступ в CRM: активен', { exact: true })).toBeVisible()
    await expect(card.getByRole('button', { name: 'Выдать доступ (создать логин)', exact: true })).toHaveCount(0)
    expect(attempts).toBe(2)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.screenshot({ path: info.outputPath(`trainer-account-${mode}-${width}.png`), fullPage: true })
  })
}
