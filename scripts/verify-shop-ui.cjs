// Browser verification for the Supplement Shop ("Sản phẩm") feature.
// Uses intercepted API fixtures; never writes to a database.
// NODE_PATH supplies the existing playwright-core installation. CHROME_PATH is optional.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright-core');

const base = process.env.PUBLIC_UI_URL || 'http://127.0.0.1:5173';
const output = process.env.SHOP_UI_OUTPUT
  ? path.resolve(process.env.SHOP_UI_OUTPUT)
  : path.resolve(__dirname, '../docs/ui-review/shop');

const catalogFixture = require('./public-catalog-fixture.cjs');

const categories = [
  { id: 1, name: 'Whey Protein', slug: 'whey' },
  { id: 2, name: 'Creatine', slug: 'creatine' },
  { id: 3, name: 'Điện giải', slug: 'dien-giai' },
];

const productsSummary = [
  {
    id: 1,
    slug: 'sol-whey-isolate',
    name: 'SÖL Whey Isolate',
    categoryName: 'Whey Protein',
    form: 'powder',
    goals: ['muscle_gain', 'recovery'],
    shortDescription: 'Đạm whey thủy phân hấp thu nhanh sau buổi tập.',
    imageUrl: '/images/shop/whey-isolate.jpg',
    highlight: { name: 'đạm', amount: 25, unit: 'g' },
    minPrice: 1290000,
    pricePerServing: 18971,
    inStock: true,
    lowStock: false,
    featured: true,
    isNew: true,
    defaultVariantId: null,
    variantCount: 2,
  },
  {
    id: 2,
    slug: 'sol-creatine-monohydrate',
    name: 'SÖL Creatine Monohydrate',
    categoryName: 'Creatine',
    form: 'powder',
    goals: ['muscle_gain', 'energy'],
    shortDescription: 'Creatine vi hạt tinh khiết hỗ trợ sức mạnh.',
    imageUrl: '/images/shop/creatine-monohydrate.jpg',
    highlight: { name: 'creatine', amount: 5, unit: 'g' },
    minPrice: 590000,
    pricePerServing: 9833,
    inStock: true,
    lowStock: true,
    featured: true,
    isNew: true,
    defaultVariantId: 201,
    variantCount: 1,
  },
  {
    id: 3,
    slug: 'sol-hydra-electrolyte',
    name: 'SÖL Hydra Electrolyte',
    categoryName: 'Điện giải',
    form: 'powder',
    goals: ['recovery', 'energy'],
    shortDescription: 'Bù khoáng và điện giải cân bằng trong buổi tập cường độ cao.',
    imageUrl: '/images/shop/electrolyte.jpg',
    highlight: { name: 'natri', amount: 320, unit: 'mg' },
    minPrice: 390000,
    pricePerServing: 13000,
    inStock: true,
    lowStock: false,
    featured: true,
    isNew: false,
    defaultVariantId: 301,
    variantCount: 1,
  },
];

const productDetail = {
  id: 1,
  slug: 'sol-whey-isolate',
  name: 'SÖL Whey Isolate',
  brand: 'SÖL Nutrition',
  categoryName: 'Whey Protein',
  categorySlug: 'whey',
  form: 'powder',
  goals: ['muscle_gain', 'recovery'],
  shortDescription: 'Đạm whey thủy phân hấp thu nhanh sau buổi tập.',
  description: 'Công thức Whey Isolate lọc lạnh tinh khiết, ít lactose, dễ hòa tan.',
  servingSize: '1 muỗng (33 g)',
  usageInstructions: 'Pha 1 muỗng với 250 ml nước nguội ngay sau buổi tập.',
  warnings: 'Không dùng cho người mẫn cảm với thành phần sữa.',
  registrationNumber: null,
  images: [
    { id: 1, url: '/images/shop/whey-isolate.jpg', alt: 'SÖL Whey Isolate' },
    { id: 2, url: '/images/shop/whey-scoop.jpg', alt: 'Muỗng bột SÖL Whey Isolate' },
  ],
  variants: [
    {
      id: 101,
      sku: 'SOL-WHEY-1KG-CHOC',
      label: 'Vị Sô-cô-la · 1 kg',
      price: 1290000,
      servingsPerContainer: 30,
      pricePerServing: 43000,
      stock: 15,
      available: true,
    },
    {
      id: 102,
      sku: 'SOL-WHEY-2KG-CHOC',
      label: 'Vị Sô-cô-la · 2.27 kg',
      price: 2290000,
      servingsPerContainer: 68,
      pricePerServing: 33676,
      stock: 8,
      available: true,
    },
  ],
  nutrients: [
    { name: 'Năng lượng', amount: 130, unit: 'kcal', dailyValuePercent: null, subRow: false, highlight: false },
    { name: 'Đạm', amount: 25, unit: 'g', dailyValuePercent: 50, subRow: false, highlight: true },
    { name: 'BCAA', amount: 5.5, unit: 'g', dailyValuePercent: null, subRow: true, highlight: false },
    { name: 'Carbohydrate', amount: 2, unit: 'g', dailyValuePercent: 1, subRow: false, highlight: false },
  ],
  related: [productsSummary[1], productsSummary[2]],
};

function parseRgb(str) {
  const m = str.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (!m) return [0, 0, 0];
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

function relLuminance([r, g, b]) {
  const chan = [r, g, b].map(v => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * chan[0] + 0.7152 * chan[1] + 0.0722 * chan[2];
}

function contrastRatio(fg, bg) {
  const l1 = relLuminance(parseRgb(fg));
  const l2 = relLuminance(parseRgb(bg));
  const brightest = Math.max(l1, l2);
  const darkest = Math.min(l1, l2);
  return (brightest + 0.05) / (darkest + 0.05);
}

(async () => {
  fs.mkdirSync(output, { recursive: true });
  const browser = await chromium.launch({
    headless: true,
    ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}),
  });
  const errors = [];

  try {
    let orderStatus = 'paid';
    const vnpayCalls = [];

    const buildOrder = () => ({
      id: 42,
      code: 'SOL-261105-A1B2',
      status: orderStatus,
      fulfillment: 'delivery',
      paymentMethod: 'online',
      subtotal: 2290000,
      shippingFee: 0,
      total: 2290000,
      canCancel: orderStatus === 'pending_payment' || orderStatus === 'paid',
      canPay: orderStatus === 'pending_payment',
      paymentDueAt: new Date(Date.now() + 1800000).toISOString(),
      createdAt: '2026-11-05T08:00:00Z',
      paidAt: '2026-11-05T08:05:00Z',
      processedAt: orderStatus === 'processing' ? '2026-11-05T08:30:00Z' : null,
      shippedAt: null,
      readyAt: null,
      completedAt: null,
      cancelledAt: null,
      cancelReason: null,
      refundedAmount: null,
      trackingCarrier: null,
      trackingNumber: null,
      pickupInstruction: null,
      shipping: {
        recipientName: 'Nguyễn Minh Quân',
        phone: '0901234567',
        provinceName: 'Thành phố Hồ Chí Minh',
        wardName: 'Phường Sài Gòn',
        streetLine: '120 Hai Bà Trưng',
        note: null,
      },
      member: {
        id: 1,
        fullName: 'Nguyễn Minh Quân',
        phone: '0901234567',
      },
      items: [
        {
          variantId: 102,
          productId: 1,
          productSlug: 'sol-whey-isolate',
          productName: 'SÖL Whey Isolate',
          variantLabel: 'Vị Sô-cô-la · 2.27 kg',
          sku: 'SOL-WHEY-2KG-CHOC',
          form: 'powder',
          unitPrice: 2290000,
          quantity: 1,
          lineTotal: 2290000,
        },
      ],
    });

    const attachRoutes = async (page, role = null) => {
      await page.route('**/accounts.google.com/gsi/**', route =>
        route.fulfill({ body: '', contentType: 'text/javascript' }),
      );
      await page.route('https://sandbox.vnpayment.vn/paymentv2/vpcpay.html*', route =>
        route.fulfill({
          status: 302,
          headers: { location: `${base}/member/orders/42` },
          body: '',
        }),
      );
      await page.route('**/api/v1/**', async route => {
        const req = route.request();
        const url = new URL(req.url());
        const p = url.pathname.replace(/^\/api\/v1/, '');

        let data = {};
        if (p === '/public/catalog') {
          data = catalogFixture;
        } else if (p === '/public/product-categories') {
          data = categories;
        } else if (p === '/public/products') {
          const goal = url.searchParams.get('goal');
          const filtered = goal ? productsSummary.filter(item => item.goals.includes(goal)) : productsSummary;
          data = {
            content: filtered,
            number: 0,
            size: 12,
            totalElements: filtered.length,
            totalPages: 1,
          };
        } else if (p === '/public/products/sol-whey-isolate') {
          data = productDetail;
        } else if (p === '/public/shop/config') {
          data = {
            shippingFee: 30000,
            freeShippingThreshold: 500000,
            paymentWindowMinutes: 30,
            counterHoldHours: 48,
            pickupAddress: 'SÖL Fitness — 120 Hai Bà Trưng, Phường Sài Gòn, TP. Hồ Chí Minh',
          };
        } else if (p === '/public/shop/quote') {
          const body = req.postDataJSON() || { items: [], fulfillment: 'pickup' };
          const lines = (body.items || []).map(it => {
            const v = productDetail.variants.find(x => x.id === it.variantId) || productDetail.variants[0];
            return {
              variantId: v.id,
              productId: 1,
              slug: 'sol-whey-isolate',
              productSlug: 'sol-whey-isolate',
              productName: 'SÖL Whey Isolate',
              variantLabel: v.label,
              form: 'powder',
              imageUrl: null,
              unitPrice: v.price,
              requestedQuantity: it.quantity,
              quantity: it.quantity,
              lineTotal: v.price * it.quantity,
              stock: v.stock,
              problem: null,
            };
          });
          const subtotal = lines.reduce((s, l) => s + l.lineTotal, 0);
          const shippingFee = body.fulfillment === 'delivery' && subtotal < 500000 ? 30000 : 0;
          data = {
            lines,
            subtotal,
            shippingFee,
            total: subtotal + shippingFee,
            freeShippingThreshold: 500000,
            valid: lines.length > 0,
          };
        } else if (p === '/public/geo/provinces') {
          data = [{ code: '79', name: 'Thành phố Hồ Chí Minh' }];
        } else if (p === '/public/geo/provinces/79/wards') {
          data = [{ code: '26734', name: 'Phường Sài Gòn' }];
        } else if (p === '/shop/addresses') {
          data = [];
        } else if (p === '/shop/orders' && req.method() === 'POST') {
          data = { ...buildOrder(), status: 'pending_payment' };
        } else if (p === '/shop/orders/42') {
          data = buildOrder();
        } else if (p === '/shop/orders') {
          data = { content: [buildOrder()], number: 0, size: 10, totalElements: 1, totalPages: 1 };
        } else if (p === '/payments/vnpay/config') {
          data = { enabled: true };
        } else if (p === '/payments/vnpay/checkout' && req.method() === 'POST') {
          const body = req.postDataJSON();
          vnpayCalls.push(body);
          data = {
            reference: 'VNP-ORDER-42',
            paymentUrl: 'https://sandbox.vnpayment.vn/paymentv2/vpcpay.html?vnp_TxnRef=VNP-ORDER-42',
            amount: 2290000,
            expiresAt: new Date(Date.now() + 900000).toISOString(),
          };
        } else if (p === '/wallet/my') {
          data = { balance: 500000, updatedAt: new Date().toISOString(), transactions: [] };
        } else if (p === '/staff/product-orders/counts') {
          data = {
            paid: orderStatus === 'paid' ? 1 : 0,
            processing: orderStatus === 'processing' ? 1 : 0,
            ready_for_pickup: 0,
            shipping: 0,
            counter_pending: 0,
          };
        } else if (p === '/staff/product-orders') {
          data = { content: [buildOrder()], number: 0, size: 20, totalElements: 1, totalPages: 1 };
        } else if (
          (p === '/staff/product-orders/42/start-processing' || p === '/staff/product-orders/42/process') &&
          req.method() === 'POST'
        ) {
          orderStatus = 'processing';
          data = buildOrder();
        } else if (p === '/manager/products') {
          data = {
            content: productsSummary.map(item => ({
              id: item.id,
              slug: item.slug,
              name: item.name,
              categoryName: item.categoryName,
              variantCount: item.variantCount,
              totalStock: item.lowStock ? 8 : 25,
              lowStock: item.lowStock,
              active: true,
              featured: item.featured,
              imageUrl: item.imageUrl,
              minPrice: item.minPrice,
              isNew: item.isNew,
            })),
            number: 0,
            size: 20,
            totalElements: productsSummary.length,
            totalPages: 1,
          };
        } else if (p === '/manager/product-categories') {
          data = categories;
        } else if (p === '/manager/product-orders/summary') {
          data = {
            pendingFulfillment: 3,
            revenue30d: 4500000,
            lowStockVariants: 1,
          };
        } else if (p === '/auth/me') {
          data = {
            username: 'review',
            role: role === 'STAFF' ? 'RECEPTIONIST' : role === 'MANAGER' ? 'CENTER_MANAGER' : 'MEMBER',
          };
        } else if (p === '/notifications/unread-count' || p === '/chat/unread-count') {
          data = { count: 0 };
        } else if (p === '/profile') {
          data = { userId: 1, fullName: 'Nguyễn Minh Quân' };
        } else if (p.endsWith('/realtime-session')) {
          data = { enabled: false };
        }

        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ success: true, data }),
        });
      });
    };

    // (1) Responsive matrix & themes: 390x844, 768, 1440, 1920 + dark/light
    for (const theme of ['dark', 'light']) {
      for (const width of [390, 768, 1440, 1920]) {
        const height = width === 390 ? 844 : 1000;
        const context = await browser.newContext({
          viewport: { width, height },
          hasTouch: width <= 768,
          reducedMotion: 'reduce',
        });
        const page = await context.newPage();
        page.on('pageerror', err => errors.push(err.message));
        await page.addInitScript(t => {
          localStorage.setItem('scms_theme', t);
        }, theme);
        await attachRoutes(page);

        await page.goto(base);
        await page.locator('#products').waitFor({ state: 'visible' });
        const navLink = page.locator('.fit-nav a[href="/products"]').first();
        assert.equal(await navLink.count(), 1, 'Landing topbar must include /products link');
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
        assert.ok(overflow <= 0, `Landing horizontal overflow at ${width}px (${theme}): ${overflow}px`);

        await page.locator('#products').screenshot({
          path: path.join(output, `landing-shelf-${theme}-${width}.png`),
        });
        await context.close();
      }
    }
    console.log('PASS (1) Landing #products shelf & topbar link across 390/768/1440/1920 and dark/light with 0 overflow');

    // (2)-(5) Public catalog -> Product detail -> Cart drawer -> Guest login redirect -> Member Checkout -> VNPay checkout
    for (const theme of ['dark', 'light']) {
      const context = await browser.newContext({
        viewport: { width: 1440, height: 1000 },
        reducedMotion: 'reduce',
      });
      const page = await context.newPage();
      page.on('pageerror', err => errors.push(err.message));
      await page.addInitScript(t => {
        localStorage.setItem('scms_theme', t);
      }, theme);
      await attachRoutes(page);

      // (2) /products filter chip updates URL
      await page.goto(`${base}/products`);
      await page.getByRole('heading', { name: 'SÖL Whey Isolate' }).waitFor();
      await page.getByRole('button', { name: 'Phục hồi' }).click();
      await page.waitForFunction(() => window.location.search.includes('goal=recovery'));
      await page.screenshot({ path: path.join(output, `products-${theme}-1440.png`), fullPage: true });

      // (3) Product detail: select variant, add to cart, badge = 1, NutritionFacts contrast >= 4.5:1
      await page.getByRole('link', { name: 'SÖL Whey Isolate' }).first().click();
      await page.waitForURL('**/products/sol-whey-isolate');
      await page.locator('.shop-facts').waitFor({ state: 'visible' });

      // (9) Check NutritionFacts contrast >= 4.5:1 in both themes
      const factsColors = await page.locator('.shop-facts').evaluate(el => {
        const cs = getComputedStyle(el);
        const cap = el.querySelector('caption');
        const capCs = cap ? getComputedStyle(cap) : cs;
        return { fg: capCs.color, bg: cs.backgroundColor };
      });
      const ratio = contrastRatio(factsColors.fg, factsColors.bg);
      assert.ok(ratio >= 4.5, `NutritionFacts contrast in ${theme} must be >= 4.5:1, got ${ratio.toFixed(2)}`);

      await page.locator('label.shop-variant-pill').filter({ hasText: '2.27 kg' }).click();
      await page.getByRole('button', { name: 'Thêm vào giỏ' }).first().click();
      const cartBtn = page.locator('button[aria-label="Giỏ hàng · 1 sản phẩm"]');
      await cartBtn.waitFor({ state: 'visible' });

      // (8) prefers-reduced-motion disables badge animation
      const badgeAnim = await cartBtn.evaluate(el => getComputedStyle(el).animationName);
      assert.equal(badgeAnim, 'none', 'CartButton must have no animation under prefers-reduced-motion');

      await page.screenshot({ path: path.join(output, `product-detail-${theme}-1440.png`), fullPage: true });

      // (4) Drawer -> Thanh toán redirects guest to /login?returnTo=%2Fcheckout
      await cartBtn.click();
      await page.locator('.shop-drawer').waitFor({ state: 'visible' });
      await page.locator('.shop-drawer__item').first().waitFor({ state: 'visible' });
      const drawerAnim = await page.locator('.shop-drawer').evaluate(el => getComputedStyle(el).animationName);
      assert.equal(drawerAnim, 'none', 'CartDrawer must have no animation under prefers-reduced-motion');
      await page.screenshot({ path: path.join(output, `cart-drawer-${theme}-1440.png`) });

      if (theme === 'dark') {
        await page.locator('.shop-drawer').getByRole('button', { name: 'Thanh toán' }).click();
        await page.waitForFunction(() => window.location.pathname === '/login' && window.location.search.includes('returnTo=%2Fcheckout'));

        // (5) Simulate authenticated member -> /checkout -> select province/ward -> place order -> calls /payments/vnpay/checkout with productOrderId
        await page.evaluate(() => {
          localStorage.setItem(
            'fitcenter_auth_session',
            JSON.stringify({ id: '1', identifier: 'member', name: 'Nguyễn Minh Quân', role: 'MEMBER' }),
          );
          localStorage.setItem('fitcenter_token', 'fixture-member-token');
        });
        await page.goto(`${base}/checkout`);
        await page.getByLabel(/Họ tên người nhận/).fill('Nguyễn Minh Quân');
        await page.getByLabel(/Số điện thoại/).fill('0901234567');

        // Select province & ward
        await page.getByLabel('Tỉnh / Thành phố').selectOption('79');
        await page.getByLabel('Phường / Xã').selectOption('26734');
        await page.getByLabel(/Số nhà, tên đường/).fill('120 Hai Bà Trưng');

        await page.screenshot({ path: path.join(output, 'checkout-dark-1440.png'), fullPage: true });
        await page.getByRole('button', { name: /Thanh toán VNPay/ }).click();
        await page.waitForFunction(() => window.location.pathname === '/member/orders/42');
        assert.ok(
          vnpayCalls.some(c => c && c.productOrderId === 42),
          'Checkout must call /payments/vnpay/checkout with productOrderId: 42',
        );

        // (6) /member/orders/42 renders timeline
        await page.locator('.shop-timeline').waitFor({ state: 'visible' });
        await page.screenshot({ path: path.join(output, 'member-order-detail-dark-1440.png'), fullPage: true });

        // /member/orders dark
        await page.goto(`${base}/member/orders`);
        await page.getByText('SOL-261105-A1B2').first().waitFor({ state: 'visible' });
        await page.screenshot({ path: path.join(output, 'member-orders-dark-1440.png'), fullPage: true });

        // /member/orders?tab=shop dark (in-portal product catalog)
        await page.getByRole('tab', { name: 'Sản phẩm' }).click();
        await page.getByRole('heading', { name: 'SÖL Whey Isolate' }).waitFor({ state: 'visible' });
        await page.screenshot({ path: path.join(output, 'member-shop-dark-1440.png'), fullPage: true });
      } else {
        await page.evaluate(() => {
          localStorage.setItem(
            'fitcenter_auth_session',
            JSON.stringify({ id: '1', identifier: 'member', name: 'Nguyễn Minh Quân', role: 'MEMBER' }),
          );
          localStorage.setItem('fitcenter_token', 'fixture-member-token');
        });
        await page.goto(`${base}/checkout`);
        await page.getByLabel(/Họ tên người nhận/).fill('Nguyễn Minh Quân');
        await page.getByLabel(/Số điện thoại/).fill('0901234567');
        await page.getByLabel('Tỉnh / Thành phố').selectOption('79');
        await page.getByLabel('Phường / Xã').selectOption('26734');
        await page.getByLabel(/Số nhà, tên đường/).fill('120 Hai Bà Trưng');
        await page.screenshot({ path: path.join(output, 'checkout-light-1440.png'), fullPage: true });

        await page.goto(`${base}/member/orders`);
        await page.getByText('SOL-261105-A1B2').first().waitFor({ state: 'visible' });
        await page.screenshot({ path: path.join(output, 'member-orders-light-1440.png'), fullPage: true });
      }
      await context.close();
    }
    console.log('PASS (2)-(6), (8)-(9) Catalog filter, detail variant/cart, NutritionFacts contrast, guest redirect, checkout VNPay, member timeline');

    // (7) /staff/orders transitions status from paid -> processing
    {
      const context = await browser.newContext({
        viewport: { width: 1440, height: 1000 },
        reducedMotion: 'reduce',
      });
      const page = await context.newPage();
      page.on('pageerror', err => errors.push(err.message));
      await page.addInitScript(() => {
        localStorage.setItem('scms_theme', 'dark');
        localStorage.setItem(
          'fitcenter_auth_session',
          JSON.stringify({ id: '2', identifier: 'staff', name: 'Lễ tân SÖL', role: 'STAFF' }),
        );
        localStorage.setItem('fitcenter_token', 'fixture-staff-token');
      });
      await attachRoutes(page, 'STAFF');
      await page.goto(`${base}/staff/orders`);
      await page.getByText('SOL-261105-A1B2').first().waitFor({ state: 'visible' });
      await page.screenshot({ path: path.join(output, 'staff-orders-dark-1440.png'), fullPage: true });
      await page.getByRole('button', { name: /Xem chi tiết|Chi tiết|Mở đơn|SOL-261105-A1B2/i }).first().click();
      await page.getByRole('button', { name: /Bắt đầu chuẩn bị/i }).click();
      await page.waitForFunction(() => document.body.textContent.includes('Đang chuẩn bị'));
      await page.screenshot({ path: path.join(output, 'staff-order-dialog-dark-1440.png') });
      await context.close();
    }
    console.log('PASS (7) /staff/orders transitions order status');

    // (10) Mobile 390x844 input font-size >= 16px & mobile checkout screenshot
    {
      const context = await browser.newContext({
        viewport: { width: 390, height: 844 },
        hasTouch: true,
        reducedMotion: 'reduce',
      });
      const page = await context.newPage();
      page.on('pageerror', err => errors.push(err.message));
      await page.addInitScript(() => {
        localStorage.setItem('scms_theme', 'dark');
        localStorage.setItem(
          'fitcenter_auth_session',
          JSON.stringify({ id: '1', identifier: 'member', name: 'Nguyễn Minh Quân', role: 'MEMBER' }),
        );
        localStorage.setItem('fitcenter_token', 'fixture-member-token');
        localStorage.setItem('scms_cart_v1', JSON.stringify([{ variantId: 102, quantity: 1 }]));
      });
      await attachRoutes(page);
      await page.goto(`${base}/products`);
      await page.locator('input[type="search"]').first().waitFor({ state: 'visible' });
      const fontSize = await page
        .locator('input[type="search"]')
        .first()
        .evaluate(el => parseFloat(getComputedStyle(el).fontSize));
      assert.ok(fontSize >= 16, `Mobile search input font-size must be >= 16px, got ${fontSize}px`);
      await page.screenshot({ path: path.join(output, 'products-dark-390.png'), fullPage: true });

      await page.goto(`${base}/checkout`);
      await page.getByLabel(/Họ tên người nhận/).waitFor({ state: 'visible' });
      const checkoutFontSize = await page
        .getByLabel(/Họ tên người nhận/)
        .evaluate(el => parseFloat(getComputedStyle(el).fontSize));
      assert.ok(checkoutFontSize >= 16, `Mobile checkout input font-size must be >= 16px, got ${checkoutFontSize}px`);
      await page.screenshot({ path: path.join(output, 'checkout-dark-390.png'), fullPage: true });

      // Mobile Member Portal Shop (/member/orders?tab=shop) at 390x844
      await page.goto(`${base}/member/orders?tab=shop`);
      await page.locator('#portal-shop-search').waitFor({ state: 'visible' });
      const portalShopFontSize = await page
        .locator('#portal-shop-search')
        .evaluate(el => parseFloat(getComputedStyle(el).fontSize));
      assert.ok(portalShopFontSize >= 16, `Mobile portal shop search font-size must be >= 16px, got ${portalShopFontSize}px`);
      const portalOverflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      assert.ok(portalOverflow <= 0, `Mobile portal shop horizontal overflow at 390px: ${portalOverflow}px`);
      await page.screenshot({ path: path.join(output, 'member-shop-dark-390.png'), fullPage: true });
      await context.close();
    }
    console.log('PASS (10) Mobile 390x844 input font-size >= 16px');

    // Manager portal: /manager/products (dark + light) and /manager/products/new (dark)
    for (const theme of ['dark', 'light']) {
      const context = await browser.newContext({
        viewport: { width: 1440, height: 1000 },
        reducedMotion: 'reduce',
      });
      const page = await context.newPage();
      page.on('pageerror', err => errors.push(err.message));
      await page.addInitScript(t => {
        localStorage.setItem('scms_theme', t);
        localStorage.setItem(
          'fitcenter_auth_session',
          JSON.stringify({ id: '99', identifier: 'manager', name: 'Quản lý SÖL', role: 'CENTER_MANAGER' }),
        );
        localStorage.setItem('fitcenter_token', 'fixture-manager-token');
      }, theme);
      await attachRoutes(page, 'MANAGER');
      await page.goto(`${base}/manager/products`);
      await page.getByText('SÖL Whey Isolate').first().waitFor({ state: 'visible' });
      await page.screenshot({ path: path.join(output, `manager-products-${theme}-1440.png`), fullPage: true });

      if (theme === 'dark') {
        await page.goto(`${base}/manager/products/new`);
        await page.locator('form').first().waitFor({ state: 'visible' });
        await page.screenshot({ path: path.join(output, 'manager-product-editor-dark-1440.png'), fullPage: true });
      }
      await context.close();
    }
    console.log('PASS (11) /manager/products (dark/light) & /manager/products/new screenshots');

    assert.deepEqual(errors, [], `Browser runtime errors: ${errors.join('; ')}`);
    console.log('ALL SHOP UI VERIFICATION CHECKS PASSED');
  } finally {
    await browser.close();
  }
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
