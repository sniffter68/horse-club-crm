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
    expect(text.x + text.width <= rider.x || rider.y + rider.height <= text.y).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const cta = page.locator('#hero').getByRole('link', { name: 'Записаться на первое занятие', exact: true });
    if (width < 1024) expect(rider.y + rider.height).toBeLessThanOrEqual(text.y);
    if (width === 1280) await expect(cta).toBeInViewport();
    await cta.focus();
    await expect(cta).toHaveCSS('outline-style', 'solid');
    await page.screenshot({ path: test.info().outputPath(`hero-${width}.png`) });
  });
}

test('rider motion stays within its reserved space and can be stopped', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.route('**/api/public/content', route => route.fulfill({ json: {} }));
  await page.goto('/');
  const rider = page.locator('.landing-hero__rider');
  await expect(rider).toHaveCSS('animation-name', 'rider-float');
  await expect.poll(() => rider.evaluate(element => (element as HTMLImageElement).naturalWidth)).toBe(1122);
  const visual = page.locator('.landing-hero__visual');
  const frame = (await visual.boundingBox())!;
  const heading = (await page.locator('#hero-heading').boundingBox())!;
  for (const progress of [0, 1000, 2000, 3000, 4000]) {
    await rider.evaluate((element, time) => {
      const animation = element.getAnimations()[0];
      animation.pause();
      animation.currentTime = time;
    }, progress);
    const bounds = (await rider.boundingBox())!;
    expect(bounds.x).toBeGreaterThanOrEqual(heading.x + heading.width);
    expect(bounds.y).toBeGreaterThanOrEqual(frame.y);
    expect(bounds.y + bounds.height).toBeLessThanOrEqual(frame.y + frame.height);
  }
  await page.getByRole('button', { name: 'Остановить анимацию' }).click();
  await expect(rider).toHaveCSS('animation-play-state', 'paused');
  await page.getByRole('button', { name: 'Продолжить анимацию' }).click();
  await expect(rider).toHaveCSS('animation-play-state', 'running');
  await expect(visual).toHaveJSProperty('offsetHeight', frame.height);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(rider).toHaveCSS('animation-name', 'none');
  await expect(page.locator('.landing-hero__motion')).toBeHidden();
});

for (const width of [375, 768]) {
  test(`compact rider and complete heading fit the first screen at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 667 });
    await page.route('**/api/public/content', route => route.fulfill({ json: {} }));
    await page.goto('/');
    const rider = (await page.locator('.landing-hero__visual').boundingBox())!;
    const heading = (await page.locator('#hero-heading').boundingBox())!;
    expect(rider.y + rider.height).toBeLessThanOrEqual(heading.y);
    expect(heading.y + heading.height).toBeLessThanOrEqual(667);
    await page.screenshot({ path: test.info().outputPath(`rider-phone-${width}.png`) });
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
