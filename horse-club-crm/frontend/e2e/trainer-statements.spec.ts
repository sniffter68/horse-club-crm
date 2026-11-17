import { test, expect } from './fixtures'

const id = '11111111-1111-4111-8111-111111111111'
for (const width of [1440, 390]) test(`advance, final and closing reconciliation at ${width}px`, async ({ page }, info) => {
  test.setTimeout(60000)
  await page.setViewportSize({ width, height: 844 })
  await page.addInitScript(() => {
    localStorage.setItem('horsecrm.access_token', 'cookie-session')
    localStorage.setItem('horsecrm.role', 'ADMIN')
    localStorage.setItem('horsecrm.email', 'admin@test.local')
  })
  type Statement = { id: string; type: string; status: string; totalAmount: string; advanceDeducted: string }
  let rows: Statement[] = [], failPay = true, payments = 0
  const present = (row: Statement) => ({ ...row, staff: { fullName: 'Анна Иванова' }, lessonsCount: 2, nominalBase: '2000', accrued: '600',
    periodStart: '2026-11-01', periodEnd: '2026-11-15', lessonBreakdown: [{ id, startTime: '2026-11-02T07:00Z', serviceName: 'Индивидуальное занятие', nominalPrice: '2000', trainerPayout: '600' }] })
  await page.route('**/api/payroll/statements?*', route => route.fulfill({ json: rows.map(present) }))
  await page.route('**/api/payroll/statements/generate', route => {
    const body = route.request().postDataJSON() as { type: string; month: string; periodStart: string; periodEnd: string }
    expect(body.periodStart.slice(0, 7)).toBe(body.month)
    const final = body.type === 'FINAL_SALARY'
    if (final) expect(body.periodEnd.endsWith('-30')).toBe(true)
    rows.push({ id: final ? '22222222-2222-4222-8222-222222222222' : id, type: body.type, status: 'DRAFT', totalAmount: final ? '300' : '600', advanceDeducted: final ? '300' : '0' })
    return route.fulfill({ json: rows.map(present) })
  })
  await page.route('**/api/payroll/statements/*/approve', route => {
    rows.at(-1)!.status = 'APPROVED'; return route.fulfill({ json: present(rows.at(-1)!) })
  })
  await page.route('**/api/payroll/statements/*/pay', async route => {
    payments++
    if (failPay) { failPay = false; return route.fulfill({ status: 409, json: { message: 'Касса изменилась. Повторите выплату' } }) }
    rows.at(-1)!.status = 'PAID'; return route.fulfill({ json: present(rows.at(-1)!) })
  })
  await page.goto('/staff?tab=trainers')
  await expect(page.getByText('Ведомостей пока нет. Выберите период и сформируйте расчёт.')).toBeVisible()
  await page.getByRole('button', { name: 'Сформировать ведомость', exact: true }).click()
  await page.getByText('Детализация', { exact: true }).click()
  await expect(page.getByText('Индивидуальное занятие', { exact: false })).toBeVisible()
  await page.getByRole('button', { name: 'Утвердить', exact: true }).click()
  await page.getByRole('dialog', { name: 'Утвердить ведомость?' }).getByRole('button', { name: 'Утвердить', exact: true }).click()
  await page.getByRole('button', { name: 'Выплатить из основной кассы', exact: true }).click()
  const pay = page.getByRole('dialog', { name: 'Выплатить из основной кассы?' })
  await pay.getByRole('button', { name: 'Выплатить', exact: true }).click()
  await expect(pay.getByRole('alert')).toContainText('Касса изменилась')
  await pay.getByRole('button', { name: 'Выплатить', exact: true }).click()
  await expect(page.getByText('Выплачено', { exact: true })).toBeVisible()
  expect(payments).toBe(2)
  await page.getByRole('combobox', { name: 'Тип ведомости' }).focus()
  await page.getByRole('combobox', { name: 'Тип ведомости' }).press('ArrowDown')
  await page.getByRole('option', { name: 'Зарплата', exact: true }).click()
  await page.getByRole('button', { name: 'Сформировать ведомость', exact: true }).click()
  await expect(page.getByText('300,00 руб.', { exact: true }).first()).toBeVisible()
  await page.screenshot({ path: info.outputPath(`statements-${width}.png`), fullPage: true })
  await page.route('**/api/payments/shifts/current', route => route.fulfill({ json: null }))
  await page.route('**/api/finance/summary?*', route => route.fulfill({ json: { operations: [], operationsCount: 0 } }))
  await page.route('**/api/finance/expenses?*', route => route.fulfill({ json: { data: [], total: 0 } }))
  await page.route('**/api/finance/monthly-closing/**', route => route.fulfill({ json: { isClosed: false, membershipsAdvanceSummary: { totalAdvance: '0', rows: [] } } }))
  const snapshot = { isClosed: false, pendingLessons: 0, warnings: [], cashboxes: ['MAIN', 'BOARDING'].map(cashbox => ({ cashbox, opening: '1000', income: '500', expense: '300', closing: '1200', oneOff: '200', memberships: '200', other: '100' })), memberships: { recognizedRevenue: '200', remainingLessons: 4, deferred: '800' } }
  await page.route('**/api/finance/closing-preview?*', route => route.fulfill({ json: snapshot }))
  await page.route('**/api/finance/close-period', route => route.fulfill({ json: { ...snapshot, isClosed: true } }))
  await page.goto('/cash-desk')
  const trigger = page.getByRole('button', { name: 'Закрытие смены / месяца', exact: true })
  await trigger.click()
  const closing = page.getByRole('dialog', { name: 'Закрытие смены / месяца', exact: true })
  await expect(closing.getByText('Основная касса', { exact: true })).toBeVisible()
  await expect(closing.getByText('Касса постоя', { exact: true })).toBeVisible()
  await expect(closing.getByText('4 шт.', { exact: true })).toBeVisible()
  await closing.getByRole('combobox', { name: 'Тип закрытия' }).focus()
  await closing.getByRole('combobox', { name: 'Тип закрытия' }).press('ArrowDown')
  await page.getByRole('option', { name: 'Закрыть месяц', exact: true }).click()
  await expect(closing.getByRole('button', { name: 'Подтвердить закрытие периода' })).toBeEnabled()
  await page.screenshot({ path: info.outputPath(`closing-${width}.png`), fullPage: true })
  await closing.getByRole('button', { name: 'Подтвердить закрытие периода' }).click()
  await page.getByRole('dialog', { name: 'Закрыть выбранный месяц?' }).getByRole('button', { name: 'Закрыть период', exact: true }).click()
  await expect(closing.getByText('Период закрыт. Редактирование заблокировано.')).toBeVisible()
  await expect(closing.getByRole('button', { name: 'Подтвердить закрытие периода' })).toBeDisabled()
  await closing.getByRole('button', { name: 'Отмена', exact: true }).click()
  await expect(trigger).toBeFocused()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
})
