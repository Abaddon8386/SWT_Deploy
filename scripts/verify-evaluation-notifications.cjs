// Mocked browser regression: notification click opens persisted coach feedback.
const assert = require('node:assert/strict');
const { chromium } = require('playwright-core');
(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_PATH });
  const page = await browser.newPage({ reducedMotion: 'reduce' });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => {
    localStorage.setItem('fitcenter_auth_session', JSON.stringify({ id: '1', identifier: 'review', name: 'Học viên', role: 'MEMBER' }));
    localStorage.setItem('fitcenter_token', 'mock-only');
  });
  let reads = 0;
  await page.route('**/api/v1/**', route => {
    const path = new URL(route.request().url()).pathname.replace('/api/v1', '');
    let data = [];
    if (path === '/auth/me') data = { username: 'review', role: 'MEMBER' };
    if (path.endsWith('/unread-count')) data = { count: 1 };
    if (path === '/notifications') data = { content: [{ id: 1, title: 'Đánh giá tiến độ mới', message: 'Mở để xem nhận xét', type: 'system', actionPath: '/member/progress#coach-evaluations', relatedEntityType: null, relatedEntityId: null, isRead: false, createdAt: '2026-11-03T10:00:00' }], number: 0, totalPages: 1 };
    if (path === '/notifications/1/read') { reads++; data = null; }
    if (path === '/coaching/evaluations/my') data = [{ id: 1, coachId: 2, sessionId: 3, progressScore: 92, performanceNotes: 'Giữ đúng tư thế', feedback: 'Tiếp tục phát huy', evaluatedAt: '2026-11-03T10:00:00' }];
    return route.fulfill({ json: { success: true, data } });
  });
  try {
    for (const width of [390, 768, 1440, 1920, 2560]) {
      await page.setViewportSize({ width, height: 1000 });
      await page.goto((process.env.PUBLIC_UI_URL || 'http://127.0.0.1:5178') + '/member/progress');
      await page.getByText('Điểm tiến độ: 92/100').waitFor();
      await page.getByRole('button', { name: /^Thông báo ·/ }).click();
      await page.getByRole('button', { name: /Đánh giá tiến độ mới/ }).click();
      await page.waitForURL('**/member/progress#coach-evaluations');
      await page.getByText('Giữ đúng tư thế', { exact: true }).waitFor();
      assert.equal(await page.locator('#portal-notifications').count(), 0);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      console.log(`PASS evaluation notification -> feedback, no overflow at ${width}px`);
    }
    assert.equal(reads, 5);
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
