import { test, expect, type Page } from '@playwright/test'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

test.use({ actionTimeout: 10000 })
async function login(page: Page, email: string, password: string) {
  await page.goto('/login')
  await page.getByLabel('Email', { exact: true }).fill(email)
  await page.getByLabel('Пароль', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'Войти', exact: true }).click()
  await expect(page).toHaveURL(/\/clients/)
}
async function setTime(page: Page, label: string, value: string) {
  await page.getByLabel(label, { exact: true }).fill(value)
  await page.getByLabel(label, { exact: true }).press('Enter')
  await page.getByLabel(label, { exact: true }).press('Tab')
}

test('settings: administrator validates and saves the real club schedule', async ({ page, request }) => {
  test.setTimeout(60000)
  const auth = await request.post('http://localhost:3000/api/auth/login', { data: { email: 'admin@test.ru', password: 'admin123' } })
  expect(auth.status()).toBe(200)
  const headers = { Authorization: `Bearer ${(await auth.json()).access_token}` }
  const url = 'http://localhost:3000/api/settings/club-schedule'
  const originalResponse = await request.get(url, { headers })
  expect(originalResponse.status()).toBe(200)
  const original = await originalResponse.json()
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  page.on('console', entry => { if (entry.type() === 'error') errors.push(entry.text()) })
  let patches = 0
  page.on('request', req => { if (req.method() === 'PATCH' && req.url().endsWith('/settings/club-schedule')) patches++ })
  try {
    await login(page, 'admin@test.ru', 'admin123')
    await page.locator('aside a[href="/settings"]').click()
    const monday = page.getByTestId('schedule-day-1')
    await expect(monday.getByRole('switch')).toBeVisible()
    if (!await monday.getByRole('switch').isChecked()) await monday.getByRole('switch').click()
    await setTime(page, 'Понедельник: открытие', '20:00')
    await setTime(page, 'Понедельник: закрытие', '20:00')
    await page.getByRole('button', { name: 'Сохранить', exact: true }).click()
    await expect(page.getByText('Закрытие должно быть позже открытия', { exact: true })).toBeVisible()
    expect(patches).toBe(0)
    await setTime(page, 'Понедельник: открытие', '08:30')
    await setTime(page, 'Понедельник: закрытие', '22:15')
    for (const day of [6, 7]) {
      const control = page.getByTestId(`schedule-day-${day}`).getByRole('switch')
      if (await control.isChecked()) await control.click()
    }
    const saved = page.waitForResponse(response => response.request().method() === 'PATCH' && response.url().endsWith('/settings/club-schedule'))
    await page.getByRole('button', { name: 'Сохранить', exact: true }).click()
    const response = await saved
    expect(response.status()).toBe(200)
    expect(response.request().postDataJSON().weekDays).toHaveLength(7)
    expect(response.request().postDataJSON().weekDays[0]).toEqual({ dayOfWeek: 1, isWorkingDay: true, openTime: '08:30', closeTime: '22:15' })
    await expect(page.getByText('График работы сохранён', { exact: true })).toBeVisible()
    await page.reload()
    await expect(page.getByLabel('Понедельник: открытие', { exact: true })).toHaveValue('08:30')
    await expect(page.getByLabel('Понедельник: закрытие', { exact: true })).toHaveValue('22:15')
    expect((await (await request.get(url, { headers })).json()).daysOfWeekOff).toEqual(expect.arrayContaining([0, 6]))
    expect(errors).toEqual([])
  } finally {
    const restored = await request.patch(url, { headers, data: original.weekDays ? { weekDays: original.weekDays } : { openTime: original.openTime, closeTime: original.closeTime, daysOfWeekOff: original.daysOfWeekOff } })
    expect(restored.status()).toBe(200)
  }
})

test('settings: trainer has no menu item, read-only form and API rejects PATCH', async ({ page, request }) => {
  const email = `qa-settings-${Date.now()}@example.com`
  const password = 'qa-settings-password-123'
  const backend = fileURLToPath(new URL('../../backend/', import.meta.url))
  execFileSync(process.execPath, ['--env-file=.env', '-e',
    "const {PrismaClient}=require('@prisma/client');const bcrypt=require('bcrypt');const p=new PrismaClient();(async()=>{await p.user.create({data:{email:process.argv[1],passwordHash:await bcrypt.hash(process.argv[2],10),role:'TRAINER'}})})().finally(()=>p.$disconnect());", email, password], { cwd: backend })
  try {
    await login(page, email, password)
    await expect(page.locator('aside a[href="/settings"]')).toHaveCount(0)
    await page.goto('/settings')
    await expect(page.getByText('Доступ только для чтения', { exact: true })).toBeVisible()
    await expect(page.getByRole('switch')).toHaveCount(7)
    for (const control of await page.getByRole('switch').all()) await expect(control).toBeDisabled()
    await expect(page.getByRole('button', { name: 'Сохранить', exact: true })).toHaveCount(0)
    const auth = await request.post('http://localhost:3000/api/auth/login', { data: { email, password } })
    const headers = { Authorization: `Bearer ${(await auth.json()).access_token}` }
    const url = 'http://localhost:3000/api/settings/club-schedule'
    const schedule = await request.get(url, { headers })
    expect(schedule.status()).toBe(200)
    const original = await schedule.json()
    expect(original.weekDays).toHaveLength(7)
    expect((await request.patch(url, { headers, data: { openTime: '00:01' } })).status()).toBe(403)
    expect(await (await request.get(url, { headers })).json()).toEqual(original)
  } finally {
    execFileSync(process.execPath, ['--env-file=.env', '-e',
      "const {PrismaClient}=require('@prisma/client');const p=new PrismaClient();p.user.delete({where:{email:process.argv[1]}}).finally(()=>p.$disconnect());", email], { cwd: backend })
  }
})
