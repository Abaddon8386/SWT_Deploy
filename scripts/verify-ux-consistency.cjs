// NODE_PATH supplies playwright-core; CHROME_PATH optionally selects Chromium.
// All API traffic is intercepted. PUBLIC_UI_URL can select a production preview.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { chromium } = require('playwright-core');

const day = offset => {
  const d = new Date(); d.setDate(d.getDate() + offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const now = new Date().toISOString();
const profile = { userId: 1, fullName: 'Nguyễn An', email: 'review@example.test', phone: '0901234567', dob: '1996-06-15', gender: 'female', avatarUrl: null, address: 'Hà Nội', membershipCode: 'MB-001', healthNotes: '', fitnessGoal: 'Tăng sức bền', fitnessLevel: 'beginner', emergencyContactName: 'Nguyễn Bình', emergencyContactPhone: '0901234568' };
const pack = { id: 1, name: 'Gói tập tháng', description: 'Sử dụng phòng tập và lớp nhóm.', price: 900000, durationDays: 30, classCreditLimit: 12, status: 'active' };
const subscription = { id: 1, memberId: 1, packageId: 1, packageName: pack.name, previousSubscriptionId: null, startDate: day(-10), endDate: day(20), paidThroughDate: day(20), status: 'active', qrCode: 'review-qr', createdAt: now, holdStatus: null };
const gymClass = { id: 1, name: 'Yoga cơ bản', disciplineId: 1, disciplineName: 'Yoga', coachId: 2, coachName: 'Trần Minh', roomId: 1, roomName: 'Phòng 1', capacity: 20, level: 'beginner', description: 'Lớp Yoga cơ bản', status: 'ACTIVE' };
const session = { ...gymClass, id: 11, classId: 1, className: gymClass.name, sessionDate: day(0), startTime: '17:30:00', endTime: '18:30:00', status: 'scheduled', cancelReason: null, bookedCount: 5 };
const enrollment = { id: 21, classId: 1, className: gymClass.name, memberId: 1, sessionId: 11, sessionDate: day(0), startTime: session.startTime, endTime: session.endTime, coachName: gymClass.coachName, roomName: gymClass.roomName, status: 'booked', enrolledAt: now, createdAt: now, cancelledAt: null, cancelReason: null };
const payment = { id: 31, memberId: 1, memberName: profile.fullName, subscriptionId: 1, classEnrollmentId: null, amount: pack.price, method: 'cash', status: 'completed', paidAt: now, receivedById: 3, receivedByName: 'Lễ tân', note: null, createdAt: now, invoiceNumber: 'INV-001' };
const cancellation = { id: 41, memberId: 1, memberName: profile.fullName, subscriptionId: 1, packageName: pack.name, reason: 'Thay đổi lịch làm việc', status: 'PENDING', requestedAt: now, resolvedById: null, resolvedAt: null, resolutionNote: null };
const fixtures = {
  '/profile': profile, '/packages': [pack],
  '/classes/session-bookings/my': [],
  '/chat/realtime-session': { enabled: false, userId: 1 }, '/chat/unread-count': { count: 0 },
  '/wallet/my': { balance: 0, updatedAt: now, transactions: [] },
  '/memberships/trial/status': { eligible: false, alreadyClaimed: true, cccd: null, fullName: null, redeemedAt: null, subscriptionId: 1 },
  '/reception/trials': [],
  '/court-bookings/my': { content: [], number: 0, totalPages: 0, totalElements: 0 },
  '/coach-bookings/unpaid': [],
  '/staff-accounts': [{ id: 2, fullName: 'Trần Minh', email: 'coach@example.test', roleCode: 'COACH', status: 'active' }],
  '/disciplines': [{ id: 1, name: 'Yoga', description: 'Bộ môn Yoga' }],
  '/rooms': [{ id: 1, name: 'Phòng 1', location: 'Tầng 1', capacity: 20, status: 'available' }],
  '/classes': [gymClass], '/classes/sessions': [session], '/classes/enrollments/my': [enrollment],
  '/memberships/subscriptions/my': subscription, '/memberships/subscriptions/history': [subscription],
  '/memberships/subscriptions/my/dynamic-qr': { qrCode: 'review-qr', expiresInSeconds: 60, generatedAt: now },
  '/memberships/subscriptions/realtime-session': { enabled: false },
  '/memberships/subscriptions/pending': [{ ...subscription, status: 'pending_payment', membershipCode: 'MB-001', memberName: profile.fullName, memberEmail: profile.email, memberPhone: profile.phone, durationDays: 30, packagePrice: pack.price }],
  '/memberships/subscriptions/holds/pending': [], '/memberships/cancellations': [cancellation], '/memberships/cancellations/my': [],
  '/notifications/unread-count': { count: 0 },
  '/check-in/gate-qr': { qrCode: 'SOL:GATE:1:A1:review-only', gateId: 'A1', gate: 'Sảnh chính', generatedAt: now, expiresAt: new Date(Date.now() + 60000).toISOString(), expiresInSeconds: 60 },
  '/payments/my': [payment],
  '/members/1/health-metrics': [{ id: 1, metricName: 'weight', metricValue: 60, unit: 'kg', recordedAt: now }],
  '/members/lookup': [{ userId: 1, membershipCode: 'MB-001', fullName: profile.fullName, email: profile.email, phone: profile.phone, status: 'active' }],
  '/check-in/history': [{ id: 1, memberId: 1, memberName: profile.fullName, checkInTime: now, checkOutTime: null, method: 'qr', gate: 'Sảnh chính', status: 'GRANTED', denialReason: null }],
  '/attendance/sessions/11': { members: [] },
  '/classes/coaches': [{ id: 2, fullName: 'Trần Minh', email: 'coach@example.test', phone: '0901234568', status: 'active' }],
  '/users': [{ id: 1, roleCode: 'MEMBER', fullName: profile.fullName, email: profile.email, phone: profile.phone, status: 'active', createdAt: now }, { id: 2, roleCode: 'COACH', fullName: 'Trần Minh', email: 'coach@example.test', phone: '0901234568', status: 'active', createdAt: now }],
  '/roles': ['CENTER_MANAGER', 'COACH', 'RECEPTIONIST', 'MEMBER'].map((code, i) => ({ id: i + 1, code })),
  '/roles/permissions': [{ id: 1, code: 'users.read', name: 'Xem tài khoản', module: 'users' }],
  '/reports/revenue/daily': [{ date: day(0), revenue: pack.price, transactionCount: 1 }],
  '/reports/revenue/by-package': [{ packageId: 1, packageName: pack.name, revenue: pack.price, subscriptionCount: 1, percentage: 100 }],
  '/reports/transactions/recent': [{ ...payment, packageName: pack.name }], '/reports/snapshots': [],
  '/reports/renewal-rate': { renewalRate: null },
};
const routes = [
  ...['dashboard', 'packages', 'classes', 'card', 'profile'].map(n => ['MEMBER', `/member/${n}`]),
  ['COACH', '/staff/attendance'], ...['classes', 'reception', 'check-in'].map(n => ['STAFF', `/staff/${n}`]),
  ...['staff-accounts', 'catalogs', 'cancellations', 'reports'].map(n => ['MANAGER', `/manager/${n}`]),
];

(async () => {
  const browser = await chromium.launch({ headless: true, ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}) });
  const page = await browser.newPage();
  await page.addInitScript(() => localStorage.setItem('scms_theme', 'dark'));
  const output = process.env.UX_REVIEW_OUTPUT || 'docs/ui-review/ux-cleanup'; fs.mkdirSync(output, { recursive: true });
  const base = process.env.PUBLIC_UI_URL || 'http://127.0.0.1:5173';
  const failures = [], errors = [], unknown = new Set();
  let role = 'MEMBER', mode = 'populated';
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/api/v1/**', route => {
    const path = new URL(route.request().url()).pathname.replace(/^\/api\/v1/, '');
    if (path === '/auth/me') {
      const serverRole = { STAFF: 'RECEPTIONIST', MANAGER: 'CENTER_MANAGER' }[role] || role;
      return route.fulfill({ json: { data: { username: 'review', role: serverRole } } });
    }
    let data = /^\/roles\/\d+\/permissions$/.test(path) ? fixtures['/roles/permissions'] : fixtures[path];
    if (data === undefined) { unknown.add(path); data = []; }
    if (mode === 'empty') data = Array.isArray(data) ? [] : null;
    return route.fulfill({ status: mode === 'error' ? 503 : 200, contentType: 'application/json', body: JSON.stringify(mode === 'error' ? { message: 'Không thể tải dữ liệu kiểm chứng.' } : { data }) });
  });
  async function visit(path) {
    await page.addInitScript(role => {
      localStorage.setItem('fitcenter_auth_session', JSON.stringify({ id: '1', identifier: 'review', name: 'Nguyễn An', role }));
      localStorage.setItem('fitcenter_token', 'review-only');
    }, role);
    await page.goto(`${base}${path}`); await page.locator('.portal-v2').waitFor(); await page.waitForLoadState('networkidle');
  }
  async function check(label, action) {
    try { await action(); console.log(`PASS ${label}`); }
    catch (error) { failures.push(`${label}: ${error.message}`); console.error(`FAIL ${label}: ${error.message}`); }
  }
  async function screenshot(name) { await page.screenshot({ path: `${output}/${name}.png`, fullPage: true }); }
  async function audit(label) {
    await check(label, async () => {
      const result = await page.evaluate(() => {
        const shell = document.querySelector('.portal-v2'), backdrop = document.querySelector('.portal-backdrop');
        const box = shell.getBoundingClientRect(), css = getComputedStyle(shell);
        const visible = el => { const b = el.getBoundingClientRect(), s = getComputedStyle(el); return b.width && b.height && s.opacity !== '0' && s.visibility !== 'hidden'; };
        const pale = [...document.querySelectorAll('input, select, textarea, .ui-select__trigger, .luxury-datepicker-trigger, .luxury-timepicker-trigger')].filter(visible).filter(el => {
          const rgb = getComputedStyle(el).backgroundColor.match(/[\d.]+/g)?.map(Number);
          return rgb && rgb.length >= 3 && (rgb.length < 4 || rgb[3] > .8) && Math.min(...rgb.slice(0, 3)) > 185;
        }).map(el => `${el.tagName}#${el.id}`);
        return { background: css.backgroundColor, left: box.left, right: box.right, height: box.height, maxWidth: css.maxWidth,
          viewport: document.documentElement.clientWidth, overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
          backdropPadding: getComputedStyle(backdrop).padding, pale,
          primary: [...document.querySelectorAll('.btn-primary:not(:disabled)')].filter(visible).map(el => getComputedStyle(el).backgroundColor),
          documentScroll: getComputedStyle(document.documentElement).overflowY, bodyScroll: getComputedStyle(document.body).overflowY,
          railWidth: document.querySelector('.app-sidebar').getBoundingClientRect().width,
          boardColumns: document.querySelector('.member-board') ? getComputedStyle(document.querySelector('.member-board')).gridTemplateColumns.split(' ').length : null };
      });
      assert.equal(result.background, 'rgb(32, 32, 32)'); assert.equal(result.left, 0);
      assert.ok(Math.abs(result.right - result.viewport) < 1, 'shell fills viewport width');
      assert.ok(result.height >= page.viewportSize().height, 'shell fills viewport height');
      assert.equal(result.maxWidth, 'none'); assert.equal(result.backdropPadding, '0px');
      assert.equal(result.overflow, false, 'document overflows horizontally'); assert.deepEqual(result.pale, [], 'pale controls');
      assert.ok(result.primary.every(color => ['rgb(206, 145, 128)', 'rgb(225, 170, 152)'].includes(color)), `primary buttons use landing salmon or its hover color: ${JSON.stringify(result.primary)}`);
      assert.ok(!['hidden', 'clip'].includes(result.documentScroll) && !['hidden', 'clip'].includes(result.bodyScroll), 'native document scroll remains available');
      if (page.viewportSize().width >= 1101) {
        assert.equal(result.railWidth, 76, 'preserve desktop icon rail');
        if (result.boardColumns !== null) assert.equal(result.boardColumns, 4, 'preserve four-column board');
      }
    });
  }
  try {
    for (const width of [390, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      for (const [routeRole, path] of routes) {
        role = routeRole; await visit(path); await audit(`${path} at ${width}px`);
        await screenshot(`${path.slice(1).replaceAll('/', '-')}-${width}`);
        if (width === 390 && path === '/member/dashboard') await check('native mobile dashboard scroll', async () => {
          await page.mouse.move(380, 500); await page.mouse.wheel(0, 600);
          await page.waitForFunction(() => window.scrollY > 100);
          await page.mouse.wheel(0, -1000); await page.waitForFunction(() => window.scrollY === 0);
        });
      }
    }
    role = 'MEMBER';
    for (const width of [768, 1920, 2560]) {
      await page.setViewportSize({ width, height: 1000 }); await visit('/member/dashboard');
      await audit(`dashboard full viewport at ${width}px`); await screenshot(`member-dashboard-${width}`);
    }
    await page.setViewportSize({ width: 1440, height: 1000 });
    for (const [path, button, routeRole] of [['/manager/catalogs', /Thêm mới/, 'MANAGER'], ['/admin/users', /Thêm tài khoản/, 'ADMIN'], ['/staff/classes', /Tạo lớp học/, 'MANAGER']]) {
      role = routeRole; await visit(path);
      await check(`${path} create dialog`, async () => {
        await page.getByRole('button', { name: button }).first().click(); await page.locator('dialog[open]').waitFor();
        await audit(`${path} dialog controls`);
        if (path === '/staff/classes') {
          for (const kind of ['datepicker', 'timepicker']) {
            const trigger = page.locator(`.luxury-${kind}-trigger`).first();
            await trigger.focus(); await page.keyboard.press('Enter'); await page.locator(`.luxury-${kind}-popover`).waitFor();
            await page.keyboard.press('Escape'); await page.locator(`.luxury-${kind}-popover`).waitFor({ state: 'hidden' });
            assert.equal(await trigger.evaluate(el => el === document.activeElement), true, `${kind} restores trigger focus`);
            assert.equal(await page.locator('dialog[open]').count(), 1, 'picker Escape keeps parent open');
          }
        }
        await screenshot(`${path.slice(1).replaceAll('/', '-')}-create`);
        await page.keyboard.press('Escape'); await page.locator('dialog[open]').waitFor({ state: 'hidden' });
      });
    }
    role = 'MEMBER';
    for (const state of ['empty', 'error']) {
      mode = state; await visit('/member/dashboard');
      await check(`member ${state}`, async () => {
        await page.locator(state === 'error' ? '[role="alert"]' : '#membership-empty-title').first().waitFor();
        await audit(`member ${state} layout`); await screenshot(`member-dashboard-${state}`);
      });
    }
    assert.deepEqual([...unknown], [], 'missing API fixtures'); assert.deepEqual(errors, [], 'browser runtime errors');
    assert.deepEqual(failures, [], 'UX consistency failures');
    console.log('PASS 13 routes, five dashboard widths, preserved layout, themed controls, dialogs, pickers and states');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
