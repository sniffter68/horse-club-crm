import { expect, test } from '@playwright/test';

const firstLesson = 'Первое занятие по верховой езде';
test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  // A real-looking discipline UUID must never leak into a first-lesson request.
  await page.route('**/api/public/content', route => route.fulfill({ json: {
    horses: [], trainers: [], services: [{ id: '65ecf169-6c22-4e89-8baf-ddc3399da7ad', name: 'Выездка', title: 'Выездка' }],
  } }));
});

for (const reducedMotion of ['reduce', 'no-preference'] as const) {
  test(`first-lesson CTA resets service and shows the form at 375px (${reducedMotion})`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion });
    await page.goto('/');
    await page.getByLabel('Ваше имя').fill('Анна');
    await page.getByText('Выбрать другую услугу', { exact: true }).click();
    const services = page.getByRole('group', { name: 'Услуги', exact: true });
    await expect(services.getByRole('button')).toHaveText([
      firstLesson, 'Индивидуальная тренировка', 'Катание на пони (дети)',
      'Фотосессия с лошадьми', 'Групповая экскурсия', 'Прогулка в лес',
    ]);
    await services.getByRole('button', { name: 'Прогулка в лес', exact: true }).click();
    for (const section of ['#hero', '#first-lesson']) {
      const cta = page.locator(section).getByRole('link', { name: 'Записаться на первое занятие', exact: true });
      await expect(cta).toHaveAttribute('href', '#booking-form');
      await cta.click();
      await expect(page.locator('#booking-heading')).toBeFocused();
      await expect(page.locator('#booking-form')).toContainText(`Выбранная услуга: ${firstLesson}`);
      await expect(services).not.toBeVisible();
      await expect.poll(() => page.locator('#booking-form').evaluate(el => {
        const { top } = el.getBoundingClientRect();
        const headerBottom = document.querySelector('header')!.getBoundingClientRect().bottom;
        return top >= headerBottom && top < 200;
      })).toBe(true);
      await expect(page.getByLabel('Ваше имя')).toBeInViewport();
      await expect(page.getByLabel('Ваше имя')).toHaveValue('Анна');
    }
    await page.screenshot({ path: test.info().outputPath('booking-375.png') });
  });
}

test('first lesson submits without a discipline ID and policy opens with keyboard', async ({ page }) => {
  let payload: Record<string, unknown> = {};
  await page.route('**/api/leads', route => {
    payload = route.request().postDataJSON();
    return route.fulfill({ status: 201, json: { success: true } });
  });
  await page.goto('/');
  await page.locator('#hero').getByRole('link', { name: 'Записаться на первое занятие' }).click();
  const policy = page.getByRole('link', { name: 'Политикой конфиденциальности', exact: true });
  await policy.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog', { name: 'Политика конфиденциальности' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(policy).toBeFocused();
  await page.getByLabel('Ваше имя').fill('Анна');
  await page.getByLabel(/^Телефон/).fill('89991234567');
  await page.getByLabel('Я даю согласие').check();
  await page.getByRole('button', { name: 'Оставить заявку на первое занятие', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Заявка принята!');
  await expect(page.getByRole('status')).toContainText('чтобы согласовать дату и время первого занятия');
  expect(payload).toMatchObject({ direction: firstLesson, phone: '+79991234567', consentAccepted: true, source: 'landing' });
  expect(payload).not.toHaveProperty('serviceId');
});

for (const width of [375, 1440]) {
  test(`navigation booking selects first lesson at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
    await page.getByText('Выбрать другую услугу', { exact: true }).click();
    await page.getByRole('button', { name: 'Фотосессия с лошадьми', exact: true }).click();
    await page.evaluate(() => window.scrollTo(0, 0));
    if (width === 375) {
      await page.getByRole('button', { name: 'Открыть меню', exact: true }).click();
      await page.getByRole('dialog', { name: 'Меню сайта' }).getByRole('link', { name: 'Записаться', exact: true }).click();
      await expect(page.getByRole('dialog', { name: 'Меню сайта' })).toHaveCount(0);
    } else {
      await page.locator('header').getByRole('link', { name: 'Записаться' }).click();
    }
    await expect(page.locator('#booking-heading')).toBeFocused();
    await expect(page.locator('#booking-form')).toContainText(`Выбранная услуга: ${firstLesson}`);
    await expect(page.getByLabel('Ваше имя')).toBeInViewport();
  });
}
