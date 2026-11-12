import { readFile } from 'node:fs/promises';
import { cabinetRoot, candidateCatalog } from '../scripts/cabinet.mjs';
import { CSP, candidate, card, expect, expectServedBuild, launchWithSpace, readyGame, settledBox, stageData, test } from './harness.js';

test.beforeEach(async ({ page, request }) => {
  await expectServedBuild(request);
  await page.goto('/arcade/');
  await expect(card(page)).toBeVisible();
});

test('serves the real pinned cabinet with only the Mona Breaker entry changed', async ({ request }) => {
  const original = JSON.parse(await readFile(`${cabinetRoot}/games.json`, 'utf8'));
  expect(await (await request.get('/arcade/games.json')).json()).toEqual(candidateCatalog(original));
  for (const file of ['index.html', 'styles.css', 'src/app.js', 'src/catalog.js']) {
    expect(await (await request.get(`/arcade/${file}`)).text()).toBe(await readFile(`${cabinetRoot}/${file}`, 'utf8'));
  }
});

test('standalone Arcade link is keyboard accessible without controlling the game', async ({ page, isMobile }) => {
  test.skip(isMobile, 'Keyboard coverage runs on desktop.');
  await page.goto(candidate);
  await expect.poll(() => stageData(page, 'status'), { timeout: 30_000 }).toBe('ready');
  const link = page.getByRole('link', { name: 'More games in GitHub Arcade', exact: true });
  await expect(link).toBeVisible();
  await expect(link).toHaveAttribute('href', 'https://jdooley-clt.github.io/arcade/');
  expect(await link.getAttribute('target')).toBeNull();
  await page.locator('#primary').click();
  await expect.poll(() => stageData(page, 'status')).toBe('serving');
  await page.locator('#pause').focus();
  await page.keyboard.press('Tab');
  await expect(link).toBeFocused();
  const x = await stageData(page, 'paddle-x');
  await page.keyboard.down('ArrowRight');
  await page.waitForTimeout(150);
  await page.keyboard.up('ArrowRight');
  expect(await stageData(page, 'paddle-x')).toBe(x);
  for (const key of ['Space', 'p', 'm']) await page.keyboard.press(key);
  expect(await stageData(page, 'status')).toBe('serving');
  await expect(page.locator('#music')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#sound')).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL('https://jdooley-clt.github.io/arcade/');
});

for (const launch of ['mouse', 'keyboard']) {
  test(`${launch} launch: Space, arrows, pause and mute reach the game; reload and return clean up`, async ({ page, isMobile }) => {
    test.skip(isMobile, 'Keyboard coverage runs on desktop.');
    if (launch === 'mouse') await card(page).click();
    else { await card(page).focus(); await page.keyboard.press('Enter'); }
    let frame = await readyGame(page);
    await expect(page.locator('#frame-host iframe')).toBeFocused();
    await launchWithSpace(page, frame);

    const x = Number(await stageData(frame, 'paddle-x'));
    await page.keyboard.down('ArrowLeft');
    await expect.poll(async () => Number(await stageData(frame, 'paddle-x'))).toBeLessThan(x - 1);
    await page.keyboard.up('ArrowLeft');
    const left = Number(await stageData(frame, 'paddle-x'));
    await page.keyboard.down('d');
    await expect.poll(async () => Number(await stageData(frame, 'paddle-x'))).toBeGreaterThan(left + 1);
    await page.keyboard.up('d');

    for (const key of ['p', 'Escape']) {
      await page.keyboard.press(key);
      await expect.poll(() => stageData(frame, 'status')).toBe('paused');
      const y = await stageData(frame, 'ball-y');
      await page.waitForTimeout(250);
      expect(await stageData(frame, 'ball-y')).toBe(y);
      await expect(frame.locator('#message')).toBeVisible();
      await page.keyboard.press(key === 'p' ? 'p' : 'Space');
      await expect.poll(() => stageData(frame, 'status')).toBe('playing');
    }

    await page.keyboard.press('m');
    await expect(frame.locator('#music')).toHaveAttribute('aria-pressed', 'false');
    await expect(frame.locator('#sound')).toHaveAttribute('aria-pressed', 'false');
    await page.keyboard.press('m');
    await expect(frame.locator('#music')).toHaveAttribute('aria-pressed', 'true');

    await page.locator('#reload-game').click();
    await expect.poll(() => frame.isDetached()).toBe(true);
    frame = await readyGame(page);
    await launchWithSpace(page, frame);
    await page.locator('#return-button').click();
    await expect(page.locator('iframe')).toHaveCount(0);
    await expect(card(page)).toBeFocused();
    expect(frame.isDetached()).toBe(true);
  });
}

test('in-game buttons keep Space for the game and toggle their own settings', async ({ page, isMobile }) => {
  test.skip(isMobile, 'Keyboard coverage runs on desktop.');
  await card(page).click();
  const frame = await readyGame(page);
  await frame.locator('#primary').click();
  await expect.poll(() => stageData(frame, 'status')).toBe('serving');
  await frame.locator('#theme').click();
  await expect(frame.locator('html')).toHaveAttribute('data-theme', /dark|light/);
  const theme = await frame.locator('html').getAttribute('data-theme');
  await frame.locator('#sound').focus();
  await page.keyboard.press('Space');
  await expect.poll(() => stageData(frame, 'status')).toBe('playing');
  await expect(frame.locator('#sound'), 'Space did not activate the focused button').toHaveAttribute('aria-pressed', 'true');
  await frame.locator('#theme').click();
  await expect(frame.locator('html')).not.toHaveAttribute('data-theme', theme);
  await expect(frame.locator('html')).toHaveAttribute('data-theme', /dark|light/);
  await frame.locator('#help').click();
  await expect(frame.locator('#help-dialog')).toBeVisible();
  await expect.poll(() => stageData(frame, 'status')).toBe('paused');
  await frame.locator('#close-help').click();
  await expect(frame.locator('#help-dialog')).toBeHidden();
  await expect.poll(() => stageData(frame, 'status')).toBe('playing');
  await frame.locator('#help').click();
  await page.keyboard.press('Escape');
  await expect(frame.locator('#help-dialog')).toBeHidden();
  await expect.poll(() => stageData(frame, 'status')).toBe('playing');
});

test('switching to another game detaches the Mona Breaker frame', async ({ page, isMobile }) => {
  test.skip(isMobile, 'Lifecycle coverage runs on desktop.');
  await card(page).click();
  const frame = await readyGame(page);
  await launchWithSpace(page, frame);
  await page.goto('/arcade/#game/mona-maze');
  await expect(page.locator('#frame-host iframe')).toHaveCount(1);
  await expect(page.locator('#frame-host iframe')).toHaveAttribute('src', 'https://jdooley-clt.github.io/mona-maze/');
  await expect.poll(() => frame.isDetached()).toBe(true);
  await page.goBack();
  await expect(page.locator('#frame-host iframe')).toHaveAttribute('src', candidate);
});

test('Content Security Policy is served and nothing violates it across launch, play, and return', async ({ page, cspViolations, isMobile }) => {
  test.skip(isMobile, 'Runs once on desktop; the fixture still asserts zero violations in every test on every project.');
  await card(page).click();
  let frame = await readyGame(page);
  await expect(frame.locator('meta[http-equiv="Content-Security-Policy"]')).toHaveCount(1);
  await expect(frame.locator('meta[http-equiv="Content-Security-Policy"]')).toHaveAttribute('content', CSP);
  await expect(frame.locator('meta[name="referrer"]')).toHaveAttribute('content', 'strict-origin-when-cross-origin');
  expect(await frame.locator('script:not([src]), style').count(), 'No inline scripts or style elements that the policy would block').toBe(0);

  await launchWithSpace(page, frame);
  await page.keyboard.press('p');
  await expect.poll(() => stageData(frame, 'status')).toBe('paused');
  await page.keyboard.press('p');
  await expect.poll(() => stageData(frame, 'status')).toBe('playing');
  await frame.locator('#theme').click();
  await expect(frame.locator('html')).toHaveAttribute('data-theme', /dark|light/);
  await frame.locator('#help').click();
  await expect(frame.locator('#help-dialog')).toBeVisible();
  await frame.locator('#close-help').click();
  await expect(frame.locator('#help-dialog')).toBeHidden();
  await page.locator('#reload-game').click();
  await expect.poll(() => frame.isDetached()).toBe(true);
  frame = await readyGame(page);
  await launchWithSpace(page, frame);
  await page.locator('#return-button').click();
  await expect(page.locator('iframe')).toHaveCount(0);
  expect(cspViolations, 'No securitypolicyviolation events across launch, play, reload and return').toEqual([]);
});

for (const width of [320, 390]) {
  test(`touch at ${width}px: no overflow, drag steers, tap launches, controls reachable`, async ({ page, isMobile, browserName }) => {
    test.skip(!isMobile, 'Touch coverage runs on the mobile project.');
    await page.setViewportSize({ width, height: 800 });
    await page.goto('/arcade/#game/mona-breaker');
    const frame = await readyGame(page);
    for (const doc of [page, frame]) {
      const overflow = await doc.evaluate(() => document.documentElement.scrollWidth - innerWidth);
      expect(overflow, 'No horizontal overflow').toBeLessThanOrEqual(0);
    }
    const stage = frame.locator('#stage');
    await stage.scrollIntoViewIfNeeded();
    await frame.locator('#primary').tap();
    await expect.poll(() => stageData(frame, 'status')).toBe('serving');

    // Steer while the ball is still attached to the paddle: the paddle follows the drag exactly as in play,
    // and nothing can change the status underneath the test, so the outcome does not depend on how fast the
    // machine renders. Wait for the layout to settle and the paddle position to be published before touching.
    const inner = await settledBox(stage);
    await expect.poll(() => stageData(frame, 'paddle-x')).not.toBeNull();
    const before = Number(await stageData(frame, 'paddle-x'));
    if (browserName === 'chromium') {
      // Real touch input through the cabinet page and into the iframe.
      const session = await page.context().newCDPSession(page);
      const frameBox = await settledBox(page.locator('#frame-host iframe'));
      const at = (fx) => [{ x: frameBox.x + inner.x + inner.w * fx, y: frameBox.y + inner.y + inner.h * 0.7 }];
      await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: at(0.5) });
      for (const fx of [0.45, 0.35, 0.25, 0.15]) await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: at(fx) });
      await expect.poll(async () => Number(await stageData(frame, 'paddle-x'))).toBeLessThan(before - 1);
      await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    } else {
      // WebKit has no CDP touch stream; dispatch touch-typed pointer events to the canvas.
      await frame.locator('#scene').evaluate((el, box) => {
        const fire = (type, fx) => el.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: 7, pointerType: 'touch', isPrimary: true,
          clientX: box.x + box.w * fx, clientY: box.y + box.h * 0.7 }));
        fire('pointerdown', 0.5);
        for (const fx of [0.45, 0.35, 0.25, 0.15]) fire('pointermove', fx);
        fire('pointerup', 0.15);
      }, inner);
      await expect.poll(async () => Number(await stageData(frame, 'paddle-x'))).toBeLessThan(before - 1);
    }
    expect(await stageData(frame, 'status'), 'a drag is not a tap: the ball stays attached').toBe('serving');

    await stage.tap({ position: { x: inner.w / 2, y: inner.h * 0.6 } });
    await expect.poll(() => stageData(frame, 'status')).toBe('playing');
    // Pause right away so the controls walk below cannot race the ball.
    await frame.locator('#pause').tap();
    await expect.poll(() => stageData(frame, 'status')).toBe('paused');

    for (const id of ['theme', 'music', 'sound', 'help', 'new-game', 'pause', 'fx-actions', 'percentage']) {
      const control = frame.locator(`#${id}`);
      await control.scrollIntoViewIfNeeded();
      await expect(control).toBeInViewport();
      const r = await control.evaluate((el) => { const b = el.getBoundingClientRect(); return { left: b.left, right: b.right }; });
      expect(r.left).toBeGreaterThanOrEqual(0);
      expect(r.right).toBeLessThanOrEqual(width + 1);
    }
    await frame.locator('#pause').tap();
    await expect.poll(() => stageData(frame, 'status')).toBe('playing');
  });
}

test('reduced motion still plays', async ({ page, isMobile }) => {
  test.skip(isMobile, 'Runs once on desktop.');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await card(page).click();
  const frame = await readyGame(page);
  await launchWithSpace(page, frame);
});
