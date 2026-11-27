import { test, expect, type Page } from './fixtures'

const id = '11111111-1111-4111-8111-111111111111'
const row = {
  id, name: 'Алиса Морозова', firstName: 'Алиса', lastName: 'Морозова', fullName: 'Марина Соколова',
  email: 'rider@example.com', phone: '+79991234567', role: 'TRAINER', roleTitle: 'Тренер', isActive: true,
  user: { id, role: 'TRAINER', crmAccess: true }, trainer: { id, name: 'Марина Соколова' }, trainerId: id,
  createdAt: '2026-11-01T09:00:00Z', clientType: 'REGULAR', isRider: true, isPayer: true, payments: [], contracts: [],
  breed: 'Русская верховая', coat: 'Гнедая', isUnavailable: false, maxDailyMinutes: 180, minRestMinutes: 45,
  client: { id, firstName: 'Алиса', lastName: 'Морозова' }, horse: { id, name: 'Алмаз' }, stall: { id, name: 'Денник 1' },
  monthlyRate: 28000, startsAt: '2026-11-01', status: 'ACTIVE', amount: 18000, method: 'CASH',
  paidAt: '2026-11-24T09:00:00Z', title: 'Индивидуальная тренировка', durationMinutes: 45, maxCapacity: 1,
  price: 2500, cancellationWindowHours: 24, allowMembership: true, serviceDirection: 'allowIndividual',
}

async function setup(page: Page, options: { demo?: boolean; authenticated?: boolean; readonly?: boolean } = {}) {
  await page.addInitScript(({ authenticated, readonly }) => {
    if (authenticated !== false) {
      localStorage.setItem('horsecrm.access_token', 'cookie-session')
      localStorage.setItem('horsecrm.role', readonly ? 'MANAGER' : 'ADMIN')
      localStorage.setItem('horsecrm.email', 'owner@example.com')
    }
  }, options)
  await page.route('**/api/**', route => {
    const path = new URL(route.request().url()).pathname
    let json: unknown = []
    let total = 0
    if (path.endsWith('/demo/status')) json = { isDemo: options.demo === true }
    else if (path.endsWith('/my-permissions')) json = { role: options.readonly ? 'MANAGER' : 'ADMIN', modules:
      ['SCHEDULE', 'STABLES', 'VETERINARY', 'CASHBOX', 'STAFF_PAYROLL'].map(module => ({ module, isEnabled: true, accessLevel: options.readonly ? 'READ_ONLY' : 'FULL' })) }
    else if (path.endsWith('/access/me')) json = { permissions: { lessonCreateAny: true, healthRead: true, boardingAccess: true, financeRead: true } }
    else if (path.endsWith('/cashbox/summary')) json = { mainBalance: 145800, boardingBalance: 106000, mainOperationsCount: 8, boardingOperationsCount: 4,
      balanceCash: '67800', balanceCard: '184000', balanceTotal: '251800' }
    else if (path.endsWith('/leads/events')) return route.fulfill({ contentType: 'text/event-stream', body: ': heartbeat\n\n' })
    else if (['clients', 'horses', 'stalls', 'boarding-contracts', 'services', 'payments'].some(resource => path === `/api/${resource}`)) {
      json = [path.endsWith('/payments') ? { ...row, status: 'PAID' } : row]; total = 1
    } else if (path === '/api/staff') { json = { data: [row], total: 1 }; total = 1 }
    return route.fulfill({ json, headers: { 'x-total-count': String(total) } })
  })
}

for (const width of [1366, 1440]) for (const resource of ['clients', 'horses', 'stalls', 'boarding', 'staff', 'payments', 'services']) {
  test(`${resource} fits ${width}x768 with populated tables`, async ({ page }, info) => {
    await setup(page, { demo: true })
    const errors: string[] = []
    page.on('pageerror', error => errors.push(error.message))
    await page.setViewportSize({ width, height: 768 })
    await page.goto(`/${resource}`)
    await expect(page.locator('tbody tr.ant-table-row')).toHaveCount(1)
    await expect(page.locator('.ant-spin-spinning')).toHaveCount(0)
    await expect(page.getByRole('region', { name: 'Демо-стенд' })).toBeVisible()
    const measurements = await page.evaluate(() => {
      const main = document.querySelector('.crm-main')!
      const header = document.querySelector('.cash-desk-header')!
      const panels = [...document.querySelectorAll('.ant-table-content, .ant-table-body')]
      const bounds = main.getBoundingClientRect()
      const overlaps = [...main.querySelectorAll('button, input, .ant-select-selector')].filter(el => {
        const rect = el.getBoundingClientRect()
        return rect.width && rect.height && (rect.left < bounds.left - 1 || rect.right > bounds.right + 1)
      }).map(el => el.textContent)
      return { document: document.documentElement.scrollWidth - innerWidth, main: main.scrollWidth - main.clientWidth,
        tables: panels.map(el => el.scrollWidth - el.clientWidth), headerHeight: header.getBoundingClientRect().height,
        mainTop: bounds.top, headerBottom: header.getBoundingClientRect().bottom, overlaps,
        tableTop: document.querySelector('tbody tr.ant-table-row')!.getBoundingClientRect().top,
        rowHeight: document.querySelector('tbody tr.ant-table-row')!.getBoundingClientRect().height }
    })
    expect(measurements.document).toBeLessThanOrEqual(1)
    expect(measurements.main).toBeLessThanOrEqual(1)
    expect(measurements.tables.every(overflow => overflow <= 1)).toBe(true)
    expect(measurements.headerHeight).toBeLessThanOrEqual(44)
    expect(measurements.mainTop).toBeGreaterThanOrEqual(measurements.headerBottom)
    expect(measurements.overlaps).toEqual([])
    expect(measurements.rowHeight).toBeGreaterThanOrEqual(42)
    expect(measurements.rowHeight).toBeLessThanOrEqual(44)
    expect(measurements.tableTop).toBeLessThan(600)
    expect(errors).toEqual([])
    await page.screenshot({ path: info.outputPath(`${resource}-${width}.png`) })
  })
}

test('sidebar collapse survives reload', async ({ page }) => {
  await setup(page)
  await page.setViewportSize({ width: 1366, height: 768 })
  await page.goto('/clients')
  await page.locator('.ant-layout-sider-trigger').click()
  await expect(page.locator('.crm-sidebar')).toHaveClass(/collapsed/)
  await page.reload()
  await expect(page.locator('.crm-sidebar')).toHaveClass(/collapsed/)
  expect(await page.evaluate(() => localStorage.getItem('horsecrm.sidebar-collapsed'))).toBe('true')
})

test('demo quick login sends role only and opens trainer board', async ({ page }) => {
  await setup(page, { demo: true, authenticated: false })
  let body: unknown
  await page.route('**/api/demo/login', route => {
    body = route.request().postDataJSON() as unknown
    return route.fulfill({ json: { access_token: 'cookie-session', user: { email: 'trainer@example.com', role: 'TRAINER' } } })
  })
  await page.goto('/login')
  await page.getByRole('button', { name: 'Тренер', exact: true }).click()
  await expect(page).toHaveURL(/\/trainer$/)
  expect(body).toEqual({ role: 'TRAINER' })
  await expect(page.getByRole('region', { name: 'Демо-стенд' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Сбросить данные' })).toHaveCount(0)
})

test('production login hides demo accounts', async ({ page }) => {
  await setup(page, { authenticated: false })
  await page.goto('/login')
  await expect(page.getByRole('button', { name: 'Войти', exact: true })).toBeVisible()
  await expect(page.getByRole('region', { name: 'Быстрый вход на демо-стенд' })).toHaveCount(0)
})

test('reset confirmation cancels, retains errors and reloads after success', async ({ page }) => {
  await setup(page, { demo: true })
  let calls = 0
  let fail = true
  await page.route('**/api/demo/reset', route => {
    calls++
    return route.fulfill(fail ? { status: 500, json: { message: 'Не удалось восстановить данные' } } : { json: { success: true } })
  })
  await page.goto('/clients')
  await page.getByRole('button', { name: 'Сбросить данные', exact: true }).click()
  await page.getByRole('button', { name: 'Отмена', exact: true }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  expect(calls).toBe(0)
  await page.getByRole('button', { name: 'Сбросить данные', exact: true }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Сбросить данные', exact: true }).click()
  await expect(page.getByText('Не удалось восстановить данные', { exact: true })).toBeVisible()
  await expect(page.getByRole('dialog')).toBeVisible()
  await expect(page.getByRole('dialog').getByRole('button', { name: 'Сбросить данные', exact: true })).not.toHaveClass(/ant-btn-loading/)
  fail = false
  await Promise.all([
    page.waitForEvent('load'),
    page.getByRole('dialog').getByRole('button', { name: 'Сбросить данные', exact: true }).click(),
  ])
  expect(calls).toBe(2)
  await expect(page.getByRole('dialog')).toHaveCount(0)
})

test('read-only lists hide create actions', async ({ page }) => {
  await setup(page, { readonly: true })
  await page.goto('/horses')
  await expect(page.locator('tbody tr.ant-table-row')).toHaveCount(1)
  await expect(page.getByRole('button', { name: 'Создать', exact: true })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Редактировать', exact: true })).toHaveCount(0)
})

test('row actions support keyboard focus and Escape; membership details remain available', async ({ page }) => {
  await setup(page)
  await page.setViewportSize({ width: 1366, height: 768 })
  await page.goto('/clients')
  const trigger = page.locator('tbody').getByRole('button', { name: /^Действия/ })
  await trigger.focus()
  await trigger.press('Enter')
  const actions = page.locator('.row-actions-menu')
  await expect(actions).toBeVisible()
  await expect(actions.getByRole('button', { name: 'Редактировать', exact: true })).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(actions).toBeHidden()
  await expect(trigger).toBeFocused()
  await page.getByRole('button', { name: 'Нет абонемента · выдать' }).click()
  await expect(page.getByRole('link', { name: '+ Выдать абонемент' })).toBeVisible()
})

test('compact catalogue retains mobile cards and authored filters', async ({ page }, info) => {
  await setup(page, { demo: true })
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/clients')
  await expect(page.locator('.responsive-record-list')).toBeVisible()
  await page.getByRole('combobox', { name: 'Тип клиента', exact: true }).click()
  await expect(page.locator('.ant-select-dropdown:visible').getByText('Постоянные', { exact: true })).toBeVisible()
  await page.keyboard.press('Escape')
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1)
  await page.screenshot({ path: info.outputPath('clients-390.png') })
})
