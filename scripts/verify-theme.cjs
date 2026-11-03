// Local browser verification. API requests use fixtures and never change real data.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { chromium } = require('playwright-core');
const base = process.env.PUBLIC_UI_URL || 'http://localhost:5173';
const output = 'docs/ui-review/light-theme';
const profile = { userId: 1, fullName: 'Nguyễn An', email: 'review@example.test', phone: '0901234567', membershipCode: 'MB-001', fitnessLevel: 'beginner' };
const subscription = { id: 1, memberId: 1, packageId: 1, packageName: 'The Essential', startDate: '2026-10-01', endDate: '2099-12-31', paidThroughDate: '2099-12-31', status: 'active', createdAt: '2026-10-01T00:00:00Z' };
const fixtures = {
  '/public/catalog': require('./public-catalog-fixture.cjs'), '/profile': profile,
  '/packages': [{ id: 1, name: 'The Essential', price: 500000, durationDays: 30, classCreditLimit: 12, status: 'active', description: 'Phòng tập và lớp nhóm.' }],
  '/memberships/subscriptions/my': subscription, '/memberships/subscriptions/history': [subscription],
  '/memberships/cancellations/my': [], '/payments/my': [],
  '/classes/enrollments/my': [], '/classes/sessions': [],
  '/users': [{ id: 1, fullName: profile.fullName, email: profile.email, roleCode: 'MEMBER', status: 'active' }],
  '/roles': [{ id: 1, code: 'MEMBER' }],
};

(async () => {
  fs.mkdirSync(output, { recursive: true });
  const browser = await chromium.launch({ headless: true, ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}) });
  try {
    const page = await browser.newPage({ reducedMotion: 'reduce' });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.route('**/accounts.google.com/gsi/**', route => route.fulfill({ body: '', contentType: 'text/javascript' }));
    await page.route('**/api/v1/**', route => {
      const path = new URL(route.request().url()).pathname.replace(/^\/api\/v1/, '');
      return route.fulfill({ json: { success: true, data: fixtures[path] ?? [] } });
    });
    await page.goto(base);
    assert.equal(await page.locator('html').getAttribute('data-theme'), 'light');
    await page.getByRole('button', { name: 'Bật chế độ tối', exact: true }).click();
    assert.equal(await page.locator('html').getAttribute('data-theme'), 'dark');
    await page.getByRole('button', { name: 'Bật chế độ sáng', exact: true }).click();
    assert.equal(await page.locator('html').getAttribute('data-theme'), 'light');
    await page.reload();
    assert.equal(await page.locator('html').getAttribute('data-theme'), 'light', 'theme survives reload');
    await page.locator('.fit-muscle-zone').first().focus();
    await page.locator('.fit-muscle-callout').waitFor();
    assert.equal(await page.locator('.fit-muscle-exercises').evaluate(el => getComputedStyle(el).backgroundColor), 'rgb(245, 245, 243)');
    assert.equal(await page.locator('.fit-muscle-exercises li').first().evaluate(el => getComputedStyle(el).backgroundColor), 'rgba(0, 0, 0, 0)');
    await page.locator('.fit-muscle-callout').screenshot({ path: `${output}/muscle-callout-light.png` });

    for (const width of [390, 768, 1440, 1920, 2560]) {
      await page.setViewportSize({ width, height: 1000 });
      for (const path of ['/', '/login', '/register', '/swimming', '/tennis', '/trainers/1', '/member/dashboard', '/member/packages', '/member/classes', '/manager/users']) {
        await page.evaluate(path => {
          if (path.startsWith('/member') || path.startsWith('/manager')) {
            localStorage.setItem('fitcenter_auth_session', JSON.stringify({ id: '1', identifier: 'review', name: 'Nguyễn An', role: path.startsWith('/manager') ? 'MANAGER' : 'MEMBER' }));
            localStorage.setItem('fitcenter_token', 'review-only');
          } else {
            localStorage.removeItem('fitcenter_auth_session');
            localStorage.removeItem('fitcenter_token');
          }
        }, path);
        await page.goto(`${base}${path}`);
        await page.locator('.fit-site, .portal-v2').waitFor();
        await page.waitForLoadState('networkidle');
        const result = await page.evaluate(() => {
          const root = document.querySelector('.fit-site, .portal-v2');
          const box = root.getBoundingClientRect();
          return { theme: document.documentElement.dataset.theme, background: getComputedStyle(root).backgroundColor,
            color: getComputedStyle(root).color, overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
            left: box.left, right: box.right, viewport: document.documentElement.clientWidth };
        });
        assert.equal(result.theme, 'light', path);
        assert.equal(result.background, 'rgb(245, 245, 243)', path);
        assert.equal(result.color, 'rgb(32, 32, 32)', path);
        assert.equal(result.overflow, false, `${path} at ${width}px overflows`);
        assert.equal(result.left, 0); assert.ok(Math.abs(result.right - result.viewport) < 1);
        const toggle = page.getByRole('button', { name: 'Bật chế độ tối', exact: true });
        assert.ok(await toggle.isVisible(), `${path} has a visible toggle`);
        for (const control of await page.locator('.fit-header-actions > *, .portal-topbar-actions > *').all()) {
          if (!await control.isVisible()) continue;
          const box = await control.boundingBox();
          assert.ok(box.x >= 0 && box.x + box.width <= width, `${path} header control is clipped at ${width}px`);
        }
        if ([390, 1440].includes(width) && ['/', '/login', '/member/dashboard', '/member/packages'].includes(path)) {
          await page.screenshot({ path: `${output}/${path === '/' ? 'landing' : path.slice(1).replaceAll('/', '-')}-${width}.png` });
        }
      }
      console.log(`PASS light theme on ten routes at ${width}px`);
    }
    await page.getByRole('button', { name: /Thêm tài khoản/ }).first().click();
    const dialog = page.locator('dialog[open]');
    await dialog.waitFor();
    assert.equal(await dialog.evaluate(el => getComputedStyle(el).backgroundColor), 'rgb(255, 255, 255)');
    await page.keyboard.press('Escape');
    await dialog.waitFor({ state: 'hidden' });
    const toggle = page.getByRole('button', { name: 'Bật chế độ tối', exact: true });
    await toggle.focus(); await page.keyboard.press('Enter');
    assert.equal(await page.locator('html').getAttribute('data-theme'), 'dark');
    await page.reload();
    assert.equal(await page.locator('html').getAttribute('data-theme'), 'dark');
    assert.deepEqual(errors, []);
    console.log('PASS keyboard toggle, persistence across routes/reloads, no browser errors');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
