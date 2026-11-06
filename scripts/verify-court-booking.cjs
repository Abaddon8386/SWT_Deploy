// Browser verification uses intercepted API fixtures; it never writes to a database.
// NODE_PATH supplies the existing playwright-core installation. CHROME_PATH is optional.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { chromium } = require('playwright-core');

const date = new Date(Date.now() + 86400000).toLocaleDateString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' });
const court = { id: 1, name: 'Sân Tennis A', location: 'Khu A', disciplineId: 4, disciplineName: 'Tennis', openTime: '06:00:00', closeTime: '22:00:00' };
const slots = [
  { startTime: '10:00:00', endTime: '11:00:00', status: 'free' },
  { startTime: '11:00:00', endTime: '12:00:00', status: 'class' },
  { startTime: '12:00:00', endTime: '13:00:00', status: 'booked' },
];
const booking = { id: 1, roomId: 1, roomName: court.name, disciplineName: 'Tennis', memberId: 1, memberName: 'Hội viên kiểm thử', date, startTime: '10:00:00', endTime: '11:00:00', status: 'booked', createdAt: new Date().toISOString(), cancelledAt: null, cancelReason: null, canCancel: true };

(async () => {
  const browser = await chromium.launch({ headless: true, ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}) });
  const output = process.env.COURTS_REVIEW_OUTPUT || '.tmp/court-booking-review';
  fs.mkdirSync(output, { recursive: true });
  const base = process.env.PUBLIC_UI_URL || 'http://127.0.0.1:5173';
  const errors = [];
  try {
    for (const width of [390, 1440]) {
      // The current router assigns these pages to members and receptionists.
      for (const role of ['MEMBER', 'STAFF']) {
        const page = await browser.newPage({ viewport: { width, height: 1000 }, reducedMotion: 'reduce' });
        page.on('pageerror', error => errors.push(error.message));
        await page.addInitScript(role => {
          localStorage.setItem('scms_theme', 'dark');
          localStorage.setItem('fitcenter_auth_session', JSON.stringify({ id: '1', identifier: 'review', name: 'Kiểm thử', role }));
          localStorage.setItem('fitcenter_token', 'fixture-only');
        }, role);
        let booked = role !== 'MEMBER';
        const writes = [];
        await page.route('**/api/v1/**', async route => {
          const req = route.request();
          const url = new URL(req.url());
          const path = url.pathname.replace(/^\/api\/v1/, '');
          let data = [];
          if (path === '/auth/me') data = { username: 'review', role: role === 'STAFF' ? 'RECEPTIONIST' : role };
          else if (path === '/courts') data = url.searchParams.get('discipline') === 'Tennis' ? [court] : [];
          else if (path === '/court-bookings/quota') data = { packageName: 'GOLD', monthlyQuota: 3, used: booked ? 1 : 0, remaining: booked ? 2 : 3 };
          else if (path === '/rooms') data = [{ ...court, capacity: 2, status: 'available' }];
          else if (path === '/courts/1/availability') data = slots.map(slot => ({ ...slot, status: booked && slot.startTime === '10:00:00' ? 'booked' : slot.status }));
          else if (path === '/court-bookings' && req.method() === 'POST') {
            const body = req.postDataJSON();
            assert.equal(body.roomId, 1);
            assert.equal(body.startTime.slice(0, 5), '10:00');
            writes.push('book'); booked = true; data = { ...booking, date: body.date };
          } else if (path === '/court-bookings/1/cancel') {
            writes.push('cancel'); booked = false; data = { ...booking, status: 'cancelled', canCancel: false };
          } else if (path === '/court-bookings/my' || path === '/court-bookings') data = { content: booked ? [booking] : [], number: 0, size: 20, totalPages: booked ? 1 : 0, totalElements: booked ? 1 : 0, first: true, last: true };
          else if (path === '/notifications/unread-count') data = { count: 0 };
          else if (path === '/profile') data = { userId: 1, fullName: 'Kiểm thử' };
          else if (path === '/chat/realtime-session' || path.endsWith('/realtime-session')) data = { enabled: false };
          await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data }) });
        });
        await page.goto(`${base}${role === 'MEMBER' ? '/member/courts?discipline=Tennis' : '/staff/courts'}`);
        await page.locator('.portal-v2').waitFor();
        await page.getByRole('heading', { name: court.name, exact: true }).first().waitFor();
        await page.waitForLoadState('networkidle');
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth), false, `Horizontal overflow: ${role} ${width}`);
        if (role === 'MEMBER') {
          const refresh = await page.getByRole('button', { name: 'Làm mới lịch sân', exact: true }).boundingBox();
          assert.ok(refresh && refresh.width >= 44 && refresh.height >= 44, `Refresh target below 44px at ${width}px`);
        }
        await page.screenshot({ path: `${output}/${role.toLowerCase()}-${width}.png`, fullPage: true });
        if (role === 'MEMBER') {
          await page.getByLabel('Ngày đặt', { exact: true }).fill(date);
          await page.getByRole('button', { name: /Sân Tennis A, 10:00.*Trống/ }).click();
          await page.getByRole('button', { name: 'Xác nhận đặt', exact: true }).click();
          await page.getByRole('button', { name: /^Hủy lượt đặt Sân Tennis A/ }).waitFor();
          assert.deepEqual(writes, ['book']);
        }
        await page.getByRole('button', { name: /^Hủy lượt đặt Sân Tennis A/ }).click();
        await page.getByRole('button', { name: 'Xác nhận hủy', exact: true }).click();
        await page.getByText(role === 'MEMBER' ? 'Bạn chưa có lượt đặt sân nào' : 'Chưa có lượt đặt trong ngày này', { exact: true }).waitFor();
        assert.equal(writes.at(-1), 'cancel');
        console.log(`PASS ${role} courts at ${width}px`);
        await page.close();
      }
    }
    assert.deepEqual(errors, [], 'Browser runtime errors');
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
