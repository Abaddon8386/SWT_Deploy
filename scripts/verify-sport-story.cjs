// Local Vite server; Playwright supplied through NODE_PATH. No production API writes.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright-core');

(async () => {
  const browser = await chromium.launch({ headless: true, ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}) });
  const output = process.env.PUBLIC_UI_OUTPUT ? path.resolve(process.env.PUBLIC_UI_OUTPUT) : path.resolve(__dirname, '../docs/ui-review/sport-story');
  fs.mkdirSync(output, { recursive: true });
  const page = await browser.newPage({ reducedMotion: 'no-preference' });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/api/v1/public/catalog', route => route.fulfill({ json: { data: require('./public-catalog-fixture.cjs') } }));
  await page.route('**/accounts.google.com/gsi/**', route => route.fulfill({ body: '', contentType: 'text/javascript' }));
  const scroll = async y => {
    await page.evaluate(y => window.scrollTo({ top: y, behavior: 'instant' }), y);
    await page.waitForTimeout(80);
  };
  const center = async index => {
    const y = await page.locator('.fit-sport-story-step').nth(index).evaluate(el => scrollY + el.getBoundingClientRect().top + el.offsetHeight / 2 - innerHeight / 2);
    await scroll(y);
    await page.waitForFunction(index => document.querySelectorAll('.fit-sport-story-step')[index].classList.contains('is-active'), index);
    await page.waitForFunction(index => document.querySelectorAll('.fit-sport-story-visual')[index].classList.contains('is-active') && !document.querySelector('.fit-sport-story-visual.is-leaving'), index);
    await page.waitForTimeout(550);
    await page.waitForFunction(() => {
      const sticky = document.querySelector('.fit-sport-story-sticky');
      if (getComputedStyle(sticky).display === 'none') return true;
      const visual = document.querySelector('.fit-sport-story-visual.is-active');
      const image = visual?.querySelector('img');
      return visual && getComputedStyle(visual).opacity === '1' && image?.complete && image.naturalWidth > 0;
    });
  };
  try {
    for (const theme of ['light', 'dark']) for (const [width, height] of [[375, 667], [390, 844], [844, 390], [768, 650], [1024, 600], [1280, 600], [1440, 900], [1920, 900], [2560, 1000]]) {
      await page.setViewportSize({ width, height });
      await page.goto(process.env.PUBLIC_UI_URL || 'http://127.0.0.1:5173');
      await page.evaluate(theme => { localStorage.setItem('scms_theme', theme); document.documentElement.dataset.theme = theme; }, theme);
      await page.locator('.fit-sport-story.is-enhanced').waitFor();
      await page.evaluate(() => document.fonts.ready);
      assert.equal(await page.locator('.fit-sport-story-step').count(), 4);
      assert.equal(await page.locator('.fit-sport-story-step a').count(), 4);
      assert.equal(await page.locator('.fit-sport-story [inert], .fit-sport-stack-deck').count(), 0);
      await center(0);
      const overflow = await page.locator('.fit-sport-story-step').evaluateAll(steps => steps.some(el => el.scrollHeight > el.clientHeight + 2));
      assert.equal(overflow, false, 'No internal scroll or clipped sport content');
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'No document overflow');
      if (width > 1024) {
        await center(1);
        const sticky = page.locator('.fit-sport-story-sticky');
        assert.equal(await sticky.evaluate(el => getComputedStyle(el).position), 'sticky');
        const top = await sticky.evaluate(el => el.getBoundingClientRect().top);
        await scroll(await page.evaluate(() => scrollY + 50));
        const after = await sticky.evaluate(el => el.getBoundingClientRect().top);
        assert.ok(Math.abs(after - top) < 2, 'Image stays pinned while text scrolls');
        assert.equal(await page.locator('.fit-sport-story-inline').first().isVisible(), false);
        for (const index of [1, 2, 3, 2, 0]) await center(index);
        // Observe the actual two-phase animation, rather than just its final class.
        const target = await page.locator('.fit-sport-story-step').nth(1).evaluate(el => scrollY + el.getBoundingClientRect().top + el.offsetHeight / 2 - innerHeight / 2);
        await page.evaluate(y => {
          window.sportTransitions = [];
          window.sportTransitionObserver = new MutationObserver(() => {
            for (const el of document.querySelectorAll('.fit-sport-story-visual.is-active')) {
              window.sportTransitions.push(getComputedStyle(el).animationName);
            }
          });
          window.sportTransitionObserver.observe(document.querySelector('.fit-sport-story-panel'), { attributes: true, subtree: true });
          scrollTo({ top: y, behavior: 'instant' });
        }, target);
        await center(1);
        const animations = await page.evaluate(() => {
          window.sportTransitionObserver.disconnect();
          return window.sportTransitions;
        });
        assert.ok(animations.includes('fit-sport-story-exit'), 'Outgoing image plays the exit');
        assert.ok(animations.includes('fit-sport-story-enter'), 'Incoming image plays the entrance after the exit');
        await center(3);
        await page.locator('#trainers').scrollIntoViewIfNeeded();
        assert.ok(await sticky.evaluate(el => el.getBoundingClientRect().bottom < innerHeight), 'Sticky releases at the section boundary');
      } else {
        assert.equal(await page.locator('.fit-sport-story-sticky').isVisible(), false);
        for (let index = 0; index < 4; index++) {
          assert.equal(await page.locator('.fit-sport-story-inline').nth(index).isVisible(), true);
          assert.equal(await page.locator('.fit-sport-story-step').nth(index).evaluate(el => getComputedStyle(el).opacity), '1');
        }
      }
      await center(width > 1024 ? 1 : 0);
      if ([390, 1440, 2560].includes(width)) await page.screenshot({ path: path.join(output, `${theme}-${width}x${height}.png`) });
      console.log(`PASS ${theme} ${width}x${height}: layout, readable content, forward/reverse motion, boundary release`);
    }
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await center(2);
    assert.equal(await page.locator('.fit-sport-story-sticky').isVisible(), false);
    assert.equal(await page.locator('.fit-sport-story-inline').count(), 4);
    assert.equal(await page.locator('.fit-sport-story-step').evaluateAll(steps => steps.every(el => getComputedStyle(el).opacity === '1')), true);
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await center(0);
    await page.locator('.fit-sport-story-step a').nth(3).focus();
    await page.waitForFunction(() => document.querySelector('.fit-sport-story-step.is-active')?.getAttribute('data-sport') === 'boxing');
    assert.equal(await page.locator('.fit-sport-story-step').nth(3).evaluate(el => getComputedStyle(el).opacity), '1');
    const beforeWheel = await page.evaluate(() => scrollY);
    await page.mouse.wheel(0, 160);
    await page.waitForFunction(y => scrollY > y, beforeWheel);
    assert.deepEqual(errors, []);
    // A missing observer must still leave every image and every link available.
    await page.addInitScript(() => { window.IntersectionObserver = undefined; });
    await page.reload();
    await page.locator('.fit-sport-story-step').first().waitFor();
    assert.equal(await page.locator('.fit-sport-story.is-enhanced').count(), 0);
    for (let index = 0; index < 4; index++) assert.equal(await page.locator('.fit-sport-story-inline').nth(index).isVisible(), true);
    console.log('PASS live reduced motion, keyboard focus, native wheel and no-observer fallback');
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
