// Stage the published files into _site/. The one transform is an esbuild bundle: src/main.js, the game modules it
// imports and the parts of the vendored Three.js build they use become a single minified _site/src/main.js, so a
// visitor downloads the Three.js code the game runs instead of the whole library. Nothing else is rewritten, and
// `npm start` still serves the unbundled source.
import { cp, mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { PUBLISHED, root } from './serve.mjs';

export const ENTRY = 'src/main.js';

export async function stage(out = join(root, '_site')) {
  await rm(out, { recursive: true, force: true });
  await mkdir(out, { recursive: true });
  for (const entry of PUBLISHED) await cp(join(root, entry), join(out, entry), { recursive: true });
  const { metafile } = await build({
    absWorkingDir: root,
    entryPoints: [ENTRY],
    outfile: join(out, ENTRY),
    bundle: true,
    format: 'esm',
    target: 'es2022',
    minify: true,
    charset: 'utf8',
    legalComments: 'inline', // the Three.js @license header stays with its code
    metafile: true,
    logLevel: 'warning',
  });
  // Modules folded into the bundle are not published a second time.
  const bundled = Object.keys(metafile.inputs).filter((file) => file !== ENTRY).sort();
  await Promise.all(bundled.map((file) => rm(join(out, file))));
  return { out, bundled, bytes: Object.values(metafile.outputs)[0].bytes };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { bundled, bytes } = await stage();
  console.log(`Staged ${PUBLISHED.join(', ')} in _site/. Bundled ${ENTRY} with ${bundled.join(', ')} (${bytes} bytes).`);
}
