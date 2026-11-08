import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.route('**/api/public/content', route => route.fulfill({ json: { horses: [], trainers: [], services: [] } }));
});

test('local assets load and broken catalog, logo and hero images recover once', async ({ page }) => {
  await page.goto('/');
  const hero = page.locator('#hero img');
  const logo = page.locator('header img').first();
  for (const img of [hero, logo]) {
    await expect.poll(() => img.evaluate((element: HTMLImageElement) => element.complete && element.naturalWidth > 0)).toBe(true);
    const url = await img.getAttribute('src');
    expect((await page.request.get(url!)).status()).toBe(200);
    await img.evaluate((element: HTMLImageElement) => { element.src = '/missing-image.png'; });
    await expect(img).toHaveAttribute('src', '/images/horse.jpg');
  }
  await page.locator('#horses-trainers').scrollIntoViewIfNeeded();
  const horse = page.getByRole('region', { name: 'Лошади клуба', exact: true }).locator('img').first();
  await expect(horse).toHaveAttribute('src', '/images/horse.jpg');
  await horse.evaluate((element: HTMLImageElement) => { element.src = '/missing-horse.png'; });
  await expect(horse).toHaveAttribute('src', '/images/horse.jpg');
});

test('policy links are independent of consent; preparation and FAQ have one source', async ({ page }) => {
  await page.goto('/');
  const consent = page.locator('#personal-data-consent');
  await expect(consent).not.toBeChecked();
  const policy = page.getByRole('link', { name: 'Политикой конфиденциальности', exact: true });
  await policy.click();
  await expect(page.getByRole('dialog')).toContainText('Тестовый оператор');
  await page.keyboard.press('Escape');
  await expect(policy).toBeFocused();
  await expect(consent).not.toBeChecked();
  await expect(page.getByText('Нажимая кнопку', { exact: false })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Что надеть и как подготовиться', exact: true })).toHaveCount(1);
  await expect(page.getByText('Обувь на гладкой подошве', { exact: false })).toHaveCount(1);
  const questions = page.locator('#faq details');
  await expect(questions).toHaveCount(5);
  for (const question of await questions.all()) {
    await question.locator('summary').click();
    await expect(question).toHaveAttribute('open', '');
  }
  await page.locator('footer').getByRole('link', { name: 'Политика конфиденциальности' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
});

test('mobile actions meet 44px targets and certificate plus age reach the API', async ({ page }) => {
  let payload: Record<string, unknown> = {};
  await page.route('**/api/leads', route => {
    payload = route.request().postDataJSON();
    return route.fulfill({ status: 201, json: { success: true } });
  });
  await page.goto('/');
  const bar = page.getByRole('navigation', { name: 'Быстрая запись' });
  for (const action of await bar.getByRole('link').all()) {
    const box = (await action.boundingBox())!;
    expect(box.height).toBeGreaterThanOrEqual(44);
    expect(box.width).toBeGreaterThanOrEqual(44);
  }
  await expect(bar.getByRole('link', { name: 'Позвонить в клуб' })).toHaveAttribute('href', 'tel:+79156720030');
  await bar.getByRole('link', { name: 'Записаться', exact: true }).click();
  await expect(page.locator('#booking-heading')).toBeFocused();
  await page.getByLabel('Желаемый номинал').selectOption('4000');
  await page.getByRole('link', { name: 'Купить сертификат' }).click();
  await expect(page.locator('#booking-form')).toContainText('Подарочный сертификат на 4');
  await page.getByLabel('Ваше имя').fill('Анна');
  await page.getByLabel(/^Телефон/).fill('89991234567');
  await page.getByLabel('Возраст всадника').selectOption('7–12 лет');
  await page.locator('#personal-data-consent').check();
  await page.getByRole('button', { name: 'Оставить заявку на первое занятие' }).click();
  await expect(page.getByRole('status')).toContainText('Заявка принята');
  expect(payload.notes).toBe('Возраст всадника: 7–12 лет');
  expect(payload.direction).toContain('Подарочный сертификат на 4');
  expect(payload).not.toHaveProperty('serviceId');
  await expect(page.locator('#contacts').getByRole('link', { name: 'MAX', exact: true })).toHaveAttribute('href', 'https://max.ru/join/Evl2Mp0moqVwQAeBIPaY5ozOrE6rs83dO45_5SrqAvo');
  await page.screenshot({ path: test.info().outputPath('mobile-success.png'), fullPage: true });
});
