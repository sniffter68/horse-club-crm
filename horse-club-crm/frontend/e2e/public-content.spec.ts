import { expect, test } from '@playwright/test'

for (const resource of ['horses', 'trainers', 'services']) {
  test(`${resource}: create/edit publication fields preserve values and support clearing`, async ({ page }) => {
    await page.setViewportSize({ width: resource === 'horses' ? 390 : 1280, height: 900 })
    await page.addInitScript(() => {
      localStorage.setItem('horsecrm.access_token', 'cookie-session')
      localStorage.setItem('horsecrm.role', 'ADMIN')
      localStorage.setItem('horsecrm.email', 'qa@example.com')
    })
    let saved: Record<string, unknown> = {}
    await page.route(/\/api\//, async route => {
      const req = route.request()
      if (['POST', 'PATCH'].includes(req.method())) {
        saved = { ...saved, ...req.postDataJSON(), id: '1' }
        return route.fulfill({ json: saved })
      }
      return route.fulfill({ json: req.url().split('?')[0].endsWith(`/${resource}/1`) ? saved : [], headers: { 'x-total-count': '0' } })
    })
    await page.goto(`/${resource}/new`)
    await expect(page.getByLabel('Отображать на сайте')).toBeChecked()
    await page.getByLabel(resource === 'horses' ? 'Кличка' : resource === 'trainers' ? 'ФИО' : 'Название', { exact: true }).fill('Публичная карточка')
    await page.getByLabel('Отображать на сайте').uncheck()
    await page.getByLabel('Ссылка на фото', { exact: true }).fill('javascript:bad')
    await page.getByRole('button', { name: 'Сохранить', exact: true }).click()
    await expect(page).toHaveURL(new RegExp(`/${resource}/new`))
    await page.getByLabel('Ссылка на фото', { exact: true }).fill('https://example.com/photo.jpg')
    await page.getByLabel('Описание для сайта', { exact: true }).fill('Описание из CRM')
    await page.getByLabel('Направление / роль на сайте', { exact: true }).fill('Обучение')
    await page.getByLabel('Порядок на сайте', { exact: true }).fill('3')
    await page.getByRole('button', { name: 'Сохранить', exact: true }).click()
    await expect(page).toHaveURL(new RegExp(`/${resource}(\\?.*)?$`))
    expect(saved).toMatchObject({ isPublic: false, imageUrl: 'https://example.com/photo.jpg', description: 'Описание из CRM', role: 'Обучение', order: 3 })
    await page.goto(`/${resource}/edit/1`)
    await expect(page.getByLabel('Отображать на сайте')).not.toBeChecked()
    await expect(page.getByLabel('Ссылка на фото', { exact: true })).toHaveValue('https://example.com/photo.jpg')
    await page.getByLabel('Ссылка на фото', { exact: true }).scrollIntoViewIfNeeded()
    await page.screenshot({ path: test.info().outputPath(`${resource}-publication.png`) })
    await page.getByLabel('Ссылка на фото', { exact: true }).clear()
    await page.getByLabel('Отображать на сайте').check()
    await page.getByRole('button', { name: 'Сохранить', exact: true }).click()
    await expect(page).toHaveURL(new RegExp(`/${resource}(\\?.*)?$`))
    expect(saved).toMatchObject({ isPublic: true, imageUrl: null })
  })
}
