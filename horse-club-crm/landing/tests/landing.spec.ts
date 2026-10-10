import { expect, test } from '@playwright/test';

async function fillForm(page: import('@playwright/test').Page) {
  await page.goto('/');
  await page.getByLabel('Ваше имя').fill('Анна');
  await page.getByLabel(/^Телефон/).fill('89991234567');
  await page.locator('#contacts').getByRole('button', { name: 'Конкур', exact: true }).click();
  await page.getByLabel('Удобная дата или опыт').fill('Первое занятие');
  await page.getByLabel('Я даю согласие').check();
}

for (const width of [390, 768, 1440]) {
  test(`booking form remains usable at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/');
    await page.locator('#contacts').scrollIntoViewIfNeeded();
    await expect(page.getByRole('heading', { name: 'Забронировать занятие' })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: test.info().outputPath(`contacts-${width}.png`), fullPage: false });
  });
}

test('validates input, masks phone, sends real form data and waits for success without double submit', async ({ page }) => {
  let sent: unknown, requests = 0;
  let release!: () => void;
  const pending = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/api/leads', async route => {
    requests++; sent = route.request().postDataJSON();
    await pending;
    await route.fulfill({ status: 201, json: { success: true } });
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Отправить заявку на тренировку' }).click();
  await expect(page.getByRole('alert')).toHaveText('Укажите имя');
  await expect(page.getByLabel('Ваше имя')).toBeFocused();
  expect(requests).toBe(0);
  await fillForm(page);
  await expect(page.getByLabel(/^Телефон/)).toHaveValue('+7 (999) 123-45-67');
  await page.getByRole('button', { name: 'Отправить заявку на тренировку' }).click();
  await expect(page.getByRole('button', { name: 'Отправляем…' })).toBeDisabled();
  await expect(page.getByRole('status')).toHaveCount(0);
  await page.locator('form').dispatchEvent('submit');
  expect(requests).toBe(1);
  release();
  await expect(page.getByRole('status')).toContainText('Заявка принята');
  expect(sent).toEqual({ name: 'Анна', phone: '+79991234567', direction: 'Конкур', source: 'landing',
    notes: 'Первое занятие', consentAccepted: true, consentVersion: '2026-09-19' });
  expect(requests).toBe(1);
});

test('preserves form after server error and supports retry', async ({ page }) => {
  let requests = 0;
  await page.route('**/api/leads', route => {
    requests++;
    return route.fulfill(requests === 1
      ? { status: 503, json: { message: 'unavailable' } } : { status: 201, json: { success: true } });
  });
  await fillForm(page);
  await page.getByRole('button', { name: 'Отправить заявку на тренировку' }).click();
  await expect(page.getByRole('alert')).toContainText('не удалось принять заявку');
  await expect(page.getByLabel('Ваше имя')).toHaveValue('Анна');
  await expect(page.getByLabel('Удобная дата или опыт')).toHaveValue('Первое занятие');
  await expect(page.locator('#contacts').getByRole('button', { name: 'Конкур', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.screenshot({ path: test.info().outputPath('contacts-error.png') });
  await page.getByRole('button', { name: 'Отправить заявку на тренировку' }).click();
  await expect(page.getByRole('status')).toContainText('Заявка принята');
  expect(requests).toBe(2);
});

test('requires separate consent and focuses its checkbox', async ({ page }) => {
  await fillForm(page);
  await page.getByLabel('Я даю согласие').uncheck();
  await page.getByRole('button', { name: 'Отправить заявку на тренировку' }).click();
  await expect(page.getByRole('alert')).toHaveText('Подтвердите согласие, чтобы отправить заявку');
  await expect(page.locator('#personal-data-consent')).toBeFocused();
});

test('network failure never shows a success screen', async ({ page }) => {
  await page.route('**/api/leads', route => route.abort());
  await fillForm(page);
  await page.getByRole('button', { name: 'Отправить заявку на тренировку' }).click();
  await expect(page.getByRole('alert')).toContainText('Проверьте интернет');
  await expect(page.getByRole('status')).toHaveCount(0);
});
