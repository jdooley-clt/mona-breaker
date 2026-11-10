import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

// The real Commit Cabinet, pinned. Update deliberately after reviewing upstream changes.
export const cabinetSha = 'cdbd39c365f5daf50f47d06d10644d61d1572aaf';
export const cabinetRoot = resolve('.playwright-cabinet');
export const siteRoot = resolve('_site');
export const port = Number(process.env.CABINET_PORT || 4264);
export const origin = `http://127.0.0.1:${port}`;

// Used only when the pinned cabinet predates the Mona Breaker catalog entry.
export const fixtureEntry = {
  id: 'mona-breaker',
  title: 'Mona Breaker',
  description: 'Break commits. Squash bugs. Merge the pull request.',
  category: '3D brick breaker',
  url: '/mona-breaker/',
  repository: 'https://github.com/jdooley-clt/mona-breaker',
  art: './assets/mona-maze.png',
  accent: 'mint',
  controls: [{ keys: 'Mouse / arrows / A-D / drag', action: 'Move' }, { keys: 'Space / click / tap', action: 'Launch' }],
  instructions: 'Harness fixture entry.',
  viewport: { layout: 'document', height: 1040, mobileHeight: 1080 },
};

export function verifyCabinet() {
  const git = (...args) => execFileSync('git', ['-C', cabinetRoot, ...args], { encoding: 'utf8' }).trim();
  if (git('rev-parse', 'HEAD') !== cabinetSha || git('status', '--porcelain')) {
    throw new Error(`Cabinet must be a clean checkout of ${cabinetSha}. Remove ${cabinetRoot} and run npm run cabinet:setup.`);
  }
}

export function candidateCatalog(original) {
  const catalog = structuredClone(original);
  const entry = catalog.find((game) => game.id === 'mona-breaker');
  if (entry) entry.url = '/mona-breaker/';
  else catalog.push(structuredClone(fixtureEntry));
  return catalog;
}
