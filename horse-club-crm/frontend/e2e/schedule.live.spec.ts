import { test, expect } from '@playwright/test'
import { DateTime } from 'luxon'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
test.use({ actionTimeout: 10000 })

test('schedule: real booking, workload, filters, attendance and cancellation', async ({ page, request }) => {
  test.setTimeout(90000)
  const auth = await request.post('http://localhost:3000/api/auth/login', { data: { email: 'admin@test.ru', password: 'admin123' } })
  expect(auth.status()).toBe(200)
  const { access_token: token } = await auth.json()
  const headers = { Authorization: `Bearer ${token}` }
  const name = `Schedule-QA-${Date.now()}`
  const ids: Record<string, string> = {}
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()) })
  try {
    for (const [resource, data] of Object.entries({
      clients: { name, firstName: name, phone: '+79990000123' },
      trainers: { name, baseRate: 100, maxDailyLoad: 480 },
      horses: { name, maxDailyMinutes: 240, minRestMinutes: 15 },
      services: { name, title: name, durationMinutes: 60, price: 500 },
    })) {
      const result = await request.post(`http://localhost:3000/api/${resource}`, { headers, data })
      expect(result.status(), await result.text()).toBe(201)
      ids[resource] = (await result.json()).id
    }
    const settings = await (await request.get('http://localhost:3000/api/settings/club-schedule', { headers })).json()
    let start = DateTime.now().setZone('Europe/Moscow').startOf('week').plus({ days: 1 })
    if (start.weekday % 7 === settings.dayOfWeekOff) start = start.plus({ days: 1 })
    const [hour, minute] = settings.openTime.split(':').map(Number)
    start = start.set({ hour, minute })
    await page.goto('/login')
    await page.getByLabel('Email', { exact: true }).fill('admin@test.ru')
    await page.getByLabel('Пароль', { exact: true }).fill('admin123')
    await page.getByRole('button', { name: 'Войти', exact: true }).click()
    await expect(page).toHaveURL(/\/clients/)
    await page.locator('aside a[href="/schedule"]').click()
    await expect(page.getByRole('button', { name: 'Новое занятие', exact: true })).toBeEnabled()
    await page.getByRole('button', { name: 'Новое занятие', exact: true }).click()
    const modal = page.getByRole('dialog', { name: 'Быстрое бронирование' })
    for (const label of ['Клиент', 'Услуга', 'Тренер', 'Лошадь']) {
      await modal.getByLabel(label, { exact: true }).fill(name)
      await page.getByTitle(name, { exact: true }).last().click()
    }
    await modal.getByLabel('Время начала', { exact: true }).fill(start.toFormat("yyyy-MM-dd'T'HH:mm"))
    await expect(modal.getByText('Доступно: 240 из 240 мин', { exact: true })).toBeVisible()
    const creation = page.waitForResponse(response => response.url().endsWith('/api/lessons') && response.request().method() === 'POST')
    await modal.getByRole('button', { name: 'Создать занятие', exact: true }).click()
    const created = await creation
    expect(created.status(), await created.text()).toBe(201)
    const lesson = await created.json()
    expect(lesson.startTime).toBe(start.toUTC().toISO())
    expect(lesson.bookings[0].client.id).toBe(ids.clients)
    await expect(modal).not.toBeVisible()
    const event = page.locator('.fc-event').filter({ hasText: name })
    await expect(event).toHaveCount(1)
    await event.click()
    const detail = page.getByRole('dialog', { name: 'Карточка занятия' })
    await expect(detail.getByText(name, { exact: true })).toHaveCount(4)
    for (const [button, status, label] of [['Отметить присутствие', 'COMPLETED', 'Проведено'], ['Неявка', 'NO_SHOW', 'Неявка']]) {
      const update = page.waitForResponse(response => response.url().endsWith(`/lessons/${lesson.id}/status`) && response.request().method() === 'PATCH')
      await detail.getByRole('button', { name: button, exact: true }).click()
      expect((await (await update).json()).status).toBe(status)
      await expect(detail.locator('.ant-tag')).toHaveText(label)
    }
    await detail.getByRole('button', { name: 'Отменить занятие', exact: true }).click()
    await page.getByRole('button', { name: 'Да', exact: true }).click()
    await expect(detail.locator('.ant-tag')).toHaveText('Отменено')
    await detail.getByRole('button', { name: 'Close', exact: true }).click()
    const filtered = page.waitForResponse(response => response.url().includes('/api/lessons?') && new URL(response.url()).searchParams.get('horseId') === ids.horses)
    await page.getByRole('combobox', { name: 'Фильтр по лошади' }).fill(name)
    await page.getByTitle(name, { exact: true }).last().click()
    expect((await filtered).status()).toBe(200)
    await expect(event).toHaveCount(1)
    await page.getByRole('button', { name: 'День', exact: true }).click()
    await expect(page.locator('.fc-timeGridDay-view')).toBeVisible()
    await expect(page.locator('.ant-spin-spinning')).toHaveCount(0)
    await page.screenshot({ path: 'e2e-schedule.png', fullPage: true })
    expect(errors).toEqual([])
  } finally {
    // No lesson DELETE endpoint: remove only this test's records, in FK order.
    if (ids.horses) execFileSync(process.execPath, ['--env-file=.env', '-e', `
      const { PrismaClient } = require('@prisma/client'); const p = new PrismaClient();
      const ids = JSON.parse(process.argv[1]);
      (async () => { await p.$transaction(async tx => {
        await tx.booking.deleteMany({ where: { lesson: { horseId: ids.horses } } });
        await tx.lesson.deleteMany({ where: { horseId: ids.horses } });
        if (ids.clients) await tx.client.deleteMany({ where: { id: ids.clients } });
        if (ids.trainers) await tx.trainer.deleteMany({ where: { id: ids.trainers } });
        if (ids.services) await tx.service.deleteMany({ where: { id: ids.services } });
        await tx.horse.deleteMany({ where: { id: ids.horses } });
      }); })().finally(() => p.$disconnect());
    `, JSON.stringify(ids)], { cwd: fileURLToPath(new URL('../../backend', import.meta.url)), stdio: 'pipe' })
    if (!ids.horses) for (const [resource, id] of Object.entries(ids)) await request.delete(`http://localhost:3000/api/${resource}/${id}`, { headers })
  }
})
