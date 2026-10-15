import { test, expect } from '@playwright/test'

const horseId = '3b241101-e2bb-4255-8caf-4136c566a962'
const horse = { id: horseId, name: 'Валдай', status: 'active', isUnavailable: false, healthLogs: [], boardingContracts: [], bookings: [] }
const procedures = [
  ['Вакцинация', 'vaccination'], ['Дегельминтизация', 'deworming'], ['Ковка', 'shoeing'],
  ['Осмотр ветеринара', 'vet_check'], ['Стоматолог', 'dentist'],
] as const

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('horsecrm.access_token', 'cookie-session')
    localStorage.setItem('horsecrm.role', 'ADMIN')
    localStorage.setItem('horsecrm.email', 'qa@example.com')
  })
  await page.route('**/api/horses?*', route => route.fulfill({ json: [horse], headers: { 'x-total-count': '1' } }))
  await page.route(`**/api/horses/${horseId}`, route => route.fulfill({ json: horse }))
  await page.route('**/api/bookings/horse-issues?*', route => route.fulfill({ json: [], headers: { 'x-total-count': '0' } }))
  await page.route('**/api/vet/events?*', route => {
    const params = new URL(route.request().url()).searchParams
    expect(params.get('offset')).toBe('0')
    expect(params.get('limit')).toBe('20')
    expect(params.get('horseId')).toBe(horseId)
    return route.fulfill({ json: { data: [], total: 0 } })
  })
})

async function openHorseProcedure(page: import('@playwright/test').Page) {
  await page.goto('/horses')
  await page.getByRole('button', { name: 'Валдай', exact: true }).click()
  await page.getByRole('tab', { name: 'Здоровье и ковка' }).click()
  await page.getByRole('button', { name: 'Добавить процедуру' }).click()
}

for (const invalidId of [undefined, null, '', 'invalid-id', 123, { id: horseId }]) {
  test(`horse journal does not request logs for invalid card ID ${JSON.stringify(invalidId)}`, async ({ page }) => {
    const requests: string[] = []
    page.on('request', request => { if (/\/api\/vet\/(events|upcoming)/.test(request.url())) requests.push(request.url()) })
    await page.route(`**/api/horses/${horseId}`, route => route.fulfill({ json: { ...horse, id: invalidId } }))
    await page.goto('/horses')
    await page.getByRole('button', { name: 'Валдай', exact: true }).click()
    await page.getByRole('tab', { name: 'Здоровье и ковка' }).click()
    const section = page.getByRole('region', { name: 'Здоровье и ковка' })
    await expect(section.getByText('Журнал здоровья недоступен')).toBeVisible()
    await expect(section.getByRole('button', { name: 'Добавить процедуру' })).toHaveCount(0)
    expect(requests).toEqual([])
  })
}

test('waits for the horse card to load and then sends its UUID', async ({ page }) => {
  let release!: () => void
  const pending = new Promise<void>(resolve => { release = resolve })
  const requests: string[] = []
  await page.route(`**/api/horses/${horseId}`, async route => { await pending; await route.fulfill({ json: horse }) })
  await page.route('**/api/vet/events?*', route => {
    const id = new URL(route.request().url()).searchParams.get('horseId')
    expect(id).toBe(horseId); requests.push(id!)
    return route.fulfill({ json: { data: [], total: 0 } })
  })
  await page.goto('/horses')
  await page.getByRole('button', { name: 'Валдай', exact: true }).click()
  await expect(page.getByRole('dialog', { name: 'Карточка лошади' })).toBeVisible()
  expect(requests).toEqual([])
  release()
  await page.getByRole('tab', { name: 'Здоровье и ковка' }).click()
  await expect.poll(() => requests).toContain(horseId)
  expect(requests.every(id => id === horseId)).toBe(true)
})

test('horse journal preserves the last type filter without an extra question mark', async ({ page }) => {
  let filtered = false
  await page.route('**/api/vet/events?*', route => {
    const params = new URL(route.request().url()).searchParams
    expect(params.get('offset')).toBe('0'); expect(params.get('limit')).toBe('20')
    expect(params.get('horseId')).toBe(horseId)
    if (params.has('type')) { expect(params.get('type')).toBe('shoeing'); filtered = true }
    return route.fulfill({ json: { data: [], total: 0 } })
  })
  await page.goto('/horses')
  await page.getByRole('button', { name: 'Валдай', exact: true }).click()
  await page.getByRole('tab', { name: 'Здоровье и ковка' }).click()
  await page.getByRole('combobox', { name: 'Тип процедуры' }).focus()
  await page.keyboard.press('ArrowDown')
  await page.locator('.ant-select-dropdown:visible').getByTitle('Ковка', { exact: true }).click()
  await expect.poll(() => filtered).toBe(true)
})

for (const [label, key] of procedures) {
  test(`horse health form sends ${key} for ${label}`, async ({ page }) => {
    await openHorseProcedure(page)
    let payload: Record<string, unknown> | undefined
    await page.route('**/api/vet/events', async route => {
      payload = route.request().postDataJSON()
      expect(payload).toMatchObject({ horseId, type: key, status: 'scheduled' })
      expect(typeof payload?.type).toBe('string')
      await route.fulfill({ status: 201, json: { id: 'event1', ...payload } })
    })
    const dialog = page.getByRole('dialog', { name: 'Новая вет-процедура' })
    await dialog.getByRole('combobox', { name: 'Процедура', exact: true }).focus()
    await page.keyboard.press('ArrowDown')
    await page.locator('.ant-select-dropdown:visible').getByTitle(label, { exact: true }).click()
    await dialog.getByRole('button', { name: 'Сохранить процедуру' }).click()
    await expect(dialog).toHaveCount(0)
    expect(payload?.type).toBe(key)
  })
}

test('default procedure sends shoeing without opening the select', async ({ page }) => {
  await openHorseProcedure(page)
  let type: unknown
  await page.route('**/api/vet/events', route => {
    type = route.request().postDataJSON().type
    return route.fulfill({ status: 201, json: { id: 'event1' } })
  })
  const dialog = page.getByRole('dialog', { name: 'Новая вет-процедура' })
  await dialog.getByRole('button', { name: 'Сохранить процедуру' }).click()
  await expect(dialog).toHaveCount(0)
  expect(type).toBe('shoeing')
})

for (const [value, offset] of [['', 0], ['-5', 0], ['NaN', 0], ['Infinity', 0], ['2.75', 20], ['3', 40]] as const) {
  test(`vet journal normalizes URL page=${value} to offset ${offset} on initial load and history`, async ({ page }) => {
    const requests: string[] = []
    for (const endpoint of ['upcoming', 'events']) {
      await page.route(`**/api/vet/${endpoint}?*`, route => {
        const params = new URL(route.request().url()).searchParams
        expect(params.get('offset')).toBe(String(offset))
        expect(params.get('limit')).toBe('20')
        requests.push(endpoint)
        return route.fulfill({ json: { data: [], total: 0 } })
      })
    }
    await page.goto(`/vet?page=${encodeURIComponent(value)}`)
    await expect.poll(() => requests).toContain('upcoming')
    await expect(page.getByText('Не удалось загрузить журнал')).toHaveCount(0)
    // Changing period resets the page to the valid first page.
    await page.route('**/api/vet/events?*', route => {
      const params = new URL(route.request().url()).searchParams
      // Period state and URL navigation can render separately; both requests
      // must be valid, and the settled request must use the first page.
      expect([String(offset), '0']).toContain(params.get('offset'))
      expect(params.get('limit')).toBe('20')
      if (params.get('offset') === '0') requests.push('events')
      return route.fulfill({ json: { data: [], total: 0 } })
    })
    await page.getByRole('combobox', { name: 'Период веткалендаря' }).focus()
    await page.keyboard.press('ArrowDown')
    await page.getByTitle('Все процедуры', { exact: true }).click()
    await expect.poll(() => requests).toContain('events')
    await expect(page).toHaveURL(/page=1/)
  })
}
