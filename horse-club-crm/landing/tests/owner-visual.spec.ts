import { expect, test } from '@playwright/test';

for (const width of [320, 375, 768, 1280, 1440]) {
  test(`service carousel, quick booking and contacts at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.route('**/api/public/content', route => route.fulfill({ json: {} }));
    let payload: Record<string, unknown> = {};
    await page.route('**/api/leads', route => {
      payload = route.request().postDataJSON();
      return route.fulfill({ status: 201, json: { success: true } });
    });
    await page.goto('/');
    const address = page.locator('#hero').getByRole('link', { name: /Бастионная/ });
    await expect(address).toHaveAttribute('href', /https:\/\/yandex.ru\/maps\//);
    await expect(address).toHaveAttribute('target', '_blank');
    await expect(address).toHaveAttribute('rel', 'noopener noreferrer');
    const carousel = page.getByRole('list', { name: 'Услуги клуба' });
    await expect(carousel).toHaveCSS('scroll-snap-type', 'x mandatory');
    expect(await carousel.evaluate(el => el.scrollWidth > el.clientWidth)).toBe(true);
    const cards = carousel.locator('article');
    const title = await cards.first().getByRole('heading').innerText();
    // The image/header area activates the stretched semantic button too.
    await cards.first().click({ position: { x: 25, y: 25 } });
    const dialog = page.getByRole('dialog', { name: 'Быстрая запись' });
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText(`Выбранная услуга: ${title}`);
    await expect(dialog.locator('#booking-heading')).toBeFocused();
    await dialog.getByLabel('Ваше имя').fill('Анна');
    await dialog.getByLabel(/^Телефон/).fill('89991234567');
    await dialog.getByRole('button', { name: 'Оставить заявку на первое занятие' }).click();
    await expect(dialog.getByRole('alert')).toContainText('Подтвердите согласие');
    await dialog.getByLabel('Я согласен на обработку персональных данных').check();
    await dialog.getByRole('button', { name: 'Оставить заявку на первое занятие' }).click();
    await expect(dialog.getByRole('status')).toContainText('Заявка принята');
    expect(payload.direction).toBe(title);
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(cards.first().getByRole('button')).toBeFocused();
    await carousel.evaluate(el => { el.scrollLeft = el.scrollWidth; });
    await expect(cards.last()).toBeInViewport();
    await cards.last().getByRole('button').focus();
    await page.keyboard.press('Enter');
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: 'Закрыть', exact: true }).click();
    await expect(cards.last().getByRole('button')).toBeFocused();
    const phone = page.locator('#contacts a[href="tel:+79156720030"]');
    await expect(phone).toHaveText('+7 (915) 672-00-30');
    expect(await phone.evaluate(el => {
      const range = document.createRange(); range.selectNodeContents(el);
      const rects = range.getClientRects();
      const card = el.parentElement!.getBoundingClientRect();
      return rects.length === 1 && rects[0].right <= card.right - 12;
    })).toBe(true);
    await expect(page.getByRole('link', { name: 'MAX', exact: true })).toHaveAttribute('href', 'https://max.ru');
    await expect(page.getByRole('link', { name: /Telegram/i })).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.locator('#contacts').scrollIntoViewIfNeeded();
    await page.screenshot({ path: test.info().outputPath(`contacts-${width}.png`) });
  });
}
