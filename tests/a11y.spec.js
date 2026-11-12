import AxeBuilder from '@axe-core/playwright';
import { card, expect, expectServedBuild, readyGame, readyStandalone, stageData, test } from './harness.js';

// Violations at these impacts fail the gate; moderate and minor results are attached to the report only.
const GATE = ['critical', 'serious'];
// axe frame path for everything inside the embedded game; `html` keeps page-level rules such as html-has-lang active.
const GAME_FRAME = ['#frame-host iframe', 'html'];

const describe = (result) => `${result.id} [${result.impact}] ${result.nodes.map((n) => n.target.join(' >> ')).join(', ')}`;

function builder(page) {
  // WCAG 2.5.3 Label in Name (label-content-name-mismatch) is still experimental in axe-core, so it is switched on explicitly.
  return new AxeBuilder({ page }).options({ rules: { 'label-content-name-mismatch': { enabled: true } } });
}

async function audit(page, state, { scope } = {}) {
  const axe = builder(page);
  if (scope) axe.include(scope);
  const results = await axe.analyze();
  await test.info().attach(`axe: ${state}`, {
    contentType: 'application/json',
    body: JSON.stringify({ url: results.url, violations: results.violations.map(describe), incomplete: results.incomplete.map(describe) }, null, 2),
  });
  const gated = results.violations.filter((violation) => GATE.includes(violation.impact)).map(describe);
  expect(gated, `${state}: no serious or critical accessibility violations`).toEqual([]);
  return results;
}

async function launch(page, doc) {
  await page.keyboard.press('Space');
  await expect.poll(() => stageData(doc, 'status')).toBe('playing');
}

async function setTheme(page, theme) {
  if ((await page.locator('html').getAttribute('data-theme')) === theme) return;
  await page.locator('#theme').click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
}

// Software WebGL at the phones' 2-3x device pixel ratio starves the whole renderer; axe results do not depend on it.
test.use({ deviceScaleFactor: 1 });

test.beforeEach(async ({ request }) => {
  await expectServedBuild(request);
});

test('standalone: start, serving, paused and help states pass', async ({ page, isMobile }) => {
  test.setTimeout(300_000);
  // Themes only change colours, which do not depend on the viewport, so the dark theme is audited on desktop.
  const themes = isMobile ? ['light'] : ['light', 'dark'];
  await readyStandalone(page);
  const ready = await audit(page, 'standalone ready (light)');
  const ran = [...ready.passes, ...ready.incomplete, ...ready.violations].some((result) => result.id === 'label-content-name-mismatch');
  expect(ran, 'the Label in Name rule is active').toBe(true);
  if (themes.includes('dark')) {
    await setTheme(page, 'dark');
    await audit(page, 'standalone ready (dark)');
    await setTheme(page, 'light');
  }

  await page.locator('#primary').click();
  await expect.poll(() => stageData(page, 'status')).toBe('serving');
  await audit(page, 'standalone serving');
  await launch(page, page);
  await page.keyboard.press('p');
  await expect.poll(() => stageData(page, 'status')).toBe('paused');
  for (const theme of themes) {
    await setTheme(page, theme);
    await audit(page, `standalone paused (${theme})`);
  }

  for (const theme of themes) {
    // The open dialog is modal, so the theme is switched while it is closed.
    await setTheme(page, theme);
    await page.locator('#help').click();
    await expect(page.locator('#help-dialog')).toBeVisible();
    await audit(page, `standalone help dialog (${theme})`);
    await page.locator('#close-help').click();
    await expect(page.locator('#help-dialog')).toBeHidden();
  }
});

test('standalone: game over passes in both themes', async ({ page, isMobile, browserName }) => {
  test.skip(isMobile || browserName !== 'chromium', 'Playing out three lives runs once, on desktop Chromium.');
  test.setTimeout(300_000);
  await readyStandalone(page);
  await page.locator('#primary').click();
  await expect.poll(() => stageData(page, 'status')).toBe('serving');
  // Park the paddle at the left edge; with nothing under it, every launched ball is lost.
  const scene = await page.locator('#scene').boundingBox();
  await page.mouse.move(scene.x + 2, scene.y + scene.height * 0.7);
  await expect.poll(async () => Number(await stageData(page, 'paddle-x')), { timeout: 15_000 }).toBeLessThan(-4);
  // Three lives, with headroom for a shield pick-up or a lucky bounce off the parked paddle.
  for (let launches = 0; launches < 12 && (await stageData(page, 'status')) !== 'over'; launches++) {
    await launch(page, page);
    await expect.poll(() => stageData(page, 'status'), { message: 'ball lost', timeout: 60_000 }).toMatch(/^(serving|over)$/);
  }
  expect(await stageData(page, 'status')).toBe('over');
  await expect(page.locator('#message')).toBeVisible();
  await audit(page, 'standalone game over (light)');
  await setTheme(page, 'dark');
  await audit(page, 'standalone game over (dark)');
});

test('cabinet: the embedded game passes at start, paused and with the help dialog open', async ({ page }) => {
  test.setTimeout(240_000);
  await page.goto('/arcade/');
  await card(page).click();
  const frame = await readyGame(page);
  await audit(page, 'cabinet ready', { scope: GAME_FRAME });
  await frame.locator('#primary').click();
  await expect.poll(() => stageData(frame, 'status')).toBe('serving');
  await launch(page, frame);
  await page.keyboard.press('p');
  await expect.poll(() => stageData(frame, 'status')).toBe('paused');
  await audit(page, 'cabinet paused', { scope: GAME_FRAME });
  await frame.locator('#help').click();
  await expect(frame.locator('#help-dialog')).toBeVisible();
  await audit(page, 'cabinet help dialog', { scope: GAME_FRAME });
  await frame.locator('#close-help').click();
  await expect(frame.locator('#help-dialog')).toBeHidden();

  // The pinned cabinet page around the frame belongs to the arcade repository: report it, do not gate on it.
  const whole = await builder(page).analyze();
  const outside = whole.violations
    .map((violation) => ({ ...violation, nodes: violation.nodes.filter((node) => !node.target[0].includes('iframe')) }))
    .filter((violation) => violation.nodes.length);
  await test.info().attach('axe: cabinet page outside the game frame', {
    contentType: 'application/json',
    body: JSON.stringify({ url: whole.url, violations: outside.map(describe) }, null, 2),
  });
  test.info().annotations.push({ type: 'cabinet page', description: outside.length ? outside.map(describe).join('; ') : 'no violations outside the game frame' });
});

test('the gate fails on an injected violation and passes once it is removed', async ({ page, isMobile }) => {
  test.skip(isMobile, 'Runs once on desktop.');
  await readyStandalone(page);
  await page.evaluate(() => {
    const canary = document.createElement('button');
    canary.id = 'axe-canary';
    document.querySelector('main').append(canary);
  });
  await expect(audit(page, 'standalone with an unnamed button')).rejects.toThrow(/button-name \[critical\] #axe-canary/);
  await page.evaluate(() => document.getElementById('axe-canary').remove());
  await audit(page, 'standalone after removing the unnamed button');
});
