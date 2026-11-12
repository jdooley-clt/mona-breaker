import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { ENTRY, stage } from '../scripts/build.mjs';

// Raw bytes of everything `npm run build` stages (611,177 when the Three.js bundle landed; 812,537 before it). The test
// fails once the staged site grows more than 10% past it, so a heavier payload is a deliberate change to this number,
// not a drift.
const BASELINE_BYTES = 612_000;
const HEADROOM = 1.1;

async function staged(dir, prefix = '') {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const file = `${prefix}${entry.name}`;
    if (entry.isDirectory()) out.push(...await staged(join(dir, entry.name), `${file}/`));
    else {
      const bytes = await readFile(join(dir, entry.name));
      out.push({ file, bytes: bytes.length, gzip: gzipSync(bytes, { level: 9 }).length });
    }
  }
  return out;
}

test('the staged site stays within its size budget', async (t) => {
  const out = await mkdtemp(join(tmpdir(), 'mona-breaker-site-'));
  try {
    const { bundled } = await stage(out);
    const files = await staged(out);
    const total = files.reduce((sum, f) => ({ bytes: sum.bytes + f.bytes, gzip: sum.gzip + f.gzip }), { bytes: 0, gzip: 0 });
    t.diagnostic(`staged ${files.length} files, ${total.bytes} bytes raw, ${total.gzip} bytes gzipped`);
    assert.ok(total.bytes <= BASELINE_BYTES * HEADROOM,
      `staged ${total.bytes} bytes is more than 10% above the ${BASELINE_BYTES}-byte baseline; shrink the payload or raise the baseline on purpose`);

    // The bundle replaces the modules it contains: neither the game's own modules nor Three.js are published twice.
    assert.ok(bundled.includes('vendor/three.module.min.js') && bundled.includes('vendor/three.core.min.js'), 'Three.js is bundled');
    for (const file of bundled) assert.ok(!files.some((f) => f.file === file), `${file} is bundled, not staged`);
    const bundle = await readFile(join(out, ENTRY), 'utf8');
    assert.match(bundle, /@license[\s\S]{0,80}Three\.js Authors/, 'the Three.js license header ships inside the bundle');
    assert.ok(files.some((f) => f.file === 'vendor/three-LICENSE.txt'), 'the Three.js license file is published');
    assert.ok(files.some((f) => f.file === 'src/theme.js'), 'the theme bootstrap stays a separate classic script');
  } finally {
    await rm(out, { recursive: true, force: true });
  }
});
