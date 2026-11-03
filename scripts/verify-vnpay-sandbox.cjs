// Mocked browser check. Never contacts VNPay or writes to a real database.
// NODE_PATH must resolve playwright-core; CHROME_PATH can select an installed browser.
const assert = require('node:assert/strict');
const { chromium } = require('playwright-core');
const base = process.env.PUBLIC_UI_URL || 'http://127.0.0.1:5173';
const day = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
const subscription = { id: 11, memberId: 1, packageId: 1, packageName: 'Gold', status: 'pending_payment', startDate: day, endDate: day, previousSubscriptionId: null, qrCode: null, createdAt: day, upgradeCharge: null };
const payment = { id: 9, memberId: 1, subscriptionId: 11, classEnrollmentId: null, amount: 650000, method: 'online_wallet', status: 'pending', createdAt: day };
const fixtures = {
  '/auth/me': { username: 'review', role: 'MEMBER' },
  '/packages': [{ id: 1, name: 'Gold', description: 'Gói thử nghiệm', price: 650000, durationDays: 30, classCreditLimit: 10, status: 'active' }],
  '/memberships/subscriptions/history': [subscription], '/memberships/subscriptions/my': null,
  '/memberships/cancellations/my': [], '/payments/my': [payment],
  '/notifications/unread-count': 0, '/chat/unread-count': 0,
  '/courts': [], '/court-bookings/quota': { packageName: 'Gold', monthlyQuota: 2, usedQuota: 2, remaining: 0 },
  '/court-bookings/my': { content: [{ id: 82, roomId: 1, roomName: 'Sân 1', disciplineName: 'Tennis', memberId: 1, memberName: 'Nguyễn An', date: day, startTime: '17:00', endTime: '18:00', status: 'booked', canCancel: true, price: 150000, paymentMethod: 'vnpay', paymentStatus: 'pending' }], number: 0, totalPages: 1 },
  '/coach-bookings/coaches': [], '/coach-bookings/quota-status': { packageName: 'Gold', remainingQuota: 0 },
  '/coach-bookings/my': [{ id: 81, memberId: 1, memberName: 'Nguyễn An', coachId: 2, coachName: 'Huỳnh An', coachSpecialization: 'Gym', bookingDate: day, startTime: '17:00:00', endTime: '18:00:00', hourlyRate: 200000, paymentMethod: 'bank_transfer', paymentStatus: 'pending', status: 'confirmed', notes: null, createdAt: day }],
};
(async () => {
  const browser = await chromium.launch({ headless: true, ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}) });
  const page = await browser.newPage({ reducedMotion: 'reduce' });
  let checkoutBody = null, result = 'success', seenRedirects = 0;
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => {
    localStorage.setItem('fitcenter_auth_session', JSON.stringify({ id: '1', identifier: 'review', name: 'Nguyễn An', role: 'MEMBER' }));
    localStorage.setItem('fitcenter_token', 'review-only'); localStorage.setItem('scms_theme', 'dark');
  });
  await page.route('https://sandbox.vnpayment.vn/**', route => {
    seenRedirects++;
    return route.fulfill({ contentType: 'text/html', body: '<h1>Sandbox intercepted</h1>' });
  });
  await page.route('**/api/v1/**', route => {
    const path = new URL(route.request().url()).pathname.replace(/^\/api\/v1/, '');
    let data = fixtures[path] ?? [];
    if (path === '/payments/vnpay/checkout') {
      checkoutBody = route.request().postDataJSON();
      data = { reference: 'ABC123', paymentUrl: 'https://sandbox.vnpayment.vn/paymentv2/vpcpay.html?vnp_TxnRef=ABC123', amount: 650000, expiresAt: `${day}T12:15:00` };
    }
    if (path.startsWith('/payments/vnpay/transactions/')) data = { reference: 'ABC123', paymentId: 9, subscriptionId: 11, amount: 650000, status: result, expiresAt: `${day}T12:15:00`, destination: '/member/packages' };
    return route.fulfill({ json: { success: true, data } });
  });
  try {
    const cases = [
      ['/member/packages/checkout?packageId=1&subscriptionId=11', { subscriptionId: 11 }],
      ['/member/courts', { courtBookingId: 82 }],
      ['/member/classes?tab=pt', { coachBookingId: 81 }],
      ['/member/invoices', { paymentId: 9 }],
    ];
    for (const width of [390, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      for (const [path, target] of cases) {
        checkoutBody = null;
        await page.goto(base + path);
        const button = page.getByRole('button', { name: 'Thanh toán VNPay Sandbox', exact: true }).first();
        await button.waitFor();
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
        if (overflow) console.error(await page.evaluate(() => [...document.querySelectorAll('#portal-main *')].filter(el => el.getBoundingClientRect().right > innerWidth + 1).slice(0, 8).map(el => ({ tag: el.tagName, class: el.className, text: el.textContent.slice(0, 70), right: el.getBoundingClientRect().right }))));
        assert.equal(overflow, false, path + ' overflow');
        await button.click();
        await page.getByRole('heading', { name: 'Sandbox intercepted' }).waitFor();
        assert.deepEqual(checkoutBody, target, 'send target ID only, never client amount');
        console.log(`PASS ${path}: Sandbox redirect at ${width}px`);
      }
      for (const status of ['pending', 'failed', 'success']) {
        result = status;
        await page.goto(base + '/member/payments/vnpay/return?vnp_TxnRef=ABC123&vnp_ResponseCode=00');
        await page.getByRole('heading', { name: status === 'pending' ? 'Đang xác nhận thanh toán' : status === 'failed' ? 'Thanh toán chưa thành công' : 'Thanh toán thành công', exact: true }).waitFor();
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth), false);
      }
    }
    assert.equal(seenRedirects, 8); assert.deepEqual(errors, []);
    console.log('PASS 4 payment targets and 3 authoritative return states on mobile/desktop; gateway network intercepted');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
