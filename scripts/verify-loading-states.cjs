// NODE_PATH supplies playwright-core. PUBLIC_UI_URL selects a local production preview.
// Every API request is intercepted; no production data is read or written.
const assert = require('node:assert/strict');
const { chromium } = require('playwright-core');
const catalog = require('./public-catalog-fixture.cjs');
const base = (process.env.PUBLIC_UI_URL || 'http://127.0.0.1:5173').replace(/\/$/, '');

function hold() {
  let release, requested;
  const response = new Promise(resolve => { release = resolve; });
  const started = new Promise(resolve => { requested = resolve; });
  return { release, started, wait() { requested(); return response; } };
}

(async () => {
  const browser = await chromium.launch({ headless: true, ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}) });
  const errors = [], unexpected = [];
  try {
    for (const theme of ['light', 'dark']) for (const width of [390, 1440]) {
      const context = await browser.newContext({ viewport: { width, height: 900 }, serviceWorkers: 'block', reducedMotion: width === 390 ? 'reduce' : 'no-preference' });
      const page = await context.newPage();
      page.setDefaultTimeout(10000);
      page.on('pageerror', error => errors.push(error.message));
      await page.addInitScript(theme => localStorage.setItem('scms_theme', theme), theme);
      const entry = hold(), invoicesModule = hold(), hero = hold(), payments = hold();
      let publicCatalog = hold(), loginModule = hold();
      const gates = [entry, loginModule, invoicesModule, hero, payments, publicCatalog];
      await context.route('**/*', async route => {
        const request = route.request(), url = new URL(request.url()), path = url.pathname;
        if (path.startsWith('/api/v1/')) {
          if (request.method() !== 'GET') {
            unexpected.push(`${request.method()} ${path}`);
            return route.abort();
          }
          if (path === '/api/v1/public/catalog') {
            const reply = await publicCatalog.wait();
            return route.fulfill(reply || { json: { data: catalog } });
          }
          if (path === '/api/v1/payments/my') {
            await payments.wait();
            return route.fulfill({ json: { data: [{ id: 31, memberId: 1, memberName: 'Loading Review', subscriptionId: 1, classEnrollmentId: null, amount: 299000, method: 'cash', status: 'success', paidAt: new Date().toISOString(), receivedById: 3, receivedByName: 'Lễ tân', note: null, createdAt: new Date().toISOString() }] } });
          }
          const fixtures = { '/api/v1/notifications/unread-count': { count: 0 }, '/api/v1/memberships/subscriptions/my': null, '/api/v1/classes/enrollments/my': [] };
          if (Object.hasOwn(fixtures, path)) return route.fulfill({ json: { data: fixtures[path] } });
          unexpected.push(`${request.method()} ${path}`);
          return route.fulfill({ status: 503, json: { message: 'Missing loading verification fixture.' } });
        }
        if (url.origin !== new URL(base).origin) return route.fulfill({ body: '', contentType: request.resourceType() === 'stylesheet' ? 'text/css' : 'text/javascript' });
        if (request.resourceType() === 'script') {
          if (/\/assets\/index-[^/]+\.js$|\/src\/main\.tsx$/.test(path)) await entry.wait();
          if (/\/LoginPage[^/]*\.(?:js|tsx)$/.test(path)) await loginModule.wait();
          if (/\/MemberInvoicesPage[^/]*\.(?:js|tsx)$/.test(path)) await invoicesModule.wait();
        }
        if (path === '/images/fitness/hero-athlete.png') await hero.wait();
        return route.continue();
      });
      try {
        const visit = page.goto(base, { waitUntil: 'domcontentloaded' });
        await entry.started;
        await page.locator('.boot-loading').waitFor();
        const boot = await page.locator('.boot-loading').evaluate(el => {
          const box = el.getBoundingClientRect();
          return { left: box.left, right: box.right, width: innerWidth, height: box.height, viewportHeight: innerHeight, background: getComputedStyle(el).backgroundColor };
        });
        assert.equal(boot.left, 0, 'boot skeleton reaches the left edge before JavaScript');
        assert.equal(boot.right, boot.width, 'boot skeleton reaches the right edge before JavaScript');
        assert.ok(boot.height >= boot.viewportHeight);
        assert.equal(boot.background, theme === 'dark' ? 'rgb(32, 32, 32)' : 'rgb(245, 245, 243)');
        entry.release();
        await visit;
        await publicCatalog.started;
        const skeleton = page.locator('.fit-catalog-skeleton--packages');
        await skeleton.waitFor();
        assert.equal(await page.locator('.fit-plan').count(), 0, 'no invented package cards while catalog is pending');
        assert.equal(await skeleton.getAttribute('aria-busy'), 'true');
        const placeholder = await skeleton.locator('.loading-skeleton__line').first().evaluate(el => ({ background: getComputedStyle(el).backgroundColor, animation: getComputedStyle(el).animationName }));
        assert.equal(placeholder.background, theme === 'dark' ? 'rgb(48, 48, 48)' : 'rgb(238, 239, 236)');
        assert.equal(placeholder.animation, 'none', 'static placeholders respect reduced motion');
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'loading page does not overflow horizontally');
        await hero.started;
        const image = page.locator('img.fit-hero-athlete');
        assert.equal(await image.getAttribute('aria-busy'), 'true');
        assert.notEqual(await image.evaluate(el => getComputedStyle(el).backgroundColor), 'rgba(0, 0, 0, 0)', 'pending hero image has a placeholder');
        hero.release();
        await page.waitForFunction(() => document.querySelector('img.fit-hero-athlete')?.getAttribute('aria-busy') === 'false');
        assert.equal(await image.evaluate(el => el.naturalWidth > 0), true);

        publicCatalog.release({ status: 503, json: { message: 'Verification error.' } });
        const error = page.locator('.fit-catalog-state[role="alert"]').last();
        await error.waitFor();
        publicCatalog = hold(); gates.push(publicCatalog);
        await error.getByRole('button', { name: 'Thử lại' }).click();
        await publicCatalog.started;
        await skeleton.waitFor();
        assert.equal(await page.locator('.fit-catalog-state[role="alert"]').count(), 0, 'retry replaces the previous error with loading');
        const catalogStart = Date.now();
        publicCatalog.release({ json: { data: catalog } });
        await page.locator('.fit-plan').first().waitFor({ state: 'attached', timeout: 1000 });
        const catalogMs = Date.now() - catalogStart;
        assert.equal(await page.locator('.fit-plan').count(), 3);
        assert.equal(await skeleton.count(), 0, 'resolved catalog immediately replaces its skeleton');

        await page.locator('.fit-header-cta').click();
        await loginModule.started;
        await page.locator('.route-navigation-loading .loading-skeleton').waitFor();
        assert.equal(await page.locator('.route-content').getAttribute('aria-hidden'), 'true');
        assert.equal(await page.locator('.route-content').evaluate(el => el.inert), true);
        loginModule.release();
        await page.locator('.fit-auth-form').waitFor();
        assert.equal(await page.locator('.route-navigation-loading').count(), 0);

        await page.evaluate(() => {
          localStorage.setItem('fitcenter_auth_session', JSON.stringify({ id: '1', identifier: 'review', name: 'Loading Review', role: 'MEMBER' }));
          localStorage.setItem('fitcenter_token', 'review-only');
        });
        await page.goto(`${base}/member/dashboard`, { waitUntil: 'domcontentloaded' });
        await page.locator('.member-board').waitFor();
        if (width < 768) {
          await page.getByRole('button', { name: 'Thêm màn hình' }).click();
          await page.locator('.portal-screen-results a[href="/member/invoices"]').click();
        } else await page.locator('.portal-rail-nav a[href="/member/invoices"]').click();
        await invoicesModule.started;
        await page.locator('#portal-main .portal-route-loading').waitFor();
        assert.equal(await page.locator(width < 768 ? '.portal-mobile-nav' : '.app-sidebar').isVisible(), true, 'portal navigation stays visible during route loading');
        assert.equal(await page.locator('.route-navigation-loading').count(), 0, 'portal loading stays within the shell');
        assert.equal(await page.locator('#portal-main .route-fade').getAttribute('hidden'), '');
        invoicesModule.release();
        await payments.started;
        await page.locator('.member-invoices .loading-skeleton--table').waitFor();
        assert.equal(await page.getByText('Chưa có giao dịch thanh toán thành công.', { exact: true }).count(), 0, 'pending invoices never claim an empty result');
        assert.equal(await page.locator('.member-invoices__table tbody tr').count(), 0);
        const paymentsStart = Date.now();
        payments.release();
        await page.locator('.member-invoices__table tbody tr').waitFor({ timeout: 1000 });
        const paymentsMs = Date.now() - paymentsStart;
        assert.equal(await page.locator('.member-invoices .loading-skeleton').count(), 0);
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'portal loading does not overflow horizontally');
        loginModule = hold(); gates.push(loginModule);
        if (width < 768) {
          await page.getByRole('button', { name: 'Thêm màn hình' }).click();
          await page.locator('.portal-menu-logout').click();
        } else await page.locator('.portal-rail-footer button[aria-label="Đăng xuất"]').click();
        await page.locator('dialog[open]').getByRole('button', { name: 'Đăng xuất', exact: true }).click();
        await loginModule.started;
        await page.locator('.route-navigation-loading .loading-skeleton').waitFor();
        assert.equal(await page.evaluate(() => localStorage.getItem('fitcenter_auth_session')), null, 'logout clears the session while login is loading');
        loginModule.release();
        await page.locator('.fit-auth-form').waitFor();
        assert.equal(await page.locator('.route-navigation-loading').count(), 0);
        console.log(`PASS ${theme} ${width}px${width < 768 ? ' reduced-motion' : ''}: boot, catalog retry ${catalogMs}ms, image, public route, portal shell, invoice ${paymentsMs}ms and delayed logout`);
      } finally {
        gates.forEach(gate => gate.release());
        await context.close();
      }
    }
    assert.deepEqual(unexpected, [], 'unexpected or mutating API requests');
    assert.deepEqual(errors, [], 'browser runtime errors');
    console.log('PASS loading verification: 4 theme/viewport cases, all API traffic intercepted, no artificial waits');
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
