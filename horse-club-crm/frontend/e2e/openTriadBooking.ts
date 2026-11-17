import { expect, type Page } from './fixtures'

// Advanced booking remains available from a resource slot; the main toolbar
// now opens the shared lesson drawer.
export async function openTriadBooking(page: Page) {
  const grouping = page.getByRole('combobox', { name: 'Группировка расписания' })
  await grouping.focus()
  await grouping.press('ArrowDown')
  await page.getByTitle('По тренерам', { exact: true }).click()
  await page.getByRole('button', { name: /^Забронировать:/ }).first().click()
  await page.getByRole('button', { name: 'Расширенные параметры', exact: true }).click()
  await expect(page.getByRole('dialog', { name: 'Бронирование тройного ресурса', exact: true })).toBeVisible()
}
