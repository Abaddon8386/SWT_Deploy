// Requires the local Vite server and Playwright through NODE_PATH.
const assert = require('node:assert/strict');
const path = require('node:path');
const { chromium } = require('playwright-core');
const base = process.env.PUBLIC_UI_URL || 'http://127.0.0.1:5173';
const output = process.env.PUBLIC_UI_OUTPUT ? path.resolve(process.env.PUBLIC_UI_OUTPUT) : path.resolve(__dirname, '../docs/ui-review/fitness-reference');

(async () => {
  const browser = await chromium.launch({ headless: true, ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}) });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'no-preference' });
  await page.addInitScript(() => localStorage.setItem('scms_theme', 'dark'));
  await page.route('**/api/v1/public/catalog', route => route.fulfill({ json: { success: true, data: require('./public-catalog-fixture.cjs') } }));
  await page.route('**/api/v1/public/products*', route => route.fulfill({ json: { success: true, data: { content: [], number: 0, size: 3, totalElements: 0, totalPages: 0 } } }));
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.route('**/accounts.google.com/gsi/**', (route) => route.fulfill({ body: '', contentType: 'text/javascript' }));
  try {
    await page.goto(base);
    await page.waitForFunction(() => {
      const hero = document.querySelector('.fit-hero-athlete');
      return hero && getComputedStyle(hero).animationName !== 'none';
    });
    assert.notEqual(await page.locator('.fit-hero-athlete').evaluate((image) => getComputedStyle(image).animationName), 'none', 'Hero athlete must have an entrance animation');
    assert.equal(await page.locator('.fit-motion-run').count(), 0, 'Page must keep vertical document flow');
    await page.waitForFunction(() => document.querySelector('.fit-plan')?.classList.contains('fit-reveal-ready'));
    const plan = page.locator('.fit-plan').first();
    assert.equal(await plan.evaluate((element) => getComputedStyle(element).opacity), '0', 'Offscreen cards must wait for viewport entry');
    assert.match(await plan.evaluate((element) => getComputedStyle(element).transitionProperty), /opacity/, 'Card entrances must transition opacity rather than appear instantly');
    await plan.scrollIntoViewIfNeeded();
    await page.waitForFunction(() => document.querySelector('.fit-plan').classList.contains('is-visible'));
    await page.waitForFunction(() => getComputedStyle(document.querySelector('.fit-plan')).opacity === '1');
    await page.screenshot({ path: path.join(output, 'animation-pricing-desktop.png') });
    await page.evaluate(() => scrollTo({ top: 0, behavior: 'instant' }));
    await page.waitForTimeout(150);
    assert.equal(await plan.evaluate((element) => element.classList.contains('is-visible')), false, 'Cards must reset after leaving the viewport so they can reveal again');
    await page.locator('.fit-final-cta').scrollIntoViewIfNeeded();
    await page.waitForFunction(() => !document.querySelector('.fit-plan').classList.contains('is-visible'));
    await plan.scrollIntoViewIfNeeded();
    await page.waitForFunction(() => document.querySelector('.fit-plan').classList.contains('is-visible'));
    assert.equal(await plan.getAttribute('data-reveal-direction'), 'up', 'Scrolling back to a card must use an upward-scroll entrance');
    await page.waitForFunction(() => getComputedStyle(document.querySelector('.fit-plan')).opacity === '1');
    await plan.evaluate((element) => scrollTo({ top: scrollY + element.getBoundingClientRect().bottom - 24, behavior: 'instant' }));
    await page.waitForTimeout(150);
    assert.equal(await plan.evaluate((element) => element.classList.contains('is-visible')), true, 'Partially visible cards must not flicker or reset');
    await page.evaluate(() => scrollTo({ top: 0, behavior: 'instant' }));
    await page.waitForFunction(() => document.querySelector('.fit-hero-athlete')?.classList.contains('is-visible'));
    assert.notEqual(await page.locator('.fit-hero-athlete').evaluate((image) => getComputedStyle(image).animationName), 'none');
    const beforeWheel = await page.evaluate(() => scrollY);
    await page.mouse.wheel(0, 450);
    await page.waitForFunction((before) => scrollY > before + 100, beforeWheel);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    console.log('PASS replay in both scroll directions, hero re-entry, stable partial visibility and native vertical scrolling');

    await page.locator('.fit-nav').getByRole('link', { name: 'Huấn luyện viên' }).click();
    await page.getByRole('button', { name: 'Nhóm huấn luyện 2' }).click();
    await page.getByRole('heading', { name: 'HLV kiểm chứng 3' }).waitFor();
    await page.waitForFunction(() => [...document.querySelectorAll('.fit-trainer-card')].every((card) => card.classList.contains('fit-reveal-ready')));
    await page.locator('.fit-trainer-card').first().scrollIntoViewIfNeeded();
    await page.waitForFunction(() => document.querySelector('.fit-trainer-card')?.classList.contains('is-visible'));
    await page.getByRole('button', { name: 'Free weights' }).click();
    await page.getByRole('heading', { name: 'Tập trung vào từng chuyển động.' }).waitFor();
    console.log('PASS navigation, trainer carousel and gallery work with animation enabled');

    // These sections may be introduced independently of the shared animation system.
    if (await page.locator('.fit-schedule').count()) {
      for (const selector of ['.fit-metric-card', '.fit-schedule-card', '.fit-step-item', '.fit-bmi-card', '.fit-faq-item']) {
        await page.locator(selector).first().scrollIntoViewIfNeeded();
        await page.waitForFunction((selector) => document.querySelector(selector)?.classList.contains('is-visible'), selector);
        assert.match(await page.locator(selector).first().evaluate((element) => getComputedStyle(element).transitionProperty), /opacity/);
      }
      await page.getByRole('button', { name: 'Strength & Barbell' }).click();
      await page.waitForFunction(() => document.querySelectorAll('.fit-schedule-card').length === 2);
      assert.equal(await page.locator('.fit-schedule-card').count(), 2);
      await page.locator('.fit-schedule-card').first().scrollIntoViewIfNeeded();
      await page.waitForFunction(() => [...document.querySelectorAll('.fit-schedule-card')].every((card) => card.classList.contains('is-visible')));
      await page.getByRole('button', { name: 'Tất cả bộ môn' }).click();
      await page.waitForFunction(() => document.querySelectorAll('.fit-schedule-card').length === 4);
      assert.equal(await page.locator('.fit-schedule-card').count(), 4);
      await page.waitForFunction(() => [...document.querySelectorAll('.fit-schedule-card')].every((card) => card.classList.contains('fit-reveal-ready')));
      const delay = await page.locator('.fit-schedule-card').nth(2).evaluate((card) => getComputedStyle(card).getPropertyValue('--fit-reveal-delay').trim());
      assert.equal(parseFloat(delay) * (delay.endsWith('ms') ? 1 : 1000), 200);
      await page.locator('#fit-bmi-height').fill('175');
      await page.locator('#fit-bmi-weight').fill('70');
      await page.getByRole('button', { name: 'Giảm mỡ & Săn chắc' }).click();
      await page.locator('.fit-bmi-result').filter({ hasText: '22.9' }).waitFor();
      assert.match(await page.locator('.fit-bmi-result').innerText(), /22\.9/);
      const faq = page.getByRole('button', { name: /Tôi có thể tạm dừng/ });
      for (let attempt = 0; attempt < 2; attempt++) {
        await faq.click();
        await page.locator('.fit-faq-answer').waitFor();
        assert.equal(await page.locator('.fit-faq-answer').evaluate((answer) => getComputedStyle(answer).animationName), 'fit-component-lift');
        await faq.click();
        await page.locator('.fit-faq-answer').waitFor({ state: 'detached' });
        assert.equal(await page.locator('.fit-faq-answer').count(), 0);
      }
      console.log('PASS new section reveals, dynamically filtered class cards, stagger, BMI interaction and repeated FAQ opening');
    }

    await page.goto(`${base}/login`);
    await page.waitForFunction(() => document.querySelector('.fit-auth-form')?.classList.contains('is-visible'));
    await page.locator('#login-identifier').fill('review_member');
    await page.locator('#login-password').fill('test-password');
    await page.getByRole('button', { name: 'Hiện mật khẩu' }).click();
    assert.equal(await page.locator('#login-password').getAttribute('type'), 'text');
    console.log('PASS authentication entrance preserves form interaction');

    await page.emulateMedia({ reducedMotion: 'reduce' });
    assert.equal(await page.locator('.fit-auth-form').evaluate((element) => getComputedStyle(element).opacity), '1');
    await page.goto(base);
    assert.equal(await page.locator('.fit-hero-athlete').evaluate((image) => getComputedStyle(image).animationName), 'none');
    assert.equal(await page.locator('.fit-plan').first().evaluate((element) => getComputedStyle(element).opacity), '1');
    assert.equal(await page.locator('.fit-reveal-ready').count(), 0);
    console.log('PASS live reduced-motion preference and static readable fallback');

    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(base);
    await page.locator('#packages').scrollIntoViewIfNeeded();
    await page.waitForFunction(() => document.querySelector('.fit-plan')?.classList.contains('is-visible'));
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    assert.deepEqual(errors, []);
    console.log('PASS mobile component reveals and no uncaught browser errors');

    await page.addInitScript(() => Object.defineProperty(window, 'IntersectionObserver', { value: undefined, configurable: true }));
    await page.goto(base);
    assert.equal(await page.locator('.fit-plan').first().evaluate((element) => getComputedStyle(element).opacity), '1');
    assert.equal(await page.locator('.fit-reveal-ready').count(), 0);
    assert.deepEqual(errors, []);
    console.log('PASS readable fallback when IntersectionObserver is unavailable');
  } finally {
    await browser.close();
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
