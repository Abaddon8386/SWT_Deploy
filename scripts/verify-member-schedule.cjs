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
  let mode = 'success', releaseLoad, releaseBook, failBook = false;
  await context.route('**/*', async route => {
    const url = new URL(route.request().url()), path = url.pathname;
    if (path.startsWith('/api/')) {
      requests.push(path + url.search);
      let data = [];
      if (path.endsWith('/classes/sessions')) {
        if (mode === 'loading') await new Promise(resolve => { releaseLoad = resolve; });
        if (mode === 'error') return route.fulfill({ status: 503, json: { message: 'Không thể tải lịch học.' } });
        const date = addDays(url.searchParams.get('fromDate'), 4);
        data = mode === 'empty' ? [] : [sample(8, 'Gym sáng', 'Gym', date), sample(9, 'Bơi chiều', 'Bơi lội', date)];
      } else if (/\/sessions\/\d+\/bookings$/.test(path)) {
        posts.push({ path, method: route.request().method() });
        if (releaseBook === null) await new Promise(resolve => { releaseBook = resolve; });
        if (failBook) return route.fulfill({ status: 409, json: { code: 'SCHEDULING_SESSION_FULL', message: 'Buổi học đã đầy chỗ.' } });
        data = {};
      } else if (path.endsWith('/auth/me')) data = { username: 'qa', role: 'MEMBER' };
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
        const b = el.getBoundingClientRect(), s = el.querySelector('svg').getBoundingClientRect();
        return { w: b.width, h: b.height, dx: Math.abs(b.x + b.width / 2 - s.x - s.width / 2), dy: Math.abs(b.y + b.height / 2 - s.y - s.height / 2) };
      });
      assert.equal(geometry.w, 52); assert.equal(geometry.h, 52);
      assert.ok(geometry.dx < 1 && geometry.dy < 1, JSON.stringify(geometry));
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'horizontal overflow ' + width);
      if (theme === 'dark' && [390, 1440].includes(width)) {
        await plus.scrollIntoViewIfNeeded();
        await page.screenshot({ path: output + '/schedule-' + width + '.png', fullPage: width !== 390 });
      }
      checks.push({ theme, width, ...geometry, status: 'PASS' });
    }
    const sport = page.getByRole('group', { name: 'Lọc theo bộ môn', exact: true });
    await sport.getByRole('button', { name: 'Bơi lội', exact: true }).click();
    await page.getByRole('heading', { name: 'Bơi chiều', exact: true }).waitFor();
    assert.equal(await page.getByRole('heading', { name: 'Gym sáng', exact: true }).count(), 0);
    await page.getByRole('button', { name: 'Tuần trước', exact: true }).click();
    await page.getByText('26/10/2026', { exact: true }).waitFor();
    await page.getByRole('button', { name: 'Tuần kế tiếp', exact: true }).click();
    await page.getByText('09/11/2026', { exact: true }).waitFor();
    await page.getByRole('button', { name: 'Tuần này', exact: true }).click();
    await page.getByText('02/11/2026', { exact: true }).waitFor();
    assert.ok(requests.includes('/api/v1/classes/sessions?fromDate=2026-10-26&toDate=2026-11-01'));
    assert.ok(requests.includes('/api/v1/classes/sessions?fromDate=2026-11-09&toDate=2026-11-15'));
    releaseBook = null;
    await page.locator('.member-class-enroll').click();
    await page.locator('.member-class-enroll:disabled').waitFor();
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
    assert.deepEqual(errors, []);
    fs.writeFileSync(output + '/browser-results.json', JSON.stringify({ status: 'PASS', timezone: 'America/Los_Angeles', fixedInstant: '2026-11-04T02:00:00Z', checks, flows: ['legacy URL -> this week', 'discipline filtering', 'three center calendar weeks', 'single booking pending/success/full', 'loading/empty/error/retry'], sharedDatabaseAccess: false }, null, 2) + '\n');
    console.log('PASS: light/dark at seven widths, centered plus, three center calendar weeks, sport filters, removed controls, single booking, loading/empty/error/retry; no shared DB');
  } catch (error) { console.error(await page.locator('body').innerText()); await page.screenshot({ path: output + '/failure.png', fullPage: true }); throw error; } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
