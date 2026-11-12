import { readFile } from 'node:fs/promises';
import { test as base, expect } from '@playwright/test';
import { cabinetSha, origin } from '../scripts/cabinet.mjs';

export { expect };
export const candidate = `${origin}/mona-breaker/`;
// The exact policy index.html ships; the cabinet suite asserts the served document carries it unchanged.
export const CSP = "default-src 'self'; script-src 'self'; base-uri 'none'; form-action 'none'; object-src 'none'";
const SIBLING_STUB = '<!doctype html><title>Sibling stub</title><p>Sibling game stub</p>';

export const test = base.extend({
  // Every document the test touches (cabinet page, game frame, stubs) reports Content Security Policy violations here.
  cspViolations: async ({}, use) => { await use([]); },
  page: async ({ page, cspViolations }, use) => {
    const failures = [];
    const failed = [];
    page.on('pageerror', (error) => failures.push(error.message));
    page.on('console', (message) => { if (message.type() === 'error') failures.push(message.text()); });
    page.on('response', (response) => { if (response.status() >= 400) failures.push(`${response.status()} ${response.url()}`); });
    page.on('requestfailed', (request) => failed.push(request));
    await page.exposeFunction('__reportCspViolation', (violation) => cspViolations.push(violation));
    // Installed before any document script runs, so parse-time violations (inline scripts, styles) are caught too.
    await page.addInitScript(() => {
      document.addEventListener('securitypolicyviolation', (event) => {
        window.__reportCspViolation({
          document: location.href,
          directive: event.violatedDirective,
          blocked: event.blockedURI,
          source: `${event.sourceFile}:${event.lineNumber}`,
          sample: event.sample,
        });
      });
    });
    // Sibling games and the standalone Arcade backlink are isolated so tests do not depend on the network.
    await page.route('https://jdooley-clt.github.io/**', (route) => route.fulfill({ contentType: 'text/html', body: SIBLING_STUB }));
    await use(page);
    for (const request of failed) {
      const reason = request.failure()?.errorText;
      if (request.isNavigationRequest() && request.frame().isDetached() && ['net::ERR_ABORTED', 'cancelled'].includes(reason)) continue;
      failures.push(`${reason} ${request.url()}`);
    }
    expect(failures, 'No uncaught errors, console errors, or failed requests').toEqual([]);
    expect(cspViolations, 'No Content Security Policy violations in any document').toEqual([]);
  },
});

export const card = (page) => page.getByRole('button', { name: 'Play Mona Breaker', exact: true });
export const stageData = (frame, key) => frame.locator('#stage').getAttribute(`data-${key}`);

// The harness serves the pinned cabinet and exactly the built site; every spec checks that before navigating.
export async function expectServedBuild(request) {
  expect(await (await request.get('/health')).json()).toEqual({ cabinetSha });
  const served = await request.get(candidate);
  expect(served.ok()).toBeTruthy();
  expect(await served.text()).toBe(await readFile('_site/index.html', 'utf8'));
}

// A blank WebGL canvas compresses to almost nothing; a rendered board does not. The canvas is read back inside the
// animation frame that drew it (callbacks run in registration order, after the game's own), so the drawing buffer
// needs no preserving. A Playwright screenshot is not used because on WebKit it appends a <style> element to the
// document, which the game's Content Security Policy rightly blocks and reports.
const renderedBytes = (doc) =>
  doc.locator('#scene').evaluate((canvas) => new Promise((resolve) => requestAnimationFrame(() => resolve(canvas.toDataURL('image/png').length))));
const expectBoardRendered = (doc) => expect.poll(() => renderedBytes(doc), { message: 'WebGL board rendered', timeout: 30_000 }).toBeGreaterThan(20_000);

export async function readyGame(page) {
  const iframe = page.locator('#frame-host iframe');
  await expect(iframe).toHaveCount(1);
  await expect(iframe).toHaveAttribute('src', candidate);
  await expect.poll(() => page.frames().find((f) => f.url() === candidate)?.url()).toBe(candidate);
  const frame = page.frames().find((f) => f.url() === candidate);
  await expect.poll(() => stageData(frame, 'status'), { timeout: 30_000 }).toBe('ready');
  await expect(frame.locator('#arcade-link')).toBeHidden();
  await expectBoardRendered(frame);
  return frame;
}

export async function readyStandalone(page) {
  await page.goto(candidate);
  await expect.poll(() => stageData(page, 'status'), { timeout: 30_000 }).toBe('ready');
  await expect(page.locator('#arcade-link')).toBeVisible();
  await expectBoardRendered(page);
}

export async function launchWithSpace(page, frame) {
  const scroll = await page.evaluate(() => scrollY);
  await page.keyboard.press('Space');
  await expect.poll(() => stageData(frame, 'status')).toBe('playing');
  await expect(page.locator('#frame-host iframe')).toBeFocused();
  expect(await page.evaluate(() => scrollY), 'Space does not scroll the cabinet').toBe(scroll);
  expect(await frame.evaluate(() => scrollY), 'Space does not scroll the game document').toBe(0);
  const y = Number(await stageData(frame, 'ball-y'));
  await expect.poll(async () => Number(await stageData(frame, 'ball-y')), { message: 'ball travels' }).not.toBe(y);
}

// Resolves once two consecutive layouts of the element agree, i.e. fonts, the canvas resize and scrolling have settled.
export async function settledBox(locator) {
  let last = null;
  await expect.poll(async () => {
    const box = await locator.evaluate((el) => { const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; });
    const same = JSON.stringify(box) === JSON.stringify(last);
    last = box;
    return same;
  }, { message: 'layout settled' }).toBe(true);
  return last;
}
