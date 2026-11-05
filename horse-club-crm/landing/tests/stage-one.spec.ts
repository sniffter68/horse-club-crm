import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

for (const width of [375, 390, 768, 1023, 1024, 1025, 1280, 1440, 1920]) {
  test(`hero text and rider stay separate at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: width === 1280 ? 800 : 1080 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.route('**/api/public/content', route => route.fulfill({ json: {} }));
    await page.goto('/');
    const heading = page.locator('#hero-heading');
    await expect(heading).toHaveText('Искусствобыть в седле');
    const text = (await heading.boundingBox())!;
    const rider = (await page.locator('#hero img').boundingBox())!;
    expect(text.x + text.width <= rider.x || text.y + text.height <= rider.y).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const cta = page.locator('#hero').getByRole('link', { name: 'Записаться на первое занятие', exact: true });
    const action = (await cta.boundingBox())!;
    if (width < 1024) expect(action.y + action.height).toBeLessThanOrEqual(rider.y);
    if (width === 1280) await expect(cta).toBeInViewport();
    await cta.focus();
    await expect(cta).toHaveCSS('outline-style', 'solid');
    await page.screenshot({ path: test.info().outputPath(`hero-${width}.png`) });
  });
}

test('landing text meets AA contrast after reveals and in the booking form', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.route('**/api/public/content', route => route.fulfill({ json: {} }));
  await page.goto('/');
  await page.getByRole('button', { name: 'Тренеры', exact: true }).click();
  for (const id of ['services', 'horses-trainers', 'about', 'first-lesson', 'gift-certificates', 'contacts']) {
    await page.locator(`#${id}`).scrollIntoViewIfNeeded();
  }
  const results = await new AxeBuilder({ page }).withRules(['color-contrast']).analyze();
  expect(results.violations.map(({ id, nodes }) => ({ id, nodes: nodes.map(node => ({ target: node.target, summary: node.failureSummary })) }))).toEqual([]);
  expect(await page.locator('p, label').evaluateAll(elements => elements.filter(el => {
    const style = getComputedStyle(el);
    return el.getClientRects().length > 0 && Number.parseFloat(style.fontSize) < 14;
  }).map(el => el.textContent))).toEqual([]);
  await page.locator('#horses-trainers .club-carousel__slide > button').first().click();
  await expect(page.getByRole('dialog')).toBeVisible();
  expect((await new AxeBuilder({ page }).withRules(['color-contrast']).analyze()).violations).toEqual([]);
  await page.keyboard.press('Escape');
});
