import { expect, test } from '@playwright/test'

// CRM is served on 5173; the public landing has its own Vite server.
test.use({ baseURL: 'http://localhost:5174' })

test.beforeEach(async ({ page }) => {
  await page.route('**/api/public/content', route => route.fulfill({
    json: { horses: [], trainers: [], services: [] },
  }))
  await page.goto('/')
})

test('Загрузка и Hero', async ({ page }) => {
  const hero = page.getByRole('region', { name: 'Ваш первый шаг к лошадям — без страха и суеты' })
  await expect(hero.getByRole('heading', { level: 1 })).toHaveText('Ваш первый шаг к лошадям — без страха и суеты')
  const photo = hero.getByRole('img', { name: 'Улыбающийся ребёнок гладит спокойную лошадь, тренер рядом держит повод' })
  await expect(photo).toBeVisible()
  await expect.poll(() => photo.evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0)).toBe(true)

  const address = hero.getByRole('link', { name: 'Тамбов · ул. Бастионная, 22АС2' })
  await expect(address).toHaveAttribute('href', /^https:\/\/yandex\.ru\/maps\//)
  // Exercise the actual link without depending on the external Maps service.
  await page.context().route('https://yandex.ru/maps/**', route => route.fulfill({ body: 'Maps' }))
  const popupPromise = page.waitForEvent('popup')
  await address.click()
  const popup = await popupPromise
  await expect(popup).toHaveURL(/^https:\/\/yandex\.ru\/maps\//)
  await popup.close()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
})

test('Карусель услуг и модалка записи', async ({ page }) => {
  let submissions = 0
  await page.route('**/api/leads', route => {
    submissions += 1
    return route.fulfill({ status: 201, json: { success: true } })
  })
  const services = page.getByRole('list', { name: 'Услуги клуба' })
  await services.scrollIntoViewIfNeeded()
  await expect(services).toBeVisible()
  const firstCard = services.getByRole('listitem').first()
  const serviceName = await firstCard.getByRole('heading').innerText()
  await expect(firstCard).toBeInViewport()
  await firstCard.getByRole('button', { name: `Записаться: ${serviceName}`, exact: true }).click()

  const dialog = page.getByRole('dialog', { name: 'Быстрая запись', exact: true })
  await expect(dialog).toBeVisible()
  await expect(dialog.getByText(`Выбранная услуга: ${serviceName}`, { exact: true })).toBeVisible()
  const consent = dialog.getByRole('checkbox', { name: /Я согласен на обработку персональных данных/ })
  await expect(consent).not.toBeChecked()
  await expect(dialog.getByLabel('Ваше имя')).toHaveValue('')
  await expect(dialog.getByLabel(/^Телефон/)).toHaveValue('')
  await dialog.getByRole('button', { name: 'Оставить заявку на первое занятие' }).click()
  await expect(dialog.getByRole('alert')).toHaveText('Укажите имя')
  await expect(dialog.getByLabel('Ваше имя')).toBeFocused()

  await dialog.getByLabel('Ваше имя').fill('Анна')
  await dialog.getByRole('button', { name: 'Оставить заявку на первое занятие' }).click()
  await expect(dialog.getByLabel(/^Телефон/)).toBeFocused()
  await expect(dialog.getByRole('alert')).toContainText('телефон')
  await dialog.getByLabel(/^Телефон/).fill('89991234567')
  await dialog.getByRole('button', { name: 'Оставить заявку на первое занятие' }).click()
  await expect(dialog.getByRole('alert')).toHaveText('Подтвердите согласие, чтобы отправить заявку')
  await expect(consent).toBeFocused()
  await expect(consent).not.toBeChecked()
  expect(submissions).toBe(0)
})

test('Кнопка «Наверх»', async ({ page }) => {
  const scrollToTop = page.getByRole('button', { name: 'Вернуться наверх' })
  await expect(scrollToTop).toHaveCount(0)
  await page.evaluate(() => window.scrollTo({ top: 800, behavior: 'instant' }))
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(800)
  await expect(scrollToTop).toBeVisible()
  await scrollToTop.click()
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0)
  await expect(scrollToTop).toHaveCount(0)
})

test('Пятиколоночный футер и социальные ссылки', async ({ page }, testInfo) => {
  const footer = page.getByRole('contentinfo')
  await footer.scrollIntoViewIfNeeded()
  await expect(footer).toBeVisible()
  await expect(footer.getByRole('link', { name: 'СЛКС Тамбов — на главную' })).toBeVisible()
  await expect(footer.getByRole('navigation', { name: 'Навигация:' })).toBeVisible()
  for (const name of ['Контакты:', 'Наш адрес:', 'Для клиентов:']) {
    await expect(footer.getByRole('region', { name, exact: true })).toBeVisible()
  }
  // Verify rendered columns at desktop and their single-column mobile reflow.
  const columns = await footer.evaluate(element => {
    const grid = element.firstElementChild
    return grid ? getComputedStyle(grid).gridTemplateColumns.split(' ').length : 0
  })
  expect(columns).toBe(testInfo.project.use.isMobile ? 1 : 5)
  const max = footer.getByRole('link', { name: 'MAX', exact: true })
  await expect(max).toBeVisible()
  await expect(max).toHaveAttribute('href', /^https:\/\/max\.ru\//)
  await expect(footer.getByRole('link', { name: /Telegram|Телеграм/i })).toHaveCount(0)
  const links = await footer.getByRole('link').evaluateAll(elements => elements.map(element => element.getAttribute('href') || ''))
  expect(links.some(href => /(?:t\.me|telegram\.(?:me|org))/i.test(href))).toBe(false)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
})
