import { test, expect } from './fixtures'
test.use({ timezoneId: 'America/New_York' })

const id = '11111111-1111-4111-8111-111111111111'
const contractId = '22222222-2222-4222-8222-222222222222'
const client = { name: 'Олеся Попова', firstName: 'Олеся', lastName: 'Попова' }
const receipt = { id, clientId: id, client, amount: '25000', method: 'CASH', status: 'PAID', paidAt: '2026-11-20T09:00:00Z',
  createdAt: '2026-11-20T09:00:00Z', boardingContract: { id: contractId, horse: { name: 'Шанель' } }, description: 'Постой' }

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-11-24T12:00:00Z'))
  await page.addInitScript(() => {
    localStorage.setItem('horsecrm.access_token', 'cookie-session')
    localStorage.setItem('horsecrm.role', 'ADMIN')
    localStorage.setItem('horsecrm.email', 'qa@example.com')
  })
  await page.route('**/api/payments/boarding-cash', route => route.fulfill({ json: { cash: '25000', bank: '10000', total: '35000', unspecified: '0' } }))
  await page.route('**/api/payments/boarding-options', route => route.fulfill({ json: [{ id: contractId, clientId: id, client, horse: { name: 'Шанель', status: 'rest', isUnavailable: true } }] }))
  await page.route('**/api/payments?*', route => route.fulfill({ json: [receipt], headers: { 'x-total-count': '1' } }))
})

for (const width of [1440, 390]) test(`boarding accounts and receipt correction at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 900 })
  let patched: Record<string, unknown> | undefined
  let attempts = 0
  await page.route(`**/api/payments/${id}`, async route => {
    if (route.request().method() !== 'PATCH') return route.fulfill({ json: receipt })
    patched = route.request().postDataJSON(); attempts++
    return attempts === 1 ? route.fulfill({ status: 409, json: { message: 'Нельзя изменить оплату закрытой смены' } }) : route.fulfill({ json: { ...receipt, ...patched } })
  })
  await page.goto('/payments?cashboxType=BOARDING')
  await expect(page.getByRole('button', { name: 'Изменить', exact: true })).toBeVisible()
  if (width === 1440) {
    await expect(page.locator('.ant-table-small').last()).toBeVisible()
    expect(await page.locator('.ant-table-content').last().evaluate(element => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(1)
  }
  await expect(page.getByText('Наличные (Касса постоя)', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: '+ Приход', exact: true }).click()
  const income = page.getByRole('dialog')
  await income.getByLabel('Договор / владелец').click()
  await page.getByTitle('Олеся Попова · Шанель', { exact: true }).click()
  await expect(income.getByTitle('Олеся Попова · Шанель', { exact: true })).toBeVisible()
  await income.getByRole('button', { name: 'Закрыть', exact: true }).click()
  await page.getByRole('button', { name: 'Закрыть', exact: true }).last().click()
  await expect(income).toBeHidden()
  await page.getByRole('button', { name: 'Изменить', exact: true }).click()
  const drawer = page.getByRole('dialog')
  await expect(drawer.getByLabel('Сумма, ₽')).toHaveValue('25000.00')
  await drawer.getByLabel('Способ оплаты').focus()
  await drawer.getByLabel('Способ оплаты').press('ArrowDown')
  await page.getByTitle('Карта', { exact: true }).click()
  await drawer.getByRole('button', { name: 'Сохранить изменения', exact: true }).click()
  await expect(drawer.getByText('Нельзя изменить оплату закрытой смены')).toBeVisible()
  expect(patched?.method).toBe('CARD')
  expect(patched?.paidAt).toBe('2026-11-20T09:00:00Z')
  await drawer.getByRole('button', { name: 'Сохранить изменения', exact: true }).click()
  await expect(drawer).toBeHidden()
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1)
  await page.screenshot({ path: test.info().outputPath(`boarding-payments-${width}.png`), fullPage: true })
})

test('boarding bank expense preserves inputs on insufficient funds and posts to boarding', async ({ page }) => {
  let posted: Record<string, unknown> | undefined
  await page.route('**/api/finance/expenses', route => {
    posted = route.request().postDataJSON()
    return route.fulfill({ status: 400, json: { message: 'Недостаточно средств на выбранном счёте постоя' } })
  })
  await page.goto('/payments?cashboxType=BOARDING')
  await page.getByRole('button', { name: '− Расход', exact: true }).click()
  const drawer = page.getByRole('dialog')
  await drawer.getByLabel('Счёт').focus()
  await drawer.getByLabel('Счёт').press('ArrowDown')
  await page.getByTitle('Расчётный счёт (Р/С)', { exact: true }).click()
  await drawer.getByLabel('Категория расхода').focus()
  await drawer.getByLabel('Категория расхода').press('ArrowDown')
  await page.getByTitle('Корма', { exact: true }).click()
  await drawer.getByLabel('Сумма, ₽').fill('500')
  await drawer.getByLabel('Комментарий').fill('Корма для постоя')
  await drawer.getByRole('button', { name: 'Провести', exact: true }).click()
  await expect(drawer.getByText('Недостаточно средств на выбранном счёте постоя')).toBeVisible()
  expect(posted?.cashboxType).toBe('BOARDING')
  expect(posted?.paymentMethod).toBe('CARD')
  expect(posted?.amount).toBe(500)
  await expect(drawer.getByLabel('Комментарий')).toHaveValue('Корма для постоя')
})

test('membership filters reset server pagination and retain query count', async ({ page }) => {
  await page.route('**/api/memberships?*', route => route.fulfill({ json: [], headers: { 'x-total-count': '0' } }))
  await page.goto('/memberships')
  await page.getByRole('combobox', { name: 'Статус абонемента' }).click()
  const request = page.waitForRequest(req => req.url().includes('/memberships?') && new URL(req.url()).searchParams.get('state') === 'expired')
  await page.getByTitle('Истёк срок', { exact: true }).click()
  expect(new URL((await request).url()).searchParams.get('_start')).toBe('0')
  await expect(page.getByText('Найдено: 0')).toBeVisible()
  const reset = page.waitForRequest(req => req.url().includes('/memberships?') && !new URL(req.url()).searchParams.has('state'))
  await page.getByRole('button', { name: 'Сбросить фильтры' }).click()
  await reset
})
