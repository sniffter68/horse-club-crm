import { expect, test } from '@playwright/test'

const uploadedPhoto = '/uploads/65ecf169-6c22-4e89-8baf-ddc3399da7ad.png'
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aWuoAAAAASUVORK5CYII=', 'base64')

for (const resource of ['horses', 'trainers', 'services']) {
  test(`${resource}: upload preview, validation, failure recovery and persistence`, async ({ page }) => {
    await page.setViewportSize({ width: resource === 'horses' ? 390 : 1280, height: 900 })
    await page.addInitScript(() => {
      localStorage.setItem('horsecrm.access_token', 'cookie-session')
      localStorage.setItem('horsecrm.role', 'ADMIN')
      localStorage.setItem('horsecrm.email', 'qa@example.com')
    })
    let saved: Record<string, unknown> = { id: '1', name: 'Фото', title: 'Фото', imageUrl: uploadedPhoto, baseRate: 0,
      price: 100, durationMinutes: 60, maxCapacity: 1, cancellationWindowHours: 24, allowMembership: true,
      maxRiderWeight: 85, maxDailyMinutes: 240, minRestMinutes: 15, maxDailyLoad: 480, isPublic: true, order: 0 }
    let failUpload = true
    let release: (() => void) | undefined
    let uploadStarted = false
    await page.route('**/uploads/*', route => route.fulfill({ contentType: 'image/png', body: png }))
    await page.route(/\/api\//, async route => {
      const req = route.request()
      if (req.url().endsWith('/upload/image')) {
        uploadStarted = true
        expect(req.headers()['content-type']).toContain('multipart/form-data; boundary=')
        if (failUpload) return route.fulfill({ status: 400, json: { message: 'Неверное изображение' } })
        await new Promise<void>(resolve => { release = resolve })
        return route.fulfill({ status: 201, json: { url: uploadedPhoto } })
      }
      if (['POST', 'PATCH'].includes(req.method())) {
        saved = { ...saved, ...req.postDataJSON() }
        return route.fulfill({ json: saved })
      }
      return route.fulfill({ json: req.url().split('?')[0].endsWith(`/${resource}/1`) ? saved : [], headers: { 'x-total-count': '0' } })
    })
    await page.goto(`/${resource}/edit/1`)
    await expect(page.getByAltText('Предпросмотр фото')).toBeVisible()
    const picker = page.getByLabel('Выбрать фото', { exact: true })
    await picker.setInputFiles({ name: 'bad.svg', mimeType: 'image/svg+xml', buffer: Buffer.from('<svg/>') })
    await expect(page.getByRole('alert').filter({ hasText: 'Выберите изображение' })).toBeVisible()
    expect(uploadStarted).toBe(false)
    await picker.setInputFiles({ name: 'large.png', mimeType: 'image/png', buffer: Buffer.alloc(5 * 1024 * 1024 + 1) })
    await expect(page.getByText('Выберите непустой файл размером до 5 МБ')).toBeVisible()
    const file = { name: 'photo.png', mimeType: 'image/png', buffer: png }
    await picker.setInputFiles(file)
    await expect(page.getByText('Неверное изображение', { exact: true })).toBeVisible()
    await expect(page.getByLabel('Ссылка на фото', { exact: true })).toHaveValue(uploadedPhoto)
    failUpload = false
    await picker.setInputFiles(file)
    await expect(page.getByRole('button', { name: 'Сохранить', exact: true })).toBeDisabled()
    await expect.poll(() => !!release).toBe(true)
    release!()
    await expect(page.getByText('Фото «photo.png» загружено. Сохраните карточку.')).toBeVisible()
    await expect(page.getByAltText('Предпросмотр фото')).toHaveAttribute('src', uploadedPhoto)
    await page.getByAltText('Предпросмотр фото').scrollIntoViewIfNeeded()
    await page.screenshot({ path: test.info().outputPath(`${resource}-upload.png`) })
    // The button remains usable with the keyboard; cancelling preserves the photo.
    if (resource === 'horses') {
      const chooseFile = page.waitForEvent('filechooser')
      await page.getByRole('button', { name: 'Загрузить фото', exact: true }).focus()
      await page.keyboard.press('Enter')
      const fileChooser = await chooseFile
      release = undefined
      await fileChooser.setFiles(file)
      await expect.poll(() => !!release).toBe(true)
      await page.getByRole('button', { name: 'Отменить загрузку' }).click()
      release!()
      await expect(page.getByText('Загрузка отменена', { exact: true })).toBeVisible()
      await expect(page.getByLabel('Ссылка на фото', { exact: true })).toHaveValue(uploadedPhoto)
    }
    await page.getByRole('button', { name: 'Сохранить', exact: true }).click()
    await expect(page).toHaveURL(new RegExp(`/${resource}(\\?.*)?$`))
    expect(saved.imageUrl).toBe(uploadedPhoto)
    await page.goto(`/${resource}/edit/1`)
    await expect(page.getByAltText('Предпросмотр фото')).toBeVisible()
    await page.getByLabel('Ссылка на фото', { exact: true }).clear()
    await page.getByRole('button', { name: 'Сохранить', exact: true }).click()
    await expect(page).toHaveURL(new RegExp(`/${resource}(\\?.*)?$`))
    expect(saved.imageUrl).toBeNull()
  })
}

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
