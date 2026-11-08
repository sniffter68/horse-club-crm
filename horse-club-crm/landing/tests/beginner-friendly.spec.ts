import { expect, test } from '@playwright/test';

test('beginner formats lead the live catalog and preserve CRM booking IDs', async ({ page }) => {
  const serviceId = '65ecf169-6c22-4e89-8baf-ddc3399da7ad';
  await page.route('**/api/public/content', route => route.fulfill({ json: {
    services: [{ id: serviceId, name: 'Продолжение занятий', price: 2500 }],
  } }));
  let payload: Record<string, unknown> = {};
  await page.route('**/api/leads', route => {
    payload = route.request().postDataJSON();
    return route.fulfill({ status: 201, json: { success: true } });
  });
  await page.goto('/');
  const cards = page.getByRole('list', { name: 'Услуги клуба' }).locator('article');
  await expect(cards.getByRole('heading')).toHaveText([
    'Первое знакомство с лошадью и пробное занятие',
    'Катание на пони для самых маленьких',
    'Семейный визит и экскурсия по конюшне',
    'Продолжение занятий',
  ]);
  for (const index of [0, 1, 2]) await expect(cards.nth(index)).toContainText('Опыт не требуется');
  await cards.last().getByRole('button').click();
  const dialog = page.getByRole('dialog', { name: 'Быстрая запись' });
  await dialog.getByLabel('Ваше имя').fill('Анна');
  await dialog.getByLabel(/^Телефон/).fill('89991234567');
  await dialog.getByLabel('Я согласен на обработку персональных данных').check();
  await dialog.getByRole('button', { name: 'Оставить заявку на первое занятие' }).click();
  await expect(dialog.getByRole('status')).toContainText('Заявка принята');
  expect(payload.serviceId).toBe(serviceId);
});

test('FAQ answers the three first-visit fears with keyboard disclosure', async ({ page }) => {
  await page.route('**/api/public/content', route => route.fulfill({ json: {} }));
  await page.goto('/');
  for (const question of [
    'А если лошадь испугается или понесёт?',
    'Что надеть, если нет специальной формы?',
    'Смогу ли я, если никогда не занимался спортом?',
  ]) {
    const summary = page.locator('#faq summary').filter({ hasText: question });
    await summary.focus();
    await page.keyboard.press('Enter');
    await expect(summary.locator('..')).toHaveAttribute('open', '');
    await expect(summary.locator('..').locator('p')).toBeVisible();
  }
});
