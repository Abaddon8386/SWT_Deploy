// Run with Playwright available through NODE_PATH, with the local Vite server running.
// UI checks use intercepted auth responses and never create real accounts.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright-core');

const base = process.env.PUBLIC_UI_URL || 'http://127.0.0.1:5173';
const output = process.env.PUBLIC_UI_OUTPUT ? path.resolve(process.env.PUBLIC_UI_OUTPUT) : path.resolve(__dirname, '../docs/ui-review/fitness-reference');

(async () => {
  fs.mkdirSync(output, { recursive: true });
  const browser = await chromium.launch({ headless: true, ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}) });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
  await page.addInitScript(() => localStorage.setItem('scms_theme', 'dark'));
  await page.route('**/api/v1/public/catalog', route => route.fulfill({ json: { success: true, data: require('./public-catalog-fixture.cjs') } }));
  await page.route('**/api/v1/public/products*', route => route.fulfill({ json: { success: true, data: { content: [], number: 0, size: 3, totalElements: 0, totalPages: 0 } } }));
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.route('**/accounts.google.com/gsi/**', (route) => route.fulfill({ body: '', contentType: 'text/javascript' }));
  const check = (label) => console.log(`PASS ${label}`);
  const assertFullWidth = async () => {
    await page.locator('.fit-site').waitFor({ state: 'visible' });
    await page.evaluate(() => new Promise(requestAnimationFrame));
    const layout = await page.evaluate(() => {
      const site = document.querySelector('.fit-site');
      const canvas = document.querySelector('.fit-canvas');
      return {
        viewport: document.documentElement.clientWidth,
        siteLeft: site.getBoundingClientRect().left,
        canvasLeft: canvas.getBoundingClientRect().left,
        canvasRight: canvas.getBoundingClientRect().right,
        padding: getComputedStyle(site).padding,
        scrollbar: getComputedStyle(document.documentElement).scrollbarColor,
        scrollbarWidth: getComputedStyle(document.documentElement).scrollbarWidth,
        scheme: getComputedStyle(document.documentElement).colorScheme,
      };
    });
    assert.equal(layout.siteLeft, 0, 'Public page must start at the viewport edge');
    assert.equal(layout.canvasLeft, 0, 'Canvas must have no outer frame');
    assert.ok(Math.abs(layout.canvasRight - layout.viewport) <= 1, 'Canvas must fill the viewport width');
    assert.equal(layout.padding, '0px', 'Public page must have no outer padding');
    assert.ok(
      layout.scrollbar === 'rgb(206, 145, 128) rgb(32, 32, 32)' || layout.scrollbarWidth === 'none',
      'Scrollbar must use the public palette or be hidden',
    );
    assert.equal(layout.scheme, 'dark', 'Public browser surfaces must use the dark palette');
  };
  try {
    await page.goto(base);
    await page.locator('.fit-site--landing').waitFor();
    await page.evaluate(() => document.fonts.ready);
    assert.equal(await page.locator('.fit-site--landing').count(),1);
    assert.equal(await page.locator('h1,h2').evaluateAll(elements=>elements.every(element=>{
      const style=getComputedStyle(element);
      // DESIGN.md: the sport-story heading has its own 800-weight reference scale.
      const weight = element.matches('#multisport h2') ? '800' : '900';
      return style.fontFamily.includes('Plus Jakarta Sans') && style.fontWeight===weight && style.textTransform==='uppercase';
    })),true,'landing display typography matches the membership-benefits reference');
    await page.locator('.fit-hero-athlete').evaluate((image) => image.decode());
    assert.equal(await page.locator('h1').count(), 1);
    assert.equal(await page.locator('.fit-service').count(), 3);
    assert.equal(await page.locator('.fit-muscle-zone').count(), 6);
    assert.equal(await page.locator('.fit-muscle-pointer').count(), 0);
    await page.locator('.fit-muscle-zone[data-muscle="core"] path').first().hover({ force: true });
    await page.locator('.fit-muscle-callout h3').filter({ hasText: 'Cơ Bụng & Liên Sườn' }).waitFor();
    assert.equal(await page.locator('.fit-muscle-pointer').count(), 1);
    assert.equal(await page.locator('.fit-muscle-cta').getAttribute('href'), '/login');
    await page.locator('.fit-muscle-zone[data-muscle="legs"] path').first().hover({ force: true });
    await page.locator('.fit-muscle-callout h3').filter({ hasText: 'Cơ Đùi & Bắp Chân' }).waitFor();
    await page.locator('.fit-muscle-zone[data-muscle="chest"] path').first().hover({ force: true });
    await page.locator('.fit-muscle-callout h3').filter({ hasText: 'Cơ Ngực' }).waitFor();
    await page.getByRole('button', { name: 'Nhóm huấn luyện 2' }).click();
    await page.getByRole('heading', { name: 'HLV kiểm chứng 3' }).waitFor();
    await page.getByRole('button', { name: 'Nhóm huấn luyện 1' }).click();
    await page.getByRole('button', { name: 'Free weights' }).click();
    await page.getByRole('heading', { name: 'Tập trung vào từng chuyển động.' }).waitFor();
    await page.getByRole('button', { name: 'Strength floor' }).click();
    await page.getByRole('button', { name: 'Đồng hành dài hạn' }).click();
    assert.equal(await page.locator('.fit-plan').count(), 2);
    await page.getByRole('button', { name: 'Gói 1 tháng' }).click();
    assert.equal(await page.locator('.fit-plan').count(), 1);
    check('trainer navigation, gallery switch and pricing filter');
    assert.equal(await page.locator('#schedule').count(), 0, 'Landing no longer contains the weekly schedule section');
    await page.locator('#fit-bmi-height').fill('175');
    await page.locator('#fit-bmi-weight').fill('70');
    await page.getByRole('button', { name: 'Giảm mỡ & Săn chắc' }).click();
    await page.locator('.fit-bmi-result').filter({ hasText: '22.9' }).waitFor();
    await page.getByRole('button', { name: /Tôi có thể tạm dừng/ }).click();
    await page.locator('.fit-faq-answer').filter({ hasText: 'Freeze' }).waitFor();
    check('trainer navigation, gallery switch, BMI calculator, FAQ accordion and pricing filter');
    await page.goto(`${base}/trainers/1`);
    await page.locator('.fit-schedule-card').first().waitFor();
    assert.equal(await page.locator('.fit-schedule-card').count(), 2, 'Trainer profile retains its live schedule');
    assert.equal(await page.locator('.fit-schedule-card h3').first().textContent(), 'Lớp kiểm chứng 1');
    check('trainer profile retains the API-backed schedule removed from landing');

    for (const width of [320, 375, 390, 768, 1024, 1440, 1920, 2560]) {
      await page.setViewportSize({ width, height: 1000 });
      await page.goto(base);
      await assertFullWidth();
      await page.locator('.fit-hero-athlete').evaluate((image) => image.decode());
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
      assert.ok(overflow <= 1, `Landing overflows at ${width}px by ${overflow}px`);
      assert.equal(await page.locator('img').evaluateAll((images) => images.filter((image) => image.complete && image.naturalWidth === 0).length), 0);
      if (width === 390 || width === 1440) {
        const name = width === 390 ? 'mobile' : 'desktop';
        await page.screenshot({ path: path.join(output, `landing-${name}.png`), fullPage: true });
        await page.locator('.fit-services').screenshot({ path: path.join(output, `services-${name}.png`) });
        await page.evaluate(() => scrollTo(0, 0));
        await page.screenshot({ path: path.join(output, `hero-${name}.png`) });
      }
      if (width === 390) {
        await page.getByRole('button', { name: 'Mở menu' }).click();
        assert.equal(await page.getByRole('button', { name: 'Đóng menu' }).getAttribute('aria-expanded'), 'true');
        await page.locator('.fit-nav').getByRole('link', { name: 'Gói tập' }).click();
        assert.equal(await page.getByRole('button', { name: 'Mở menu' }).getAttribute('aria-expanded'), 'false');
      }
      if (width === 1920) await page.screenshot({ path: path.join(output, 'hero-wide.png') });
    }
    check('landing: eight viewport widths, full-width canvas, scrollbar palette, local images and mobile menu');

    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(`${base}/login`);
    await page.screenshot({ path: path.join(output, 'login-desktop.png'), fullPage: true });
    await page.locator('#login-identifier').fill('review_member');
    await page.locator('#login-password').fill('test-password');
    await page.getByRole('button', { name: 'Hiện mật khẩu' }).click();
    assert.equal(await page.locator('#login-password').getAttribute('type'), 'text');
    await page.route('**/api/v1/auth/login', (route) => route.fulfill({ status: 401, json: { message: 'Thông tin đăng nhập chưa đúng.' } }));
    await page.locator('button[type="submit"]').click();
    await page.getByRole('alert').filter({ hasText: 'Thông tin đăng nhập chưa đúng.' }).waitFor();
    await page.screenshot({ path: path.join(output, 'login-error-desktop.png'), fullPage: true });
    check('login password toggle and API error feedback');

    for (const width of [390, 768, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      for (const route of ['login', 'register']) {
        await page.goto(`${base}/${route}`);
        await assertFullWidth();
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
        assert.ok(overflow <= 1, `${route} overflows at ${width}px`);
        if (width !== 768) await page.screenshot({ path: path.join(output, `${route}-${width === 390 ? 'mobile' : 'desktop'}.png`), fullPage: true });
      }
    }
    check('login and registration: mobile, tablet and desktop layouts');

    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(`${base}/register`);
    let createPayload;
    let verifyPayload;
    await page.route('**/api/v1/auth/register', async (route) => {
      createPayload = route.request().postDataJSON();
      await route.fulfill({ json: { success: true, data: {} } });
    });
    await page.route('**/api/v1/auth/send-otp', (route) => route.fulfill({ json: { success: true, data: {} } }));
    await page.route('**/api/v1/auth/verify-otp', async (route) => {
      verifyPayload = route.request().postDataJSON();
      await route.fulfill({ status: 400, json: { message: 'Mã OTP không đúng hoặc đã hết hạn.' } });
    });
    await page.locator('#reg-username').fill('review_member');
    await page.locator('#reg-email').fill('review@example.com');
    await page.locator('#reg-password').fill('test-password');
    await page.getByRole('button', { name: 'TIẾP TỤC XÁC THỰC' }).click();
    await page.getByRole('heading', { name: 'Xác thực OTP' }).waitFor();
    assert.equal(createPayload.username, 'review_member');
    assert.equal(createPayload.email, 'review@example.com');
    assert.equal(await page.getByRole('button', { name: /Gửi lại mã sau/ }).isDisabled(), true);
    await page.screenshot({ path: path.join(output, 'otp-desktop.png'), fullPage: true });
    await page.setViewportSize({ width: 390, height: 1000 });
    await page.screenshot({ path: path.join(output, 'otp-mobile.png'), fullPage: true });
    await page.locator('#otp-code').fill('123456');
    await page.getByRole('button', { name: 'XÁC THỰC & HOÀN TẤT' }).click();
    await page.getByRole('alert').filter({ hasText: 'Mã OTP không đúng' }).waitFor();
    assert.deepEqual(verifyPayload, { target: 'review@example.com', otpCode: '123456' });
    check('registration → OTP, resend cooldown and invalid OTP feedback (mocked API)');

    await page.evaluate(() => localStorage.setItem('fitcenter_auth_session', JSON.stringify({ id: 'review', identifier: 'review', name: 'Review Member', role: 'MEMBER' })));
    await page.goto(base);
    assert.equal(await page.locator('.fit-hero-action a').getAttribute('href'), '/member/packages');
    await page.locator('.fit-muscle-zone[data-muscle="chest"] path').first().hover({ force: true });
    assert.equal(await page.locator('.fit-muscle-cta').getAttribute('href'), '/member/packages');
    assert.equal(await page.locator('.fit-plan a').first().getAttribute('href'), '/member/packages?packageId=1');
    assert.equal(await page.locator('.fit-header-cta').getAttribute('href'), '/member/dashboard');
    await page.evaluate(() => localStorage.removeItem('fitcenter_auth_session'));
    check('signed-in member CTAs lead to existing portal routes');

    const restoredScheme = await page.locator('.fit-site').evaluate((site) => {
      site.classList.remove('fit-site');
      const scheme = getComputedStyle(document.documentElement).colorScheme;
      site.classList.add('fit-site');
      return scheme;
    });
    assert.equal(restoredScheme, 'light', 'Public theme must not persist outside public pages');
    check('public document theme stops applying outside the public layout');

    assert.deepEqual(errors, [], 'Browser must have no unhandled JavaScript errors');
    check('no uncaught browser errors');
    fs.writeFileSync(path.join(output, 'browser-verification.json'), JSON.stringify({ status: 'passed', widths: [320, 375, 390, 768, 1024, 1440, 1920, 2560], fullWidth: true, publicScrollbar: 'salmon on charcoal', auth: 'mocked API; no real accounts created', errors }, null, 2));
  } finally {
    await browser.close();
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
