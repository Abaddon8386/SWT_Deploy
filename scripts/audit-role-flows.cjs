// Browser audit with intercepted API fixtures. No database or Google account is contacted.
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright-core');
const base = process.env.ROLE_AUDIT_URL || 'http://127.0.0.1:4173';
const output = 'docs/qa/role-flow-audit-2026-11-02';
const roles = [['ADMIN', '/admin/users'], ['CENTER_MANAGER', '/manager/users'], ['COACH', '/staff/attendance'], ['RECEPTIONIST', '/staff/reception'], ['MEMBER', '/member/dashboard']];
const result = { scope: 'Browser fixtures, not live API/database E2E', navigation: [], transitions: [], targeted: [], unknownEndpoints: [] };
const unknown = new Set();
const profile = { userId: 1, fullName: 'Audit user', email: 'audit@example.test', phone: '0901234567', gender: 'other', dob: null, avatarUrl: null, address: null, membershipCode: 'MEM-1', healthNotes: null, fitnessGoal: null, fitnessLevel: 'beginner', emergencyContactName: null, emergencyContactPhone: null };
const roleDtos = ['CENTER_MANAGER', 'COACH', 'RECEPTIONIST', 'MEMBER', 'ADMIN'].map((code, i) => ({ id: i + 1, code }));

async function fixtures(page, state) {
  await page.route('**/api/v1/**', async route => {
    const req = route.request();
    const url = new URL(req.url());
    const endpoint = url.pathname.replace(/^\/api\/v1/, '');
    const token = req.headers().authorization || '';
    const role = token.replace('Bearer audit-', '') || state.role;
    state.requests.push({ method: req.method(), endpoint, role, ...(endpoint === '/coaching/training-plans' && req.method() === 'POST' ? { body: req.postDataJSON() } : {}) });
    let data = [];
    let status = 200;
    if (endpoint === '/auth/login') data = { token: `audit-${state.role}`, username: 'audit', role: state.role };
    else if (endpoint === '/profile') data = profile;
    else if (endpoint === '/roles') data = roleDtos;
    else if (endpoint.includes('realtime-session')) data = { enabled: false };
    else if (endpoint === '/notifications/unread-count') data = { count: 0 };
    else if (/^\/notifications$|^\/chat\/conversations$|^\/support\/requests(?:\/my)?$/.test(endpoint)) data = { content: [], number: 0, totalPages: 0, totalElements: 0 };
    else if (endpoint === '/memberships/subscriptions/my') data = null;
    else if (endpoint === '/reports/renewal-rate') data = { renewalRate: null };
    else if (endpoint === '/members/lookup') data = [{ userId: 1, fullName: 'Audit member', email: 'member@example.test', membershipCode: 'MEM-1', status: 'active' }];
    else if (endpoint === '/check-in/gate-qr') data = { qrCode: 'SOL:GATE:1:A1:fixture', gateId: 'A1', gate: 'Audit gate', expiresInSeconds: 60, generatedAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 60000).toISOString() };
    else if (endpoint.includes('/renewal-candidates') && ['CENTER_MANAGER', 'RECEPTIONIST'].includes(role)) {
      // Reproduces the actual SecurityConfig generic subscription matcher. Confirm separately with MockMvc.
      status = 403;
      data = null;
    } else if (endpoint === '/coaching/training-plans' && req.method() === 'POST' && role === 'CENTER_MANAGER' && !req.postDataJSON().coach_id) {
      status = 404;
    } else if (!/^\/(?:classes|packages|rooms|disciplines|staff-accounts|users|roles|payments|coaching|coach-bookings|training-plans|memberships|check-in|reports|operations|support|admin\/audit-logs|members\/me\/favorite-disciplines|members\/.+\/health-metrics|health\/metrics\/my|ai)/.test(endpoint)) unknown.add(endpoint);
    await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify({ success: status < 400, data, ...(status === 403 ? { message: 'Forbidden (role policy)', code: 'FORBIDDEN' } : {}) }) });
  });
  await page.route('https://**', route => route.abort());
}

async function waitPage(page) {
  await page.locator('.portal-v2').waitFor({ timeout: 6000 });
  await page.waitForTimeout(350);
}

(async () => {
  fs.mkdirSync(output, { recursive: true });
  const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', args: ['--renderer-process-limit=2'] });
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce', serviceWorkers: 'block' });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const state = { role: 'ADMIN', requests: [] };
    await fixtures(page, state);
    for (const [role, home] of roles) {
      state.role = role;
      await page.goto(`${base}/login`);
      if (await page.getByRole('button', { name: 'Đăng xuất tài khoản này' }).count()) await page.getByRole('button', { name: 'Đăng xuất tài khoản này' }).click();
      await page.locator('#login-identifier').fill('audit@example.test');
      await page.locator('#login-password').fill('Password123!');
      await page.locator('button[type="submit"]').click();
      await page.waitForURL(`**${home}`);
      await waitPage(page);
      result.transitions.push({ role, action: 'password login', path: new URL(page.url()).pathname, expected: home, ok: new URL(page.url()).pathname === home });
      const links = await page.locator('.app-sidebar a[href]').evaluateAll(items => [...new Set(items.map(item => item.getAttribute('href')).filter(href => href && href.startsWith('/') && href !== '/'))]);
      for (const link of links) {
        state.requests = [];
        const errorStart = errors.length;
        await page.goto(base + link);
        let exception = null;
        try { await waitPage(page); } catch (error) { exception = error.message; }
        result.navigation.push({ role, requested: link, actual: new URL(page.url()).pathname, exception, errors: errors.slice(errorStart), alerts: await page.locator('[role="alert"]').allTextContents(), requests: [...state.requests] });
        if (role === 'MEMBER' && link === '/member/packages') {
          await page.getByRole('button', { name: 'Thử đồng bộ lại' }).click();
          await page.waitForTimeout(300);
          result.targeted.push({ name: 'member-disabled-realtime-manual-sync', remainingAlerts: await page.locator('[role="alert"]').allTextContents() });
        }
      }
      if (role === 'COACH' || role === 'CENTER_MANAGER') {
        await page.goto(base + '/coach/training-plans');
        await waitPage(page);
        const select = page.locator('[role="combobox"]').first();
        if (await select.count()) {
          await select.click();
          result.targeted.push({ name: 'empty-real-classes-training-members', role, suppliedClasses: [], options: await page.locator('[role="option"]').allTextContents(), alerts: await page.locator('[role="alert"]').allTextContents() });
          await page.screenshot({ path: path.join(output, `${role.toLowerCase()}-fictional-members.png`) });
          await page.keyboard.press('Escape');
        }
        if (role === 'CENTER_MANAGER') {
          await page.getByRole('button', { name: 'Lưu & Kích hoạt giáo án', exact: true }).click();
          await page.waitForTimeout(350);
          result.targeted.push({ name: 'manager-save-plan-without-coach', requests: state.requests.filter(request => request.endpoint === '/coaching/training-plans'), notification: (await page.locator('body').innerText()).slice(-500) });
        }
      }
      if (role === 'RECEPTIONIST' || role === 'CENTER_MANAGER') {
        await page.goto(base + '/staff/reception');
        await waitPage(page);
        await page.locator('input[placeholder*="CCCD"]').fill('MEM-1');
        await page.locator('input[placeholder*="CCCD"]').press('Enter');
        await page.waitForTimeout(500);
        result.targeted.push({ name: 'staff-pos-offer-loading', role, text: (await page.locator('main').innerText()).slice(-2200), requests: state.requests.filter(request => request.endpoint.includes('renewal-candidates')) });
        await page.screenshot({ path: path.join(output, `${role.toLowerCase()}-pos-forbidden.png`) });
      }
      await page.getByRole('button', { name: 'Đăng xuất', exact: true }).first().click();
      await page.getByRole('dialog').getByRole('button', { name: 'Đăng xuất', exact: true }).click();
      await page.waitForURL('**/login');
      result.transitions.push({ role, action: 'logout', tokenCleared: await page.evaluate(() => localStorage.getItem('fitcenter_token') === null), sessionCleared: await page.evaluate(() => localStorage.getItem('fitcenter_auth_session') === null) });
    }

    // A second tab changes the same browser's account while the first tab has mounted Member UI.
    await page.goto(base + '/login');
    await page.evaluate(() => {
      localStorage.setItem('fitcenter_token', 'audit-MEMBER');
      localStorage.setItem('fitcenter_auth_session', JSON.stringify({ id: '1', name: 'Member account', identifier: 'member', role: 'MEMBER' }));
    });
    await page.goto(base + '/member/dashboard');
    await waitPage(page);
    const second = await context.newPage();
    await fixtures(second, state);
    await second.goto(base + '/login');
    await second.evaluate(() => {
      localStorage.setItem('fitcenter_token', 'audit-ADMIN');
      localStorage.setItem('fitcenter_auth_session', JSON.stringify({ id: '5', name: 'Admin account', identifier: 'admin', role: 'ADMIN' }));
    });
    await page.waitForTimeout(400);
    result.targeted.push({ name: 'cross-tab-account-change', firstTabPath: new URL(page.url()).pathname, firstTabHeading: await page.locator('h1').first().textContent(), firstTabMenu: await page.locator('.app-sidebar a[href]').evaluateAll(items => items.map(item => item.getAttribute('href'))), storedRole: await page.evaluate(() => JSON.parse(localStorage.getItem('fitcenter_auth_session')).role) });
    await page.screenshot({ path: path.join(output, 'cross-tab-stale-member.png') });

    // A response from the old account arrives after a different account is already signed in.
    await page.evaluate(() => {
      localStorage.setItem('fitcenter_token', 'audit-MEMBER');
      localStorage.setItem('fitcenter_auth_session', JSON.stringify({ id: '1', name: 'Old member', identifier: 'member', role: 'MEMBER' }));
    });
    const heldProfile = new Promise(resolve => page.route('**/api/v1/profile', route => resolve(route)));
    await page.goto(base + '/member/profile');
    const held = await heldProfile;
    await second.evaluate(() => {
      localStorage.setItem('fitcenter_token', 'audit-COACH');
      localStorage.setItem('fitcenter_auth_session', JSON.stringify({ id: '2', name: 'New coach', identifier: 'coach', role: 'COACH' }));
    });
    await held.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ success: false, message: 'Old token expired' }) });
    await page.waitForURL('**/login?expired=1');
    result.targeted.push({ name: 'late-old-session-401', newlySavedRole: 'COACH', currentToken: await second.evaluate(() => localStorage.getItem('fitcenter_token')), currentSession: await second.evaluate(() => localStorage.getItem('fitcenter_auth_session')), redirected: new URL(page.url()).pathname + new URL(page.url()).search });
    await context.close();
    result.unknownEndpoints = [...unknown];
    result.pageErrors = errors;
  } finally {
    await browser.close();
    fs.writeFileSync(path.join(output, 'browser-results.json'), JSON.stringify(result, null, 2));
  }
  console.log(JSON.stringify({ navigationCases: result.navigation.length, transitions: result.transitions.length, pageErrors: result.pageErrors, alerts: result.navigation.filter(item => item.alerts.length), targeted: result.targeted, unknownEndpoints: result.unknownEndpoints }, null, 2));
})().catch(error => { console.error(error); process.exitCode = 1; });
