// QA only: intercept every API request; never read/write a shared database.
// NODE_PATH supplies playwright-core; CHROME_PATH selects installed Chromium.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { chromium } = require('playwright-core');
const base = process.env.PUBLIC_UI_URL || 'http://127.0.0.1:5179';
const output = process.env.SCHEDULE_QA_OUTPUT || 'docs/qa/member-schedule-reservation';
const addDays = (date, days) => { const d = new Date(date + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + days); return d.toISOString().slice(0, 10); };
const sample = (id, name, discipline, date) => ({ id, classId: id, className: name, disciplineId: id, disciplineName: discipline, coachId: 4, coachName: 'An', roomId: 5, roomName: 'Studio', sessionDate: date, startTime: '18:00:00', endTime: '19:00:00', status: 'scheduled', cancelReason: null, capacity: 12, bookedCount: 2 });
(async () => {
  fs.mkdirSync(output, { recursive: true });
  const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
  const errors = [], requests = [], posts = [], checks = [];
  const context = await browser.newContext({ timezoneId: 'America/Los_Angeles', serviceWorkers: 'block', reducedMotion: 'reduce' });
  const page = await context.newPage();
  page.setDefaultTimeout(12000);
  page.on('pageerror', error => errors.push(error.message));
  await page.clock.setFixedTime(new Date('2026-11-04T02:00:00Z'));
  await page.addInitScript(() => {
    localStorage.setItem('fitcenter_auth_session', JSON.stringify({ id: '1', identifier: 'qa', name: 'Schedule QA', role: 'MEMBER' }));
    localStorage.setItem('fitcenter_token', 'local-qa-fixture');
    localStorage.setItem('scms_theme', new URL(location.href).searchParams.get('qaTheme') || 'light');
  });
  let mode = 'success', releaseLoad, releaseBook, failBook = false, showCancelFixtures = false;
  const cancellationRequests = [];
  const sports = [['Gym', 'Gym sáng'], ['Bơi lội', 'Bơi chiều'], ['Boxing', 'Boxing UI'], ['Tennis', 'Tennis UI'], ['Cầu lông', 'Cầu lông UI'], ['Yoga', 'Yoga UI']];
  const seats = [41, 42].map((id, i) => ({ id, sessionId: 100 + i, classId: 100 + i, className: 'Buổi hủy QA ' + id, memberId: 1, sessionDate: '2026-11-07', startTime: i ? '10:00:00' : '08:00:00', endTime: i ? '11:00:00' : '09:00:00', roomName: 'Studio', coachName: 'An', status: 'booked', bookedAt: '2026-11-01T08:00:00', cancelledAt: null, cancelReason: null, batchId: null }));
  await context.route('**/*', async route => {
    const url = new URL(route.request().url()), path = url.pathname;
    if (path.startsWith('/api/')) {
      requests.push(path + url.search);
      let data = [];
      if (path.endsWith('/classes/sessions')) {
        if (mode === 'loading') await new Promise(resolve => { releaseLoad = resolve; });
        if (mode === 'error') return route.fulfill({ status: 503, json: { message: 'Không thể tải lịch học.' } });
        const date = addDays(url.searchParams.get('fromDate'), 4);
        data = mode === 'empty' ? [] : sports.map(([discipline, name], i) => sample(8 + i, name, discipline, date));
      } else if (/\/sessions\/\d+\/bookings$/.test(path)) {
        posts.push({ path, method: route.request().method() });
        if (releaseBook === null) await new Promise(resolve => { releaseBook = resolve; });
        if (failBook) return route.fulfill({ status: 409, json: { code: 'SCHEDULING_SESSION_FULL', message: 'Buổi học đã đầy chỗ.' } });
        data = {};
      } else if (path.endsWith('/session-bookings/cancel')) {
        cancellationRequests.push(JSON.parse(route.request().postData()));
        data = { cancelled: seats, skipped: [] };
      } else if (/\/session-bookings\/\d+$/.test(path) && route.request().method() === 'DELETE') {
        cancellationRequests.push({ single: path });
        data = seats[0];
      } else if (path.endsWith('/session-bookings/my')) data = showCancelFixtures ? seats : [];
      else if (path.endsWith('/auth/me')) data = { username: 'qa', role: 'MEMBER' };
      else if (path.endsWith('/subscriptions/my')) data = null;
      else if (path.endsWith('/unread-count')) data = { count: 0 };
      assert.ok(!path.includes('favorite') && !path.endsWith('/bulk'), 'removed API called: ' + path);
      return route.fulfill({ json: { success: true, data } });
    }
    if (url.origin !== new URL(base).origin) return route.fulfill({ body: '', contentType: route.request().resourceType() === 'stylesheet' ? 'text/css' : 'text/javascript' });
    return route.continue();
  });
  try {
    for (const theme of ['light', 'dark']) for (const width of [320, 390, 768, 1024, 1440, 1920, 2560]) {
      await page.setViewportSize({ width, height: 1000 });
      await page.goto(base + '/member/classes?tab=list&week=month&discipline=Gym&qaTheme=' + theme);
      const plus = page.locator('.member-class-enroll').first(); await plus.waitFor();
      assert.equal(new URL(page.url()).searchParams.get('week'), '0');
      assert.equal(await page.getByRole('button', { name: 'Tuần trước', exact: true }).count(), 1);
      assert.equal(await page.getByRole('button', { name: 'Tuần này', exact: true }).count(), 1);
      assert.equal(await page.getByRole('button', { name: 'Tuần kế tiếp', exact: true }).count(), 1);
      assert.equal(await page.locator('.btn-favorite-star, .member-class-select').count(), 0);
      assert.equal(await page.getByText('Đặt nhiều buổi', { exact: true }).count(), 0);
      assert.equal(await page.getByText('30 ngày tới', { exact: true }).count(), 0);
      const geometry = await plus.evaluate(el => {
        const b = el.getBoundingClientRect(), svg = el.querySelector('svg'), s = svg.getBoundingClientRect();
        const path = svg.querySelector('path'), box = path.getBBox(), matrix = path.getScreenCTM();
        const center = new DOMPoint(box.x + box.width / 2, box.y + box.height / 2).matrixTransform(matrix);
        return { w: b.width, h: b.height, dx: Math.abs(b.x + b.width / 2 - s.x - s.width / 2), dy: Math.abs(b.y + b.height / 2 - s.y - s.height / 2), pathDx: Math.abs(center.x - b.x - b.width / 2), pathDy: Math.abs(center.y - b.y - b.height / 2) };
      });
      assert.equal(geometry.w, 52); assert.equal(geometry.h, 52);
      assert.ok(geometry.dx < 1 && geometry.dy < 1 && geometry.pathDx < 1 && geometry.pathDy < 1, JSON.stringify(geometry));
      await plus.hover();
      const hover = await plus.evaluate(el => { const b = el.getBoundingClientRect(), s = el.querySelector('svg').getBoundingClientRect(); return { dx: s.x + s.width / 2 - b.x - b.width / 2, dy: s.y + s.height / 2 - b.y - b.height / 2 }; });
      assert.ok(Math.abs(hover.dx) < 1 && Math.abs(hover.dy) < 1);
      await page.mouse.move(0, 0);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'horizontal overflow ' + width);
      if (theme === 'dark' && [390, 1440].includes(width)) {
        await plus.scrollIntoViewIfNeeded();
        await page.screenshot({ path: output + '/schedule-' + width + '.png', fullPage: width !== 390 });
      }
      checks.push({ theme, width, ...geometry, status: 'PASS' });
    }
    const sport = page.getByRole('group', { name: 'Lọc theo bộ môn', exact: true });
    for (const [discipline, name] of sports) {
      await sport.getByRole('button', { name: discipline, exact: true }).click();
      await page.getByRole('heading', { name, exact: true }).waitFor();
      assert.equal(await page.locator('.member-class-session').count(), 1);
    }
    await sport.getByRole('button', { name: 'Tất cả bộ môn', exact: true }).click();
    assert.equal(await page.locator('.member-class-session').count(), sports.length);
    await sport.getByRole('button', { name: 'Bơi lội', exact: true }).click();
    await page.getByRole('heading', { name: 'Bơi chiều', exact: true }).waitFor();
    assert.equal(await page.getByRole('heading', { name: 'Gym sáng', exact: true }).count(), 0);
    await page.getByRole('button', { name: 'Tuần trước', exact: true }).click();
    await page.locator('.tt__range').filter({ hasText: '26/10' }).waitFor();
    await page.getByRole('button', { name: 'Tuần kế tiếp', exact: true }).click();
    await page.locator('.tt__range').filter({ hasText: '09/11' }).waitFor();
    await page.getByRole('button', { name: 'Tuần này', exact: true }).click();
    await page.locator('.tt__range').filter({ hasText: '02/11' }).waitFor();
    assert.ok(requests.includes('/api/v1/classes/sessions?fromDate=2026-10-26&toDate=2026-11-01'));
    assert.ok(requests.includes('/api/v1/classes/sessions?fromDate=2026-11-09&toDate=2026-11-15'));
    releaseBook = null;
    await page.locator('.member-class-enroll').click();
    await page.locator('.member-class-enroll:disabled').waitFor();
    const pending = await page.locator('.member-class-enroll').evaluate(el => { const b = el.getBoundingClientRect(), s = el.querySelector('svg').getBoundingClientRect(); return { disabled: el.disabled, w: b.width, h: b.height, dx: s.x + s.width / 2 - b.x - b.width / 2, dy: s.y + s.height / 2 - b.y - b.height / 2 }; });
    assert.ok(pending.disabled && pending.w === 52 && pending.h === 52 && Math.abs(pending.dx) < 1 && Math.abs(pending.dy) < 1);
    await page.locator('.member-class-enroll').screenshot({ path: output + '/button-pending.png' });
    assert.equal(posts.length, 1); assert.ok(posts[0].path.endsWith('/sessions/9/bookings'));
    releaseBook();
    await page.getByText(/Đã đặt chỗ lớp.*thành công/).first().waitFor();
    failBook = true;
    await page.locator('.member-class-enroll').click();
    await page.getByText('Buổi học đã đầy chỗ. Hãy chọn buổi khác.', { exact: true }).waitFor();
    mode = 'loading';
    await page.reload();
    await page.getByText('Đang tải lịch học...', { exact: true }).waitFor({ state: 'attached' });
    mode = 'empty'; releaseLoad();
    await page.getByRole('heading', { name: 'Chưa có lịch học', exact: true }).waitFor();
    mode = 'error'; await page.reload();
    await page.getByRole('heading', { name: 'Không tải được lịch học', exact: true }).waitFor();
    mode = 'success'; await page.getByRole('button', { name: 'Thử lại', exact: true }).click();
    await page.locator('.member-class-enroll').first().waitFor();
    showCancelFixtures = true;
    await page.goto(base + '/member/classes?tab=my');
    await page.getByRole('button', { name: 'Hủy buổi này', exact: true }).first().click();
    assert.equal(cancellationRequests.length, 0);
    await page.getByRole('button', { name: 'Xác nhận hủy', exact: true }).click();
    await page.getByText('Đã hủy chỗ buổi học "Buổi hủy QA 41".', { exact: true }).first().waitFor();
    assert.deepEqual(cancellationRequests[0], { single: '/api/v1/classes/session-bookings/41' });
    await page.getByRole('group', { name: 'Hủy nhiều buổi', exact: true }).getByRole('button', { name: 'Chọn tất cả', exact: true }).click();
    await page.getByRole('button', { name: 'Hủy 2 buổi', exact: true }).click();
    assert.equal(cancellationRequests.length, 1);
    await page.getByRole('dialog').getByRole('button', { name: 'Xác nhận hủy', exact: true }).click();
    await page.getByRole('heading', { name: 'Kết quả hủy nhiều buổi', exact: true }).waitFor();
    assert.deepEqual(cancellationRequests[1], { bookingIds: [41, 42] });
    await page.screenshot({ path: output + '/multi-cancel-ui.png', fullPage: true });
    assert.deepEqual(errors, []);
    fs.writeFileSync(output + '/browser-results.json', JSON.stringify({ status: 'PASS', timezone: 'America/Los_Angeles', fixedInstant: '2026-11-04T02:00:00Z', checks, flows: ['legacy URL -> this week', 'discipline filtering', 'three center calendar weeks', 'single booking pending/success/full (intercepted, not backend E2E)', 'single and bulk cancel confirmation (intercepted)', 'all six supported sport filters and reset', 'hover and disabled geometry', 'loading/empty/error/retry'], sharedDatabaseAccess: false, apiDbE2E: 'NOT RUN', baseUrl: base, dataMode: 'isolated browser fixtures; no backend booking claim' }, null, 2) + '\n');
    console.log('PASS: light/dark at seven widths, centered plus, three center calendar weeks, sport filters, removed controls, single booking, loading/empty/error/retry; single/bulk cancellation UI; isolated fixtures only; API/DB E2E NOT RUN');
  } catch (error) { console.error(await page.locator('body').innerText()); await page.screenshot({ path: output + '/failure.png', fullPage: true }); throw error; } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
