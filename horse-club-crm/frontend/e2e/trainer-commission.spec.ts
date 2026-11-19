import { test, expect } from './fixtures'

const id = '11111111-1111-4111-8111-111111111111'
for (const width of [1440, 390]) test(`trainer commission edit, retry and snapshot at ${width}px`, async ({ page }, info) => {
  await page.setViewportSize({ width, height: 844 })
  await page.addInitScript(() => {
    localStorage.setItem('horsecrm.access_token', 'cookie-session')
    localStorage.setItem('horsecrm.role', 'ADMIN')
    localStorage.setItem('horsecrm.email', 'admin@test.local')
  })
  let commissionPercent = '30', attempts = 0
  const trainer = () => ({ id, name: 'Тренер со ставкой', commissionPercent, baseRate: '0', maxDailyLoad: 480, maxParallelLessons: 4, isPublic: true, order: 0, phone: null, qualification: null })
  await page.route('**/api/trainers**', async route => {
    if (route.request().method() === 'PATCH') {
      attempts++
      expect(route.request().postDataJSON().commissionPercent).toBe(100)
      if (attempts === 1) return route.fulfill({ status: 409, json: { message: 'Повторите сохранение ставки' } })
      commissionPercent = '100'
      return route.fulfill({ json: trainer() })
    }
    return route.fulfill({ json: new URL(route.request().url()).pathname.endsWith(id) ? trainer() : [trainer()], headers: { 'x-total-count': '1' } })
  })
  await page.goto('/trainers')
  await page.getByRole('button', { name: 'Тренер со ставкой', exact: true }).first().click()
  const card = page.getByRole('dialog', { name: 'Карточка тренера', exact: true })
  await expect(card.getByText('30%', { exact: true })).toBeVisible()
  await card.getByRole('button', { name: 'Редактировать', exact: true }).click()
  const drawer = page.getByRole('dialog', { name: 'Редактирование тренера', exact: true })
  await expect(drawer.getByRole('spinbutton', { name: 'Ставка тренера, %' })).toHaveValue('30.00')
  await drawer.getByRole('button', { name: '50%', exact: true }).click()
  await expect(drawer.getByRole('spinbutton', { name: 'Ставка тренера, %' })).toHaveValue('50.00')
  await drawer.getByRole('button', { name: '100%', exact: true }).click()
  await drawer.getByRole('button', { name: 'Сохранить', exact: true }).click()
  await expect(drawer.getByText('Повторите сохранение ставки', { exact: true })).toBeVisible()
  await expect(drawer.getByRole('spinbutton', { name: 'Ставка тренера, %' })).toHaveValue('100.00')
  await page.screenshot({ path: info.outputPath('commission-retry.png'), fullPage: true })
  await drawer.getByRole('button', { name: 'Сохранить', exact: true }).click()
  await expect(drawer).toBeHidden()
  await expect(card.getByText('100%', { exact: true })).toBeVisible()
  expect(attempts).toBe(2)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
})

test('paid statement displays its 100% snapshot despite current trainer rate of 30%', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('horsecrm.access_token', 'cookie-session')
    localStorage.setItem('horsecrm.role', 'ADMIN')
    localStorage.setItem('horsecrm.email', 'admin@test.local')
  })
  await page.route('**/api/payroll/statements?*', route => route.fulfill({ json: [{ id, type: 'ADVANCE', status: 'PAID', commissionPercent: '100', trainer: { name: 'Ставка на дату расчёта', commissionPercent: '30' }, periodStart: '2026-11-01', periodEnd: '2026-11-15', lessonsCount: 1, nominalBase: '1000', accrued: '1000', advanceDeducted: '0', totalAmount: '1000', lessonBreakdown: [{ id, startTime: '2026-11-02T07:00Z', serviceName: 'Занятие', nominalPrice: '1000', trainerPayout: '1000', commissionPercent: 100 }] }] }))
  await page.goto('/staff?tab=trainers')
  await expect(page.getByText('100%', { exact: true }).first()).toBeVisible()
  await page.getByText('Детализация', { exact: true }).first().click()
  await expect(page.getByText(/× 100% →/)).toBeVisible()
})
