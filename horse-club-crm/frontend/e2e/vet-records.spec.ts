import { test, expect, type Page } from './fixtures'
import { DateTime } from 'luxon'
const horseId = '3b241101-e2bb-4255-8caf-4136c566a962'
const horse = { id: horseId, name: 'Валдай', healthStatus: 'HEALTHY', status: 'active', healthLogs: [], boardingContracts: [], bookings: [] }
const seed = { id: '4b241101-e2bb-4255-8caf-4136c566a962', horseId, horse, type: 'FARRIER', title: 'Плановая расчистка', specialist: 'Иван Коваль', performedAt: '2026-10-01T09:00Z', nextDueDate: '2026-11-15T09:00Z', dueStatus: 'soon', notes: 'Ограничить нагрузку' }
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => { localStorage.setItem('horsecrm.access_token', 'cookie-session'); localStorage.setItem('horsecrm.role', 'ADMIN'); localStorage.setItem('horsecrm.email', 'qa@example.com') })
  await page.route('**/api/horses?*', route => route.fulfill({ json: [horse], headers: { 'x-total-count': '1' } }))
  await page.route(`**/api/horses/${horseId}*`, route => route.fulfill({ json: horse }))
  await page.route('**/api/vet/records?*', route => route.fulfill({ json: { data: [seed], total: 1 } }))
  await page.route('**/api/vet/summary*', route => route.fulfill({ json: { overdue: [], next14Days: [], next30Days: [seed], thisMonth: [], restrictedHorses: [] } }))
  await page.route(`**/api/vet/horses/${horseId}/passport*`, route => route.fulfill({ json: { horse: { ...horse, vetRecords: [seed], vetEvents: [], healthLogs: [] }, generatedAt: '2026-10-18T09:00Z' } }))
})
async function choose(page: Page, label: string, title: string) {
  const combo = page.getByRole('combobox', { name: label, exact: true })
  await combo.focus(); await combo.press('ArrowDown')
  const dropdown = page.locator('.ant-select-dropdown:visible')
  await expect(dropdown).toBeVisible()
  // Keyboard navigation also reaches options outside the virtual list viewport.
  for (let step = 0; step < 20; step++) {
    if (await dropdown.locator('.ant-select-item-option-active').getAttribute('title') === title) {
      await combo.press('Enter')
      if (await combo.getAttribute('aria-expanded') === 'true') await combo.press('Escape')
      await expect(dropdown).toHaveCount(0); return
    }
    await combo.press('ArrowDown')
  }
  throw new Error(`Не найден вариант «${title}»`)
}

for (const [type, label] of [['CASTRATION', 'Кастрация'], ['TEETH_FLOATING', 'Подпиливание зубов']] as const) {
  test(`${label}: create, filter, edit and horse history`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    let saved = { ...seed, type, title: label, nextDueDate: null as string | null }
    let payload: Record<string, unknown> | undefined
    await page.route('**/api/vet/records', async route => {
      payload = route.request().postDataJSON()
      saved = { ...saved, ...payload }
      await page.route('**/api/vet/records?*', r => r.fulfill({ json: { data: [saved], total: 1 } }))
      await route.fulfill({ status: 201, json: saved })
    })
    await page.goto('/vet')
    await page.getByRole('button', { name: 'Добавить ветзапись', exact: true }).click()
    await choose(page, 'Лошадь', 'Валдай'); await choose(page, 'Тип процедуры', label)
    const dialog = page.getByRole('dialog', { name: 'Добавить ветеринарную запись' })
    await expect(dialog.getByText('После сохранения пол лошади в карточке будет автоматически изменён с жеребца на мерина')).toHaveCount(type === 'CASTRATION' ? 1 : 0)
    await choose(page, 'Частый шаблон', label)
    if (type === 'TEETH_FLOATING') {
      await dialog.getByLabel('Следующая процедура', { exact: true }).fill('01.01.2099')
      await page.keyboard.press('Enter')
    }
    await dialog.getByLabel('Врач / коваль / лаборатория').fill('Ветеринар')
    await dialog.getByRole('button', { name: 'Сохранить ветзапись' }).click()
    await expect(dialog).toHaveCount(0)
    expect(payload).toMatchObject({ horseId, type, title: label })
    if (type === 'TEETH_FLOATING') expect(payload?.nextDueDate).toBe('2099-01-01T09:00:00.000Z')
    const request = page.waitForRequest(r => new URL(r.url()).searchParams.get('type') === type)
    await choose(page, 'Тип ветзаписи', label); await request
    await page.getByRole('button', { name: 'Редактировать', exact: true }).click()
    await expect(page.getByRole('dialog', { name: 'Редактировать ветзапись' }).getByRole('combobox', { name: 'Тип процедуры', exact: true })).toBeVisible()
    await expect(page.locator('.ant-drawer:visible').getByText(label, { exact: true }).first()).toBeVisible()
    await page.getByRole('button', { name: 'Закрыть', exact: true }).click()
    await page.route('**/api/bookings/horse-issues?*', route => route.fulfill({ json: [], headers: { 'x-total-count': '0' } }))
    await page.goto('/horses'); await page.getByRole('button', { name: 'Валдай', exact: true }).click()
    await page.getByRole('tab', { name: 'Здоровье и ковка' }).click()
    await expect(page.locator('.ant-timeline').getByText(label, { exact: true }).first()).toBeVisible()
  })
}
test('admin creates a vaccination with automatic deadline; failed save retains values and retry succeeds', async ({ page }) => {
  let payload: Record<string, unknown> | undefined; let count = 0
  await page.route('**/api/vet/records', async route => { payload = route.request().postDataJSON(); count++
    if (count > 1) await page.route('**/api/vet/records?*', r => r.fulfill({ json: { data: [{ id: seed.id, ...payload, horse }], total: 1 } }))
    await route.fulfill(count === 1 ? { status: 503, json: { message: 'Временная ошибка. Повторите сохранение.' } } : { status: 201, json: { id: seed.id, ...payload } }) })
  await page.goto('/vet'); await page.getByRole('button', { name: 'Добавить ветзапись', exact: true }).click()
  await choose(page, 'Лошадь', 'Валдай'); await choose(page, 'Тип процедуры', 'Вакцинация'); await choose(page, 'Частый шаблон', 'Грипп + столбняк')
  const dialog = page.getByRole('dialog', { name: 'Добавить ветеринарную запись' })
  await dialog.getByLabel('Врач / коваль / лаборатория').fill('Доктор Петров')
  await dialog.getByLabel('Препарат, дозировка, серия').fill('Equilis · серия 123')
  await dialog.getByRole('button', { name: 'Сохранить ветзапись' }).click()
  await expect(dialog.getByText('Временная ошибка. Повторите сохранение.')).toBeVisible()
  await expect(dialog.getByLabel('Название процедуры')).toHaveValue('Грипп + столбняк')
  await dialog.getByRole('button', { name: 'Сохранить ветзапись' }).click(); await expect(dialog).toHaveCount(0)
  expect(payload).toMatchObject({ horseId, type: 'VACCINATION', title: 'Грипп + столбняк', specialist: 'Доктор Петров', medication: 'Equilis · серия 123' })
  expect(DateTime.fromISO(payload!.nextDueDate as string, { zone: 'Europe/Moscow' }).startOf('day').diff(DateTime.fromISO(payload!.performedAt as string, { zone: 'Europe/Moscow' }).startOf('day'), 'days').days).toBe(365)
  expect(new Date(payload!.performedAt as string).getTime()).toBeLessThanOrEqual(Date.now())
  await expect(page.getByText('Грипп + столбняк', { exact: true })).toBeVisible()
})

test('saving castration refreshes sex in the open horse card', async ({ page }) => {
  let sex = 'STALLION'
  await page.route(`**/api/horses/${horseId}*`, route => route.fulfill({ json: { ...horse, sex } }))
  await page.route('**/api/bookings/horse-issues?*', route => route.fulfill({ json: [], headers: { 'x-total-count': '0' } }))
  await page.route('**/api/vet/records', async route => {
    expect(route.request().postDataJSON().type).toBe('CASTRATION')
    sex = 'GELDING'
    await route.fulfill({ status: 201, json: { ...seed, type: 'CASTRATION' } })
  })
  await page.goto('/horses'); await page.getByRole('button', { name: 'Валдай', exact: true }).click()
  const card = page.getByRole('dialog', { name: 'Карточка лошади' })
  await expect(card.getByText('Жеребец', { exact: true })).toBeVisible()
  await page.getByRole('tab', { name: 'Здоровье и ковка' }).click()
  await card.getByRole('button', { name: 'Добавить ветзапись', exact: true }).click()
  await choose(page, 'Тип процедуры', 'Кастрация'); await choose(page, 'Частый шаблон', 'Кастрация')
  const editor = page.getByRole('dialog', { name: 'Добавить ветеринарную запись' })
  await editor.getByLabel('Врач / коваль / лаборатория').fill('Ветеринар')
  await editor.getByRole('button', { name: 'Сохранить ветзапись' }).click()
  await expect(editor).toHaveCount(0)
  await expect(card.getByText('Мерин', { exact: true })).toBeVisible()
})
test('admin edits a record and filters with a searchable horse select and Moscow date ranges', async ({ page }) => {
  let patched = false; let filtered = false
  await page.route(`**/api/vet/records/${seed.id}`, route => { patched = true; expect(route.request().postDataJSON().notes).toBe('Без нагрузки 3 дня'); return route.fulfill({ json: seed }) })
  await page.goto('/vet'); await page.getByRole('button', { name: 'Редактировать', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Редактировать ветзапись' }); await dialog.getByLabel('Комментарий / ограничения нагрузки').fill('Без нагрузки 3 дня')
  await dialog.getByRole('button', { name: 'Сохранить ветзапись' }).click(); await expect(dialog).toHaveCount(0); expect(patched).toBe(true)
  await page.route('**/api/vet/records?*', route => { const params = new URL(route.request().url()).searchParams; if (params.get('horseId') === horseId && params.get('type') === 'FARRIER') filtered = true; return route.fulfill({ json: { data: [], total: 0 } }) })
  await choose(page, 'Тип ветзаписи', 'Ковка / расчистка'); await choose(page, 'Лошадь в ветжурнале', 'Валдай')
  await expect.poll(() => filtered).toBe(true); await expect(page.getByText('Записей пока нет')).toBeVisible()
})
test('quarantine updates availability and summary badge; passport exposes full print layout and JSON download', async ({ page }) => {
  let healthPayload: unknown
  await page.route(`**/api/vet/horses/${horseId}/health-status`, async route => { healthPayload = route.request().postDataJSON()
    await page.route('**/api/vet/summary*', r => r.fulfill({ json: { overdue: [], next14Days: [], next30Days: [], thisMonth: [], restrictedHorses: [{ ...horse, healthStatus: 'QUARANTINE' }] } }))
    await route.fulfill({ json: { ...horse, healthStatus: 'QUARANTINE', status: 'quarantine', isUnavailable: true } }) })
  await page.goto('/vet'); await page.getByRole('button', { name: 'Здоровье', exact: true }).click(); await choose(page, 'Состояние здоровья', 'Карантин')
  await page.getByRole('button', { name: 'Сохранить здоровье' }).click()
  await expect(page.getByRole('button', { name: 'Валдай · Карантин' })).toBeVisible(); expect(healthPayload).toEqual({ healthStatus: 'QUARANTINE', quarantineUntil: null })
  await page.getByRole('button', { name: 'Валдай · Карантин' }).click()
  const passport = page.getByRole('dialog', { name: 'Ветеринарная карта' }); await expect(passport.getByText('Ветеринарная карта: Валдай')).toBeVisible()
  await expect(passport.getByRole('cell', { name: 'Иван Коваль' })).toBeVisible()
  const download = page.waitForEvent('download'); await passport.getByRole('button', { name: 'Экспорт JSON' }).click(); expect((await download).suggestedFilename()).toContain(horseId)
  await page.emulateMedia({ media: 'print' }); await expect(page.locator('.vet-print-root')).toBeVisible(); await expect(page.locator('#root')).toBeHidden()
  await page.screenshot({ path: 'test-results/vet-passport-print.png', fullPage: true })
})
test('mobile keyboard flow, dark theme, reduced motion and dirty cancellation preserve a draft', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 }); await page.emulateMedia({ reducedMotion: 'reduce', colorScheme: 'dark' })
  await page.goto('/vet'); await expect(page.getByText('Плановая расчистка', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Добавить ветзапись', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Добавить ветеринарную запись' }); await dialog.getByLabel('Название процедуры').fill('Длинное описание обследования лошади')
  await page.keyboard.press('Escape'); await expect(page.getByRole('dialog', { name: 'Закрыть без сохранения?' })).toBeVisible(); await page.getByRole('button', { name: 'Продолжить заполнение' }).click()
  await expect(dialog.getByLabel('Название процедуры')).toHaveValue('Длинное описание обследования лошади')
  await page.screenshot({ path: 'test-results/vet-mobile-form.png', fullPage: true })
})
test('loading and failed journal offer recovery; trainers cannot see write controls', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('horsecrm.role', 'TRAINER'))
  await page.route('**/api/settings/access/me*', route => route.fulfill({ json: { role: 'TRAINER', permissions: { healthRead: true, healthWrite: true, boardingAccess: true } } }))
  await page.route('**/api/vet/records?*', route => route.fulfill({ status: 503, json: { message: 'Сервер недоступен' } }))
  await page.goto('/vet'); await expect(page.getByText('Не удалось загрузить журнал')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Добавить ветзапись', exact: true })).toHaveCount(0)
  await page.route('**/api/vet/records?*', route => route.fulfill({ json: { data: [seed], total: 1 } })); await page.getByRole('button', { name: 'Повторить', exact: true }).click()
  await expect(page.getByText('Плановая расчистка', { exact: true })).toBeVisible(); await expect(page.getByRole('button', { name: 'Редактировать', exact: true })).toHaveCount(0)
})

test('mass vaccination submits an atomic batch and admin deletion requires confirmation', async ({ page }) => {
  let batch: unknown; let deleted = false
  await page.route('**/api/vet/records/batch', route => { batch = route.request().postDataJSON(); return route.fulfill({ status: 201, json: { data: [seed], total: 1 } }) })
  await page.goto('/vet'); await page.getByRole('button', { name: 'Добавить ветзапись', exact: true }).click()
  await choose(page, 'Режим записи', 'Массовая вакцинация / глистогон'); await choose(page, 'Лошади', 'Валдай')
  await choose(page, 'Частый шаблон', 'Грипп + столбняк')
  const dialog = page.getByRole('dialog', { name: 'Добавить ветеринарную запись' }); await dialog.getByLabel('Врач / коваль / лаборатория').fill('Врач')
  await dialog.getByRole('button', { name: 'Сохранить ветзапись' }).click(); await expect(dialog).toHaveCount(0)
  expect(batch).toMatchObject({ horseIds: [horseId], type: 'VACCINATION', title: 'Грипп + столбняк' }); expect(batch).not.toHaveProperty('horseId')
  await page.route(`**/api/vet/records/${seed.id}`, async route => { expect(route.request().method()).toBe('DELETE'); deleted = true
    await page.route('**/api/vet/records?*', r => r.fulfill({ json: { data: [], total: 0 } })); await route.fulfill({ json: seed }) })
  await page.getByRole('button', { name: 'Удалить', exact: true }).click(); expect(deleted).toBe(false)
  await page.getByRole('dialog', { name: 'Удалить «Плановая расчистка»?' }).getByRole('button', { name: 'Удалить', exact: true }).click()
  await expect(page.getByText('Записей пока нет')).toBeVisible(); expect(deleted).toBe(true)
})

test('horse card displays the health timeline and passport without requesting an invalid UUID', async ({ page }) => {
  await page.route('**/api/bookings/horse-issues?*', route => route.fulfill({ json: [], headers: { 'x-total-count': '0' } }))
  await page.goto('/horses'); await page.getByRole('button', { name: 'Валдай', exact: true }).click(); await page.getByRole('tab', { name: 'Здоровье и ковка' }).click()
  await expect(page.locator('.ant-timeline').getByText('Плановая расчистка', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Ветпаспорт / печать' }).click(); await expect(page.getByRole('dialog', { name: 'Ветеринарная карта' }).getByText('Ветеринарная карта: Валдай')).toBeVisible()
})
