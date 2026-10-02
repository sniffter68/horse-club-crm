import { expect, test } from '@playwright/test';

for (const width of [390, 768, 1440]) {
  test(`responsive layout ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => {
      if (message.type() === 'error' && !message.text().includes('ERR_NETWORK_ACCESS_DENIED')) errors.push(message.text());
    });

    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1, name: 'Искусство быть в седле' })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.getByRole('link', { name: 'Записаться на занятие' }).click();
    await expect(page.locator('#contacts')).toBeInViewport();
    await expect(page.getByRole('link', { name: /\+7 \(915\) 672-00-30/ })).toHaveAttribute('href', 'tel:+79156720030');
    expect(errors).toEqual([]);
  });
}

test('validates, masks phone, sends selected service and prevents double submit', async ({ page }) => {
  let sent: unknown;
  let requests = 0;
  await page.route('**/api/leads', async (route) => {
    requests += 1;
    sent = route.request().postDataJSON();
    await new Promise((resolve) => setTimeout(resolve, 200));
    await route.fulfill({ status: 201, json: { success: true, leadId: '', message: 'OK' } });
  });

  await page.goto('/');
  await page.getByRole('button', { name: 'Отправить заявку' }).click();
  await expect(page.getByText('Укажите имя')).toBeVisible();
  expect(requests).toBe(0);

  await page.getByLabel('Имя').fill('Анна');
  await page.getByLabel('Телефон').fill('8999');
  await page.getByLabel('Телефон').press('Backspace');
  await expect(page.getByLabel('Телефон')).toHaveValue('+7 (99');
  await page.getByLabel('Телефон').fill('89991234567');
  await expect(page.getByLabel('Телефон')).toHaveValue('+7 (999) 123-45-67');
  await page.getByLabel('Услуга').selectOption('single-training');
  await page.getByLabel('Я даю согласие на обработку персональных данных для рассмотрения заявки.').check();
  await page.getByRole('button', { name: 'Отправить заявку' }).click();
  await expect(page.getByRole('button', { name: 'Отправляем…' })).toBeDisabled();
  await expect(page.getByRole('status')).toContainText('Заявка принята');
  expect(sent).toEqual({
    consentAccepted: true,
    consentVersion: '2026-09-19',
    firstName: 'Анна',
    phone: '+79991234567',
    preferences: 'Выбранная услуга: Разовое занятие с тренером',
  });
  expect(requests).toBe(1);
});

test('preserves form after a server error and honeypot prevents requests', async ({ page }) => {
  let requests = 0;
  await page.route('**/api/leads', (route) => {
    requests += 1;
    return route.fulfill({ status: 400, json: { message: ['Проверьте телефон'] } });
  });

  await page.goto('/');
  await page.getByLabel('Имя').fill('Анна');
  await page.getByLabel('Телефон').fill('+79991234567');
  await page.getByLabel('Услуга').selectOption('regular-training');
  await page.getByLabel('Я даю согласие на обработку персональных данных для рассмотрения заявки.').check();
  await page.getByRole('button', { name: 'Отправить заявку' }).click();
  await expect(page.getByRole('alert')).toHaveText('Проверьте телефон');
  await expect(page.getByLabel('Имя')).toHaveValue('Анна');
  await page.locator('#website').evaluate((element: HTMLInputElement) => {
    element.value = 'bot.example';
  });
  await page.getByRole('button', { name: 'Отправить заявку' }).click();
  await expect(page.getByRole('status')).toContainText('Заявка принята');
  expect(requests).toBe(1);
});

test('requires separate consent and focuses its checkbox', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Имя').fill('Анна');
  await page.getByLabel('Телефон').fill('+79991234567');
  await page.getByLabel('Услуга').selectOption('pony-ride');
  await page.getByRole('button', { name: 'Отправить заявку' }).click();
  await expect(page.getByText('Подтвердите согласие, чтобы отправить заявку')).toBeVisible();
  await expect(page.locator('#personal-data-consent')).toBeFocused();
});
