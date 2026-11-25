import { test, expect } from './fixtures'
import type { Service } from '../src/pages/catalogs/types'

const id = '00000000-0000-4000-8000-000000000092'
for (const width of [390, 1440]) test(`service direction and group form: ${width}`, async ({ page }, testInfo) => {
  await page.setViewportSize({ width, height: 900 })
  await page.addInitScript(mode => {
    localStorage.setItem('horsecrm.access_token', 'cookie-session')
    localStorage.setItem('horsecrm.role', 'ADMIN')
    localStorage.setItem('horsecrm.email', 'qa@example.com')
    localStorage.setItem('horsecrm.color_mode', mode)
  }, width === 390 ? 'dark' : 'light')
  let row: Service = { id, title: 'Фотосессия', name: 'Фотосессия', maxCapacity: 1, serviceDirection: null,
    durationMinutes: 60, price: 2000, cancellationWindowHours: 24, allowMembership: true, isPublic: true, order: 0 }
  let fail = true
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.route('**/api/services?*', route => route.fulfill({ json: [row], headers: { 'x-total-count': '1' } }))
  await page.route('**/api/services', async route => {
    if (route.request().method() === 'POST') {
      row = { ...row, ...route.request().postDataJSON() as Partial<Service> }
      return route.fulfill({ status: 201, json: row })
    }
    return route.fulfill({ json: [row], headers: { 'x-total-count': '1' } })
  })
  await page.route(`**/api/services/${id}`, async route => {
    if (route.request().method() === 'PATCH') {
      if (fail) { fail = false; return route.fulfill({ status: 500, json: { message: 'Повторите сохранение' } }) }
      row = { ...row, ...route.request().postDataJSON() as Partial<Service> }
    }
    return route.fulfill({ json: row })
  })
  await page.goto('/services/new')
  const create = page.getByRole('dialog', { name: 'Новая услуга', exact: true })
  const toggle = create.getByRole('switch', { name: 'Групповая услуга', exact: true })
  await expect(toggle).not.toBeChecked()
  await expect(create.getByRole('spinbutton', { name: 'Максимум участников', exact: true })).toHaveCount(0)
  await create.getByRole('textbox', { name: 'Название', exact: true }).fill('Фотосессия')
  const direction = create.getByRole('combobox', { name: 'Направление занятия', exact: true })
  await direction.focus()
  await direction.press('ArrowDown')
  await page.getByTitle('Прогулка / выезд', { exact: true }).click()
  await toggle.focus()
  await toggle.press('Space')
  const capacity = create.getByRole('spinbutton', { name: 'Максимум участников', exact: true })
  await expect(capacity).toHaveValue('4')
  await capacity.fill('')
  await create.getByRole('button', { name: 'Сохранить', exact: true }).click()
  await expect(create.getByText('Укажите целое число участников от 2 до 1000 для группы', { exact: true })).toBeVisible()
  await expect(capacity).toHaveAttribute('aria-invalid', 'true')
  await capacity.fill('6')
  await create.getByRole('checkbox', { name: 'Цена за одного участника', exact: true }).check()
  await expect(create.getByText('Цена указана за одного участника.', { exact: false })).toBeVisible()
  expect(await create.evaluate(el => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(1)
  await toggle.scrollIntoViewIfNeeded()
  await page.screenshot({ path: testInfo.outputPath('service-group.png'), animations: 'disabled' })
  await create.getByRole('button', { name: 'Сохранить', exact: true }).click()
  await expect(page).toHaveURL(/\/services$/)
  expect(row).toMatchObject({ serviceDirection: 'allowWalk', maxCapacity: 6, isPerPerson: true })
  await page.goto(`/services/edit/${id}`)
  const edit = page.getByRole('dialog', { name: 'Редактирование услуги', exact: true })
  const editToggle = edit.getByRole('switch', { name: 'Групповая услуга', exact: true })
  await expect(editToggle).toBeChecked()
  await expect(edit.getByRole('spinbutton', { name: 'Максимум участников', exact: true })).toHaveValue('6')
  await editToggle.click()
  await edit.getByRole('button', { name: 'Сохранить', exact: true }).click()
  await expect(edit).toBeVisible()
  await expect(editToggle).not.toBeChecked()
  await edit.getByRole('button', { name: 'Сохранить', exact: true }).click()
  await expect(page).toHaveURL(/\/services$/)
  expect(row).toMatchObject({ serviceDirection: 'allowWalk', maxCapacity: 1 })
  expect(errors).toEqual([])
})
