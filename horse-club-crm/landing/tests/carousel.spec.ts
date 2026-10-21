import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.route('**/api/public/content', route => route.fulfill({ json: {
    horses: Array.from({ length: 7 }, (_, index) => ({ id: `h${index}`, name: `Лошадь ${index + 1}`, breed: 'Орловская', role: 'Для начинающих', imageUrl: null })),
    trainers: Array.from({ length: 5 }, (_, index) => ({ id: `t${index}`, name: `Тренер ${index + 1}`, role: 'Инструктор', qualification: 'КМС', experience: '10 лет', imageUrl: null })),
    services: [],
  } }));
});

for (const width of [390, 768, 1440]) {
  test(`carousel layout, boundaries, keyboard and tab restoration at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/');
    const horses = page.getByRole('region', { name: 'Лошади клуба', exact: true });
    await expect(horses.locator('li')).toHaveCount(7);
    await horses.scrollIntoViewIfNeeded();
    const viewport = horses.locator('.club-carousel__viewport');
    const fraction = await viewport.evaluate(el => el.querySelector('li')!.getBoundingClientRect().width / el.clientWidth);
    expect(fraction).toBeGreaterThan(width < 640 ? .8 : width < 1025 ? .38 : .28);
    expect(fraction).toBeLessThan(width < 640 ? .86 : width < 1025 ? .46 : .34);
    await expect(horses.getByRole('button', { name: 'Влево', exact: true })).toBeDisabled();
    await horses.getByRole('button', { name: 'Вправо', exact: true }).click();
    await expect(horses.locator('[aria-current="true"]')).toHaveAttribute('aria-label', 'К слайду 2');
    await page.getByRole('button', { name: 'Тренеры', exact: true }).click();
    const trainers = page.getByRole('region', { name: 'Тренеры', exact: true });
    await expect(trainers).toBeVisible();
    await trainers.getByRole('button', { name: 'Вправо', exact: true }).click();
    await page.getByRole('button', { name: 'Лошади клуба', exact: true }).click();
    await expect(horses.locator('[aria-current="true"]')).toHaveAttribute('aria-label', 'К слайду 2');
    await viewport.focus();
    await page.keyboard.press('End');
    await expect(horses.getByRole('button', { name: 'Вправо', exact: true })).toBeDisabled();
    await page.keyboard.press('Home');
    await expect(horses.getByRole('button', { name: 'Влево', exact: true })).toBeDisabled();
    await expect(horses.locator('img').first()).toHaveAttribute('src', '/images/catalog-placeholder.svg');
    await horses.locator('li > button').first().click();
    await expect(page.getByRole('dialog')).toContainText('Лошадь 1');
    await page.keyboard.press('Escape');
    for (const label of ['Стандарты клуба', 'Впервые в клубе']) {
      const carousel = page.getByRole('region', { name: label, exact: true });
      await carousel.scrollIntoViewIfNeeded();
      await expect(carousel.locator('li')).toHaveCount(4);
      await carousel.getByRole('button', { name: 'Вправо', exact: true }).click();
      await expect(carousel.getByRole('button', { name: 'Влево', exact: true })).toBeEnabled();
      // In-view card reveals must finish after the track moves, including its last card.
      await expect(carousel.locator('.club-carousel__slide > *').nth(width > 1024 ? 3 : 1)).toHaveCSS('opacity', '1');
      await carousel.screenshot({ path: test.info().outputPath(`${label}-${width}.png`) });
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}

test('touch swipes advance without opening a card; vertical gestures stay available', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  await page.route('**/api/public/content', route => route.fulfill({ json: { horses: [], trainers: [], services: [] } }));
  await page.goto('/');
  const carousel = page.getByRole('region', { name: 'Лошади клуба', exact: true });
  await carousel.scrollIntoViewIfNeeded();
  const viewport = carousel.locator('.club-carousel__viewport');
  await expect(viewport.locator('li').first()).toBeVisible();
  const box = (await viewport.boundingBox())!;
  const session = await context.newCDPSession(page);
  const y = Math.max(100, box.y + 120);
  await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 320, y }] });
  for (const x of [280, 220, 160, 100, 60]) {
    await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y }] });
    await page.waitForTimeout(30);
  }
  await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await expect(carousel.getByRole('button', { name: 'Влево', exact: true })).toBeEnabled();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(carousel.locator('.club-carousel__track')).toHaveCSS('touch-action', 'pan-y pinch-zoom');
  await context.close();
});

test('single-card catalogs do not show unnecessary navigation', async ({ page }) => {
  await page.route('**/api/public/content', route => route.fulfill({ json: {
    horses: [{ id: 'single', name: 'Одна лошадь', imageUrl: '/uploads/65ecf169-6c22-4e89-8baf-ddc3399da7ad.png' }], trainers: [], services: [],
  } }));
  await page.route('**/uploads/*', route => route.fulfill({ status: 404 }));
  await page.goto('/');
  const carousel = page.getByRole('region', { name: 'Лошади клуба', exact: true });
  await expect(carousel.locator('li')).toHaveCount(1);
  await expect(carousel.getByRole('button', { name: 'Вправо', exact: true })).toHaveCount(0);
  await carousel.scrollIntoViewIfNeeded();
  await expect(carousel.locator('img')).toHaveAttribute('src', '/images/catalog-placeholder.svg');
});
