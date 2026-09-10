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
    await expect(page.getByLabel('Время открытия', { exact: true })).toHaveValue(original.openTime)
    await setTime(page, 'Время открытия', '20:00')
    await setTime(page, 'Время закрытия', '20:00')
    await page.getByRole('button', { name: 'Сохранить', exact: true }).click()
    await expect(page.getByText('Время закрытия должно быть позже времени открытия', { exact: true })).toBeVisible()
    expect(patches).toBe(0)
    await setTime(page, 'Время открытия', '08:30')
    await setTime(page, 'Время закрытия', '22:15')
    await page.getByLabel('Выходной день', { exact: true }).press('ArrowDown')
    await page.getByTitle('Воскресенье', { exact: true }).click()
    const saved = page.waitForResponse(response => response.request().method() === 'PATCH' && response.url().endsWith('/settings/club-schedule'))
    await page.getByRole('button', { name: 'Сохранить', exact: true }).click()
    const response = await saved
    expect(response.status()).toBe(200)
    expect(response.request().postDataJSON()).toEqual({ openTime: '08:30', closeTime: '22:15', dayOfWeekOff: 0 })
    await expect(page.getByText('График работы сохранён', { exact: true })).toBeVisible()
    await page.reload()
    await expect(page.getByLabel('Время открытия', { exact: true })).toHaveValue('08:30')
    await expect(page.getByLabel('Время закрытия', { exact: true })).toHaveValue('22:15')
    expect((await (await request.get(url, { headers })).json()).dayOfWeekOff).toBe(0)
    expect(errors).toEqual([])
  } finally {
    const restored = await request.patch(url, { headers, data: { openTime: original.openTime, closeTime: original.closeTime, dayOfWeekOff: original.dayOfWeekOff } })
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
    await expect(page.getByLabel('Время открытия', { exact: true })).toBeDisabled()
    await expect(page.getByLabel('Время закрытия', { exact: true })).toBeDisabled()
    await expect(page.getByLabel('Выходной день', { exact: true })).toBeDisabled()
    await expect(page.getByRole('button', { name: 'Сохранить', exact: true })).toHaveCount(0)
    const auth = await request.post('http://localhost:3000/api/auth/login', { data: { email, password } })
    const headers = { Authorization: `Bearer ${(await auth.json()).access_token}` }
    const url = 'http://localhost:3000/api/settings/club-schedule'
    const schedule = await request.get(url, { headers })
    expect(schedule.status()).toBe(200)
    const original = await schedule.json()
    await expect(page.getByLabel('Время открытия', { exact: true })).toHaveValue(original.openTime)
    expect((await request.patch(url, { headers, data: { openTime: '00:01' } })).status()).toBe(403)
    expect(await (await request.get(url, { headers })).json()).toEqual(original)
  } finally {
    execFileSync(process.execPath, ['--env-file=.env', '-e',
      "const {PrismaClient}=require('@prisma/client');const p=new PrismaClient();p.user.delete({where:{email:process.argv[1]}}).finally(()=>p.$disconnect());", email], { cwd: backend })
  }
})
