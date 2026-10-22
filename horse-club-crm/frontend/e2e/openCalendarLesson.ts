import { expect, type Page } from '@playwright/test'

export async function openCalendarLesson(page: Page) {
  await expect(page.getByRole('button', { name: 'Записать на тренировку', exact: true })).toBeEnabled()
  const date = await page.getByRole('textbox', { name: 'Дата нагрузки', exact: true }).inputValue()
  const column = page.locator(`.fc-timegrid-col[data-date="${date}"]`)
  const slot = page.locator('.fc-timegrid-slot-lane[data-time]').first()
  await slot.scrollIntoViewIfNeeded()
  const bounds = await column.boundingBox()
  const slotBounds = await slot.boundingBox()
  if (!bounds || !slotBounds) throw new Error('Calendar day is not visible')
  await page.mouse.click(bounds.x + bounds.width / 2, slotBounds.y + 1)
  await expect(page.getByRole('dialog', { name: 'Быстрое бронирование' })).toBeVisible()
  await page.getByRole('dialog', { name: 'Быстрое бронирование' }).getByLabel('Длительность, мин', { exact: true }).fill('60')
}
