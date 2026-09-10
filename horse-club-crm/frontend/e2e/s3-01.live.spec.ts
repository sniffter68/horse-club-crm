import { test, expect } from '@playwright/test'

const credentials = { email: 'admin@test.ru', password: 'admin123' }
const api = 'http://localhost:3000/api'

test('real API authenticates the seeded administrator', async ({ request }) => {
  const response = await request.post(`${api}/auth/login`, { data: credentials })
  expect(response.status()).toBe(200)
  const data = await response.json()
  expect(data.user).toMatchObject({ email: credentials.email, role: 'ADMIN' })
  expect(typeof data.access_token).toBe('string')
  expect(data.access_token.split('.')).toHaveLength(3)
  const clients = await request.get(`${api}/clients?_start=0&_end=10`, {
    headers: { Authorization: `Bearer ${data.access_token}` },
  })
  expect(clients.status()).toBe(200)
  expect(Array.isArray(await clients.json())).toBe(true)
  expect(clients.headers()['x-total-count']).toMatch(/^\d+$/)
})

test('real API rejects incorrect credentials and missing or invalid JWT', async ({ request }) => {
  expect((await request.post(`${api}/auth/login`, { data: { ...credentials, password: 'incorrect-password' } })).status()).toBe(401)
  expect((await request.get(`${api}/clients`)).status()).toBe(401)
  expect((await request.get(`${api}/clients`, { headers: { Authorization: 'Bearer invalid-token' } })).status()).toBe(401)
})

for (const route of ['/', ...['clients', 'horses', 'trainers', 'services'].flatMap(resource => [`/${resource}`, `/${resource}/new`, `/${resource}/edit/1`]), '/schedule', '/settings']) {
  test(`unauthenticated route ${route}`, async ({ page }) => {
    await page.goto(route)
    await expect(page).toHaveURL(/\/login(?:\?|$)/)
    await expect(page.getByRole('button', { name: 'Войти', exact: true })).toBeVisible()
  })
}

test('real UI login, catalog requests, navigation, session persistence and logout', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()) })
  await page.goto('/login')
  await page.getByLabel('Email', { exact: true }).fill(credentials.email)
  await page.getByLabel('Пароль', { exact: true }).fill(credentials.password)
  const loginResponse = page.waitForResponse(response => response.url().endsWith('/api/auth/login'))
  await page.getByRole('button', { name: 'Войти', exact: true }).click()
  const response = await loginResponse
  expect(response.request().method()).toBe('POST')
  expect(response.request().postDataJSON()).toEqual(credentials)
  expect(response.status()).toBe(200)
  await expect(page).toHaveURL(/\/clients(?:\?|$)/)
  expect(await page.evaluate(() => localStorage.getItem('horsecrm.role'))).toBe('ADMIN')
  expect(await page.evaluate(async () => {
    const path = '/src/authProvider.ts'
    return (await import(/* @vite-ignore */ path)).authProvider.getPermissions()
  })).toBe('ADMIN')

  // S3-01 screens are headings: call the actual provider in the browser.
  // No request interception or response substitution is used in this suite.
  for (const resource of ['clients', 'horses', 'trainers', 'services']) {
    const pending = page.waitForResponse(response => response.url().includes(`/api/${resource}?`) && new URL(response.url()).searchParams.get('_start') === '10')
    const result = await page.evaluate(async resource => {
      const path = '/src/dataProvider.ts'
      return (await import(/* @vite-ignore */ path)).dataProvider.getList({ resource, pagination: { currentPage: 2, pageSize: 10 } })
    }, resource)
    const response = await pending
    expect(response.status()).toBe(200)
    const url = new URL(response.url())
    expect(url.searchParams.get('_start')).toBe('10')
    expect(url.searchParams.get('_end')).toBe('20')
    const bearerMatches = await page.evaluate(header => header === `Bearer ${localStorage.getItem('horsecrm.access_token')}`, response.request().headers().authorization)
    expect(bearerMatches).toBe(true)
    expect(result.total).toBe(Number(response.headers()['x-total-count']))
    expect(result.data).toEqual(await response.json())
  }
  for (const [route, title] of [['clients', 'Клиенты'], ['horses', 'Лошади'], ['trainers', 'Тренеры'], ['services', 'Услуги'], ['schedule', 'Расписание занятий'], ['settings', 'Режим работы клуба']]) {
    await page.locator(`aside a[href="/${route}"]`).click()
    await expect(page).toHaveURL(url => url.pathname === `/${route}`)
    await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible()
  }
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Режим работы клуба' })).toBeVisible()
  await page.getByRole('menuitem', { name: 'Выход' }).click()
  await expect(page).toHaveURL(/\/login(?:\?|$)/)
  expect(await page.evaluate(() => localStorage.getItem('horsecrm.access_token'))).toBeNull()
  expect(await page.evaluate(() => localStorage.getItem('horsecrm.role'))).toBeNull()
  expect(errors).toEqual([])
})
