import { test, expect } from '@playwright/test'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

test.use({ actionTimeout: 10000 })

const cases = [
  { resource: 'clients', field: 'Имя', property: 'firstName', sort: 'Имя',
    text: { Фамилия: 'Тестовая', Телефон: '+79991234567', Email: 'qa@example.com', 'Заметки и предпочтения': 'Утренние занятия', 'Медицинские заметки': 'Тестовая заметка' },
    checks: ['Плательщик'], expected: { lastName: 'Тестовая', isPayer: true, preferences: 'Утренние занятия', medicalNotes: 'Тестовая заметка' } },
  { resource: 'horses', field: 'Кличка', property: 'name', sort: 'Кличка',
    text: { Порода: 'Орловская', 'Уровень всадника': 'Начинающий' }, checks: ['Недоступна для занятий'],
    expected: { breed: 'Орловская', riderLevel: 'Начинающий', maxDailyMinutes: 240, minRestMinutes: 15, isUnavailable: true } },
  { resource: 'trainers', field: 'ФИО', property: 'name', sort: 'ФИО',
    text: { Квалификация: 'Мастер спорта', 'Базовая ставка, ₽': '1500.50' }, checks: [],
    expected: { qualification: 'Мастер спорта', maxDailyLoad: 480, baseRate: '1500.5' } },
  { resource: 'services', field: 'Название', property: 'title', sort: 'Название',
    text: { 'Цена, ₽': '2500.50', Вместимость: '3', 'Окно бесплатной отмены, ч': '12' }, checks: [],
    expected: { durationMinutes: 60, price: '2500.5', maxCapacity: 3, cancellationWindowHours: 12, allowMembership: true } },
] as const

for (const scenario of cases) {
  test(`${scenario.resource}: real create, search, sort, edit, delete`, async ({ page, request }) => {
    test.setTimeout(60000)
    const name = `QA-${scenario.resource}-${Date.now()}`
    const credentials = { email: 'admin@test.ru', password: 'admin123' }
    const auth = await request.post('http://localhost:3000/api/auth/login', { data: credentials })
    expect(auth.status()).toBe(200)
    const { access_token: token } = await auth.json()
    const headers = { Authorization: `Bearer ${token}` }
    const errors: string[] = []
    page.on('pageerror', error => errors.push(error.message))
    page.on('console', message => { if (message.type() === 'error') errors.push(`${message.text()} ${message.location().url}`) })
    page.on('response', response => { if (response.status() >= 400) errors.push(`HTTP ${response.status()} ${response.url()}`) })
    let recordId: string | undefined
    try {
      await page.goto('/login')
      await page.getByLabel('Email', { exact: true }).fill(credentials.email)
      await page.getByLabel('Пароль', { exact: true }).fill(credentials.password)
      await page.getByRole('button', { name: 'Войти', exact: true }).click()
      await expect(page).toHaveURL(/\/clients(?:\?|$)/)
      await page.goto(`/${scenario.resource}/new`)
      await page.getByRole('button', { name: 'Сохранить', exact: true }).click()
      await expect(page.getByText(`Заполните поле «${scenario.field}»`, { exact: true })).toBeVisible()
      await page.getByLabel(scenario.field, { exact: true }).fill(name)
      for (const [label, value] of Object.entries(scenario.text)) await page.getByLabel(label, { exact: true }).fill(value)
      for (const label of scenario.checks) await page.getByLabel(label, { exact: true }).check()
      const creation = page.waitForResponse(response => response.url().endsWith(`/api/${scenario.resource}`) && response.request().method() === 'POST')
      await page.getByRole('button', { name: 'Сохранить', exact: true }).click()
      const created = await creation
      expect(created.status()).toBe(201)
      const record = await created.json()
      recordId = record.id
      expect(record).toMatchObject(scenario.expected)
      expect(record[scenario.property]).toBe(name)
      await expect(page).toHaveURL(new RegExp(`/${scenario.resource}(\\?|$)`))
      await page.getByRole('searchbox', { name: 'Поиск', exact: true }).fill(name)
      await page.getByRole('button', { name: 'Найти', exact: true }).click()
      const row = page.getByRole('row').filter({ hasText: name })
      await expect(row).toHaveCount(1)
      const sorting = page.waitForResponse(response => response.url().includes(`/api/${scenario.resource}?`) && response.url().includes('_sort='))
      await page.getByRole('columnheader', { name: new RegExp(scenario.sort) }).click()
      expect((await sorting).status()).toBe(200)
      await row.getByRole('button', { name: 'Редактировать', exact: true }).click()
      await expect(page).toHaveURL(url => url.pathname === `/${scenario.resource}/edit/${recordId}`)
      await expect(page.getByRole('textbox', { name: scenario.field, exact: true })).toHaveValue(name)
      await page.getByLabel(scenario.field, { exact: true }).fill(`${name}-edited`)
      const update = page.waitForResponse(response => response.url().endsWith(`/api/${scenario.resource}/${recordId}`) && response.request().method() === 'PATCH')
      await page.getByRole('button', { name: 'Сохранить', exact: true }).click()
      const updated = await update
      expect(updated.status()).toBe(200)
      expect(await updated.json()).toMatchObject({ ...scenario.expected, [scenario.property]: `${name}-edited` })
      await expect(page).toHaveURL(new RegExp(`/${scenario.resource}(\\?|$)`))
      await page.getByRole('searchbox', { name: 'Поиск', exact: true }).fill(name)
      await page.getByRole('button', { name: 'Найти', exact: true }).click()
      await page.getByRole('row').filter({ hasText: `${name}-edited` }).getByRole('button', { name: 'Удалить', exact: true }).click()
      const deletion = page.waitForResponse(response => response.url().endsWith(`/api/${scenario.resource}/${recordId}`) && response.request().method() === 'DELETE')
      await page.locator('.ant-popconfirm').getByRole('button', { name: 'Удалить', exact: true }).click()
      expect((await deletion).status()).toBe(200)
      recordId = undefined
      await expect(page.getByRole('row').filter({ hasText: `${name}-edited` })).toHaveCount(0)
      expect(errors).toEqual([])
    } finally {
      if (recordId) await request.delete(`http://localhost:3000/api/${scenario.resource}/${recordId}`, { headers })
    }
  })
}

test('TRAINER: real API redaction, hidden confidential columns and read-only forms', async ({ page, request }) => {
  test.setTimeout(60000)
  const email = `qa-catalogs-${Date.now()}@example.com`
  const password = 'qa-long-password-123'
  const backend = fileURLToPath(new URL('../../backend/', import.meta.url))
  const script = `const {PrismaClient}=require('@prisma/client'); const bcrypt=require('bcrypt'); const p=new PrismaClient();
    (async()=>{await p.user.create({data:{email:process.argv[1],passwordHash:await bcrypt.hash(process.argv[2],10),role:'TRAINER'}})})().finally(()=>p.$disconnect());`
  execFileSync(process.execPath, ['--env-file=.env', '-e', script, email, password], { cwd: backend })
  const admin = await request.post('http://localhost:3000/api/auth/login', { data: { email: 'admin@test.ru', password: 'admin123' } })
  const headers = { Authorization: `Bearer ${(await admin.json()).access_token}` }
  const records: Array<{ resource: string; id: string }> = []
  try {
    for (const [resource, data] of [
      ['clients', { name: email, firstName: email, phone: '+70000000000', medicalNotes: 'Private' }],
      ['trainers', { name: email, baseRate: 123 }],
      ['services', { name: email, title: email, price: 234, durationMinutes: 60 }],
    ] as const) {
      const response = await request.post(`http://localhost:3000/api/${resource}`, { headers, data })
      expect(response.status()).toBe(201)
      records.push({ resource, id: (await response.json()).id })
    }
    const login = await request.post('http://localhost:3000/api/auth/login', { data: { email, password } })
    const trainerHeaders = { Authorization: `Bearer ${(await login.json()).access_token}` }
    await page.goto('/login')
    await page.getByLabel('Email', { exact: true }).fill(email)
    await page.getByLabel('Пароль', { exact: true }).fill(password)
    await page.getByRole('button', { name: 'Войти', exact: true }).click()
    await expect(page).toHaveURL(/\/clients(?:\?|$)/)
    for (const { resource, id } of records) {
      const response = await request.get(`http://localhost:3000/api/${resource}/${id}`, { headers: trainerHeaders })
      expect(response.status()).toBe(200)
      const body = await response.json()
      for (const field of ['medicalNotes', 'baseRate', 'price']) expect(body).not.toHaveProperty(field)
      await page.goto(`/${resource}`)
      await expect(page.getByRole('table')).toBeVisible()
      await expect(page.getByRole('columnheader', { name: 'Цена', exact: true })).toHaveCount(0)
      await expect(page.getByRole('columnheader', { name: 'Базовая ставка', exact: true })).toHaveCount(0)
      await expect(page.getByRole('button', { name: 'Редактировать', exact: true })).toHaveCount(0)
      await page.goto(`/${resource}/edit/${id}`)
      await expect(page.getByText('Доступ только для чтения', { exact: true })).toBeVisible()
      await expect(page.getByRole('button', { name: 'Сохранить', exact: true })).toHaveCount(0)
    }
  } finally {
    for (const { resource, id } of records) await request.delete(`http://localhost:3000/api/${resource}/${id}`, { headers })
    execFileSync(process.execPath, ['--env-file=.env', '-e',
      "const {PrismaClient}=require('@prisma/client');const p=new PrismaClient();p.user.delete({where:{email:process.argv[1]}}).finally(()=>p.$disconnect());", email], { cwd: backend })
  }
})
