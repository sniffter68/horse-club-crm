import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { readFileSync } from 'node:fs';
import { catalogLabel, formatPrice } from '../src/catalogFormat';

test('catalog formatting translates legacy codes, hides unknown codes and handles invalid prices', () => {
  expect(['beginner', 'SHOW_JUMPING', 'Master of Sport', 'КМС', 'Неизвестное направление', 'unknown_internal_code'].map(catalogLabel))
    .toEqual(['Для начинающих', 'Конкур', 'Мастер спорта', 'КМС', 'Неизвестное направление', '']);
  expect(formatPrice('2500')).toMatch(/2\s500\s₽/);
  expect(formatPrice(0)).toBe('0 ₽');
  for (const input of [undefined, null, '', 'bad', -1, Infinity]) expect(formatPrice(input)).toBe('По запросу');
});

const image = '/uploads/65ecf169-6c22-4e89-8baf-ddc3399da7ad.png';
const serviceId = '65ecf169-6c22-4e89-8baf-ddc3399da7ad';
const longText = 'ОченьДлинноеСловоБезПробелов'.repeat(20);
const content = {
  services: [{ id: serviceId, name: 'Конкур', title: 'Персональное занятие', role: 'SHOW_JUMPING', description: longText,
    price: '2500', durationMinutes: 60, imageUrl: image }],
  horses: [{ id: 'h1', name: longText, breed: 'Тракененская', riderLevel: 'BEGINNER', description: longText, imageUrl: image },
    { id: 'h2', name: 'Мирабель', role: 'ADVANCED', description: 'Спокойная лошадь', imageUrl: image }],
  trainers: [{ id: 't1', name: 'Екатерина', role: 'SENIOR_TRAINER', qualification: 'KMS', specializations: ['DRESSAGE', 'SHOW_JUMPING', 'UNKNOWN_INTERNAL_CODE'],
    description: longText, imageUrl: image }],
};
// A tall phone photo deliberately exercises object-fit rather than matching the card's ratio.
const photo = '<svg xmlns="http://www.w3.org/2000/svg" width="300" height="900"><rect width="300" height="900" fill="#724C39"/></svg>';

async function mockContent(page: Page) {
  await page.route('**/api/public/content', route => route.fulfill({ json: content }));
  await page.route('**/uploads/*', route => route.fulfill({ contentType: 'image/svg+xml', body: photo }));
  await page.route('https://images.unsplash.com/**', route => route.fulfill({ contentType: 'image/svg+xml', body: photo }));
}

for (const width of [320, 390, 768, 1440]) {
  test(`original card layout, keyboard dialogs and semantic accessibility at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await mockContent(page);
    await page.goto('/');
    await expect(page.locator('#services')).toContainText(/2\s500\s₽/);
    await expect(page.locator('#services')).toContainText('60 мин');
    await expect(page.locator('#horses-trainers')).toContainText('Для начинающих');
    await page.locator('#about').scrollIntoViewIfNeeded();
    await expect(page.locator('#about > div').last()).toBeVisible();
    // The owner explicitly restored the original palette; keep all non-visual a11y rules.
    const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).disableRules(['color-contrast']).analyze();
    expect(axe.violations.map(item => ({ id: item.id, nodes: item.nodes.map(node => node.target) }))).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    // Preserve the original h-72 photo containers instead of enforcing the rejected 4:3 redesign.
    const photos = page.locator('#horses-trainers .club-carousel__slide > button img');
    for (const media of await photos.all()) {
      await expect(media).toHaveCSS('object-fit', 'cover');
      expect((await media.boundingBox())!.height).toBeCloseTo(288, 0);
    }
    await expect(page.locator('#services img')).toHaveCSS('object-fit', 'contain');
    await page.locator('#horses-trainers').scrollIntoViewIfNeeded();
    await page.screenshot({ path: test.info().outputPath(`catalog-${width}.png`) });
    const open = page.locator('#horses-trainers .club-carousel__slide > button').first();
    await open.focus();
    await page.keyboard.press('Enter');
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Закрыть', exact: true })).toBeFocused();
    await page.keyboard.press('Shift+Tab');
    await expect(dialog.getByRole('link', { name: 'Записаться', exact: true })).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(dialog.getByRole('button', { name: 'Закрыть', exact: true })).toBeFocused();
    expect((await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).disableRules(['color-contrast']).analyze()).violations).toEqual([]);
    await page.keyboard.press('Escape');
    await expect(open).toBeFocused();
    await page.getByRole('button', { name: 'Тренеры', exact: true }).click();
    await expect(page.locator('#horses-trainers')).toContainText('КМС');
    await expect(page.locator('#horses-trainers')).toContainText('Старший тренер');
    await expect(page.locator('#horses-trainers')).not.toContainText('UNKNOWN_INTERNAL_CODE');
    if (width < 1024) {
      await page.getByRole('button', { name: 'Открыть меню', exact: true }).click();
      await expect(page.getByRole('dialog', { name: 'Меню сайта' })).toBeVisible();
      expect((await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).disableRules(['color-contrast']).analyze()).violations).toEqual([]);
      await page.keyboard.press('Escape');
      await expect(page.getByRole('button', { name: 'Открыть меню', exact: true })).toBeFocused();
    }
  });
}

test('card choices survive form errors, preserve the comment and reach the lead payload', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await mockContent(page);
  let payload: Record<string, unknown> = {};
  let calls = 0;
  await page.route('**/api/leads', route => {
    payload = route.request().postDataJSON(); calls++;
    return route.fulfill({ status: calls === 1 ? 503 : 201, json: calls === 1 ? {} : { success: true } });
  });
  await page.goto('/');
  await page.getByLabel('Ваше имя').fill('Анна');
  await page.getByLabel(/^Телефон/).fill('89991234567');
  await page.getByLabel('Удобная дата или опыт').fill('В субботу');
  await page.locator('#services').getByRole('link', { name: 'Записаться на занятие', exact: true }).click();
  await expect(page.locator('#booking-heading')).toBeFocused();
  await expect(page.locator('#contacts').getByRole('button', { name: 'Персональное занятие', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.locator('#horses-trainers .club-carousel__slide > button').filter({ has: page.getByRole('heading', { name: 'Мирабель', exact: true }) }).click();
  await page.getByRole('dialog').getByRole('link', { name: 'Записаться', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('button', { name: 'Тренеры', exact: true }).click();
  // The original tabs crossfade: wait for the trainer card, not the exiting horse grid.
  await page.locator('#horses-trainers .club-carousel__slide > button').filter({ has: page.getByRole('heading', { name: 'Екатерина', exact: true }) }).click();
  await page.getByRole('dialog').getByRole('link', { name: 'Записаться', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByLabel('Удобная дата или опыт')).toHaveValue('В субботу');
  await expect(page.locator('#contacts')).toContainText('Тренер: Екатерина');
  await page.getByLabel('Я даю согласие').check();
  await page.getByRole('button', { name: 'Отправить заявку на тренировку' }).click();
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(page.locator('#contacts')).toContainText('Лошадь: Мирабель');
  await page.getByRole('button', { name: 'Отправить заявку на тренировку' }).click();
  await expect(page.getByRole('status')).toContainText('Заявка принята');
  expect(payload).toMatchObject({ serviceId, direction: 'Персональное занятие', notes: 'Лошадь: Мирабель\nТренер: Екатерина\nВ субботу' });
});

test('production CSP allows uploaded photos on same-origin and API origin; SEO and lazy media are present', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const caddy = readFileSync(new URL('../../docker/Caddyfile', import.meta.url), 'utf8');
  const csp = caddy.match(/Content-Security-Policy "([^"]+)"/)![1];
  expect(caddy.match(/Content-Security-Policy "/g)).toHaveLength(1);
  expect(caddy).toContain('@uploads path /uploads /uploads/*');
  const violations: string[] = [];
  await page.exposeFunction('recordCspViolation', (directive: string) => violations.push(directive));
  await page.addInitScript(() => document.addEventListener('securitypolicyviolation', event => {
    void (window as unknown as { recordCspViolation: (value: string) => Promise<void> }).recordCspViolation(event.violatedDirective);
  }));
  await page.route('**/api/public/content', route => route.fulfill({ json: {
    ...content, services: [{ ...content.services[0], imageUrl: `https://api.horseclub68.ru${image}` }],
  } }));
  await page.route('https://api.horseclub68.ru/uploads/*', route => route.fulfill({ contentType: 'image/svg+xml', body: photo }));
  await page.route('**/uploads/*', route => route.fulfill({ contentType: 'image/svg+xml', body: photo }));
  await page.route('https://images.unsplash.com/**', route => route.fulfill({ contentType: 'image/svg+xml', body: photo }));
  await page.route('**/', async route => {
    const response = await route.fetch();
    await route.fulfill({ response, headers: { ...response.headers(), 'content-security-policy': csp } });
  });
  await page.goto('/');
  const media = page.locator('#services img');
  await page.locator('#services').scrollIntoViewIfNeeded();
  await expect(media).toHaveAttribute('src', `https://api.horseclub68.ru${image}`);
  await expect.poll(() => media.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);
  await page.locator('#horses-trainers').scrollIntoViewIfNeeded();
  await expect.poll(() => page.locator('#horses-trainers img').first().evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);
  expect(violations).toEqual([]);
  expect(await page.locator('main img:not(#hero img)').evaluateAll(images => images.every(img => img.getAttribute('loading') === 'lazy' && img.getAttribute('decoding') === 'async'))).toBe(true);
  await expect(page).toHaveTitle(/СЛКС Тамбов.*верховая езда/);
  for (const property of ['og:title', 'og:description', 'og:type', 'og:locale', 'og:image']) {
    await expect(page.locator(`meta[property="${property}"]`)).toHaveAttribute('content', /.+/);
  }
});
