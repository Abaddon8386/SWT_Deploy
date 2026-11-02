// Run against `npm --prefix apps/web run preview -- --host 127.0.0.1`.
// NODE_PATH supplies playwright-core. API fixtures never contact the real database.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright-core');
const QRCode = require('../apps/web/node_modules/qrcode');
const base = process.env.PWA_UI_URL || 'http://127.0.0.1:4173';
const output = process.env.PWA_REVIEW_OUTPUT || 'docs/qa/portal-pwa';
const roles = [
  ['MEMBER', '/member/dashboard', ['/member/dashboard', '/member/classes', '/member/check-in']],
  ['RECEPTIONIST', '/staff/reception', ['/staff/reception', '/staff/classes', '/staff/check-in']],
  ['COACH', '/staff/attendance', ['/coach/classes', '/staff/attendance', '/coach/training-plans']],
  ['CENTER_MANAGER', '/manager/users', ['/staff/reception', '/manager/reports', '/manager/users']],
];
const qrPayload = `SOL:GATE:1:A1:${Date.now()}:${'a'.repeat(64)}`;

async function fixtures(page) {
  const submissions = [];
  await page.route('**/api/v1/**', async route => {
    const url = new URL(route.request().url());
    const endpoint = url.pathname.replace('/api/v1', '');
    let data = [];
    if (endpoint === '/memberships/subscriptions/my') data = null;
    if (endpoint === '/notifications/unread-count') data = { count: 0 };
    if (endpoint === '/notifications') data = { content: [], number: 0, totalPages: 0 };
    if (endpoint === '/chat/realtime-session') data = { enabled: false };
    if (endpoint === '/chat/conversations') data = { content: [{ id: 7, peer: { id: 20, name: 'Coach Linh', role: 'COACH', available: true }, createdAt: new Date().toISOString(), lastActivityAt: new Date().toISOString() }], number: 0, totalPages: 1 };
    if (endpoint === '/chat/conversations/7/messages') data = { items: [], hasMore: false };
    if (endpoint === '/check-in/gate-qr') data = {
      qrCode: qrPayload, gateId: url.searchParams.get('gate') || 'A1', gate: 'Turnstile A1 - Sảnh Chính',
      generatedAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 60000).toISOString(), expiresInSeconds: 60,
    };
    if (endpoint === '/check-in/self') {
      const body = route.request().postDataJSON();
      submissions.push(body);
      assert.deepEqual(body, { gateQr: qrPayload });
      data = { id: 1, memberId: 1, memberName: 'Hội viên kiểm chứng', checkInTime: new Date().toISOString(), checkOutTime: null, method: 'qr', gate: 'Turnstile A1 - Sảnh Chính', status: 'GRANTED', denialReason: null };
    }
    await route.fulfill({ status: 200, contentType: 'application/json', headers: { 'Cache-Control': 'no-store' }, body: JSON.stringify({ success: true, data }) });
  });
  return submissions;
}

async function session(page, role, theme = 'dark') {
  await page.addInitScript(({ role, theme }) => {
    localStorage.setItem('scms_theme', theme);
    localStorage.setItem('fitcenter_token', 'browser-fixture-only');
    localStorage.setItem('fitcenter_auth_session', JSON.stringify({ id: '1', identifier: 'review', name: 'Hội viên kiểm chứng', role }));
  }, { role, theme });
}

async function layout(page, mobile) {
  const result = await page.evaluate(() => {
    const nav = document.querySelector('.portal-mobile-nav');
    const shell = document.querySelector('.portal-v2');
    const rect = shell.getBoundingClientRect();
    return {
      overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      width: rect.width, viewport: document.documentElement.clientWidth,
      navDisplay: getComputedStyle(nav).display,
      targets: [...nav.children].map(el => ({ width: el.getBoundingClientRect().width, height: el.getBoundingClientRect().height })),
      rail: getComputedStyle(document.querySelector('.app-sidebar')).display,
      columns: document.querySelector('.member-board') ? getComputedStyle(document.querySelector('.member-board')).gridTemplateColumns.split(' ').length : null,
    };
  });
  assert.equal(result.overflow, false, 'no horizontal document overflow');
  assert.ok(Math.abs(result.width - result.viewport) <= 1, 'shell fills viewport');
  if (mobile) {
    assert.notEqual(result.navDisplay, 'none');
    assert.equal(result.rail, 'none');
    assert.ok(result.targets.every(t => t.width >= 44 && t.height >= 44), 'mobile targets >=44px');
  } else {
    assert.equal(result.navDisplay, 'none');
    assert.notEqual(result.rail, 'none');
    if (page.viewportSize().width >= 1200 && result.columns !== null) assert.equal(result.columns, 4);
  }
}

(async () => {
  fs.mkdirSync(output, { recursive: true });
  const browser = await chromium.launch({ headless: true, ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}) });
  const errors = [];
  try {
    for (const [role, home, tabs] of roles) {
      const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
      const page = await context.newPage();
      page.on('pageerror', error => errors.push(error.message));
      await session(page, role); await fixtures(page);
      await page.goto(`${base}/portal`); await page.waitForURL(`**${home}`);
      await page.locator('.portal-v2').waitFor();
      const nav = page.getByRole('navigation', { name: 'Điều hướng nhanh', exact: true });
      assert.deepEqual(await nav.locator('a').evaluateAll(links => links.map(a => a.getAttribute('href'))), tabs);
      for (const width of [375, 390, 430]) {
        await page.setViewportSize({ width, height: 844 }); await layout(page, true);
      }
      await nav.getByRole('button', { name: 'Thêm màn hình' }).click();
      const menu = page.getByRole('dialog', { name: 'Không gian của bạn' }); await menu.waitFor();
      const search = menu.getByRole('searchbox');
      assert.ok(await search.evaluate(el => parseFloat(getComputedStyle(el).fontSize)) >= 16, 'mobile input prevents focus zoom');
      await menu.getByRole('button', { name: /Thêm SÖL|Cài SÖL/ }).click();
      await page.getByRole('dialog', { name: 'SÖL trên điện thoại' }).waitFor();
      await page.keyboard.press('Escape');
      await page.getByRole('dialog', { name: 'SÖL trên điện thoại' }).waitFor({ state: 'hidden' });
      assert.equal(await menu.isVisible(), true, 'closing install help keeps navigation menu open');
      await page.keyboard.press('Escape');
      assert.equal(await nav.getByRole('button', { name: 'Thêm màn hình' }).evaluate(el => el === document.activeElement), true, 'menu restores focus');
      await page.setViewportSize({ width: 390, height: 844 });
      await page.screenshot({ path: path.join(output, `${role.toLowerCase()}-390.png`), fullPage: true });
      if (role === 'MEMBER') {
        await page.getByRole('button', { name: 'Mở tin nhắn', exact: true }).click();
        await page.getByRole('button', { name: /Coach Linh/ }).click();
        const chatInput = page.getByRole('textbox', { name: 'Tin nhắn cho Coach Linh' });
        await chatInput.waitFor();
        assert.ok(await chatInput.evaluate(el => parseFloat(getComputedStyle(el).fontSize)) >= 16, 'chat input uses 16px on mobile');
        await page.getByRole('button', { name: 'Đóng cửa sổ tin nhắn' }).click();
      }
      for (const width of [844, 1440, 1920, 2560]) {
        await page.setViewportSize({ width, height: 900 }); await layout(page, false);
      }
      await page.setViewportSize({ width: 390, height: 844 });
      await page.evaluate(() => { localStorage.setItem('scms_theme', 'light'); document.documentElement.dataset.theme = 'light'; });
      await layout(page, true);
      await context.close(); console.log(`PASS ${role}: portal entry, navigation, menu, install help, responsive/theme`);
    }

    const gateContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const gatePage = await gateContext.newPage();
    gatePage.on('pageerror', e => errors.push(e.message));
    await session(gatePage, 'RECEPTIONIST'); await fixtures(gatePage);
    await gatePage.goto(`${base}/staff/check-in`);
    await gatePage.getByRole('img', { name: 'Mã QR cổng check-in', exact: true }).waitFor();
    await layout(gatePage, false);
    await gatePage.screenshot({ path: path.join(output, 'staff-gate-qr-desktop.png'), fullPage: true });
    await gatePage.setViewportSize({ width: 390, height: 844 }); await layout(gatePage, true);
    await gatePage.screenshot({ path: path.join(output, 'staff-gate-qr-mobile.png'), fullPage: true });
    await gateContext.close(); console.log('PASS staff web displays gate QR at desktop and mobile sizes');

    // Decode a real QR image from a synthetic camera stream, with the native decoder removed.
    const cameraContext = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    const cameraPage = await cameraContext.newPage();
    cameraPage.on('pageerror', e => errors.push(e.message));
    await session(cameraPage, 'MEMBER'); const submissions = await fixtures(cameraPage);
    const qrImage = await QRCode.toDataURL(qrPayload, { width: 600, margin: 4 });
    await cameraPage.addInitScript(qrImage => {
      delete window.BarcodeDetector;
      window.__cameraStops = 0;
      Object.defineProperty(navigator.mediaDevices, 'getUserMedia', { configurable: true, value: async () => {
        const image = new Image(); image.src = qrImage; await image.decode();
        const canvas = document.createElement('canvas'); canvas.width = canvas.height = 600;
        const draw = () => { const ctx = canvas.getContext('2d'); ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, 600, 600); ctx.drawImage(image, 100, 100, 400, 400); };
        draw();
        const stream = canvas.captureStream(8);
        // Keep the source alive and produce new frames for browser video pipelines.
        const timer = setInterval(draw, 125);
        for (const track of stream.getTracks()) {
          const stop = track.stop.bind(track);
          track.stop = () => { window.__cameraStops++; clearInterval(timer); stop(); };
        }
        return stream;
      } });
    }, qrImage);
    await cameraPage.goto(`${base}/member/check-in`);
    await cameraPage.getByRole('button', { name: 'Bật camera', exact: true }).click();
    await cameraPage.getByRole('heading', { name: 'Check-in thành công', exact: true }).waitFor({ timeout: 20000 });
    assert.equal(submissions.length, 1, 'one API write per decoded QR');
    assert.ok(await cameraPage.evaluate(() => window.__cameraStops) > 0, 'camera stops after scan');
    assert.equal(await cameraPage.locator('.qr-camera__preview').isVisible(), false, 'success collapses the camera preview');
    await cameraPage.getByRole('button', { name: 'Quét lại', exact: true }).waitFor();
    const secondCheckin = cameraPage.waitForResponse(response => response.url().endsWith('/check-in/self') && response.request().method() === 'POST');
    await cameraPage.getByRole('button', { name: 'Quét lại', exact: true }).click();
    await secondCheckin;
    await cameraPage.getByRole('heading', { name: 'Check-in thành công', exact: true }).waitFor();
    assert.equal(submissions.length, 2, 'an explicit retry scans once again');
    assert.ok(await cameraPage.evaluate(() => window.__cameraStops) >= 2, 'retry also releases its camera');
    await layout(cameraPage, true);
    await cameraPage.screenshot({ path: path.join(output, 'member-camera-success.png'), fullPage: true });
    await cameraContext.close(); console.log('PASS actual QR decoding with JavaScript fallback, one submit, camera cleanup');

    const offlineContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const offlinePage = await offlineContext.newPage();
    await session(offlinePage, 'MEMBER'); await fixtures(offlinePage);
    await offlinePage.goto(`${base}/portal`); await offlinePage.locator('.portal-v2').waitFor();
    const manifest = await offlinePage.evaluate(async () => (await fetch(document.querySelector('link[rel="manifest"]').href)).json());
    assert.equal(manifest.start_url, '/portal'); assert.equal(manifest.display, 'standalone'); assert.equal(manifest.scope, '/');
    assert.ok(manifest.icons.some(icon => icon.sizes === '192x192')); assert.ok(manifest.icons.some(icon => icon.sizes === '512x512'));
    await offlinePage.evaluate(() => navigator.serviceWorker.ready);
    await offlinePage.waitForFunction(() => !!navigator.serviceWorker.controller);
    await offlineContext.setOffline(true); await offlinePage.reload();
    await offlinePage.locator('.portal-v2').waitFor(); await offlinePage.getByText('Đang ngoại tuyến.', { exact: true }).waitFor();
    const cacheKeys = await offlinePage.evaluate(async () => {
      const keys = await caches.keys(); const requests = await Promise.all(keys.map(async key => (await (await caches.open(key)).keys()).map(r => r.url)));
      return requests.flat();
    });
    assert.ok(cacheKeys.length > 0); assert.ok(cacheKeys.every(url => !new URL(url).pathname.startsWith('/api/')), 'API is never cached');
    await offlineContext.setOffline(false); await offlineContext.close(); console.log('PASS manifest, production SW, offline app shell, no API cache');

    const guest = await browser.newPage(); await guest.goto(`${base}/portal`); await guest.waitForURL('**/login'); await guest.close();
    assert.deepEqual(errors, [], 'browser runtime errors'); console.log('PASS guest requires login; browser verification complete');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
