/**
 * Repeatable Lighthouse audit of the running production build.
 *
 * This exists because the obvious invocation measures the wrong document.
 *
 * The storefront opens on an age gate — a Radix dialog that covers the page and
 * makes the background `aria-hidden`. It reads its answer from `localStorage`,
 * so the server renders it absent and it appears only in the browser. Running
 * `lighthouse <url>` therefore audits the *gate*, not the page: every category
 * scores on a two-button modal. That is the same vacuous-pass shape the
 * accessibility audit documents, and a 100 from it means nothing.
 *
 * So this script launches one Chrome, sets the stored answer through a real
 * navigation (localStorage is origin-scoped, so it cannot be set before the
 * first load), and hands *that* browser's debugging port to Lighthouse. The
 * report is then of the page a returning visitor sees.
 *
 * Usage:
 *   node scripts/lighthouse-audit.mjs [--url <base>] [--runs N] [--out <dir>]
 *
 * Requires a server already listening — `npm run preview` is the honest way,
 * because a bare `next start` renders the fixture or an empty catalogue and the
 * scores would describe a page no customer sees.
 */

import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

// Both are CommonJS. A bare `import x from` fails to resolve their exports.
const require = createRequire(import.meta.url);
const chromeLauncher = require('chrome-launcher');
// Lighthouse's CJS entry exposes the runner on `.default`, not as the module.
const lighthouse = require('lighthouse').default ?? require('lighthouse');

const args = process.argv.slice(2);
const argOf = (name, fallback) => {
  const i = args.indexOf(name);
  return i !== -1 && args[i + 1] ? args[i + 1] : fallback;
};

const BASE = argOf('--url', 'http://127.0.0.1:12000');
const RUNS = Number(argOf('--runs', '3'));
const ONLY = argOf('--only', null);
const OUT = argOf('--out', '.lighthouse');

/**
 * Representative templates, not every route.
 *
 * One page per template is what the brief asks for, and it is also the honest
 * unit: two pages of the same template share every component, so they fail
 * together. The exceptions are noted where a route is its own template.
 */
const ROUTES = [
  { name: 'home', path: '/' },
  { name: 'shop', path: '/shop' },
  // A filtered shop page: the active-filter chips and the "clear all" control
  // only exist here, and they change the DOM above the grid.
  { name: 'shop-filtered', path: '/shop?condition=unworn&sort=price_asc' },
  { name: 'collections', path: '/collections' },
  { name: 'collection', path: '/collections/featured' },
  { name: 'brands', path: '/brands' },
  { name: 'brand', path: '/brands/rolex' },
  { name: 'model', path: '/brands/rolex/models/milgauss' },
  { name: 'product', path: null }, // discovered below
  { name: 'search', path: '/search?q=rolex' },
  { name: 'faq', path: '/pages/faq' },
  { name: 'contact', path: '/contact' },
];

/** A real product slug, read from the shop grid so the audit is seed-agnostic. */
async function discoverProductPath() {
  const response = await fetch(`${BASE}/shop`);
  if (!response.ok) return null;
  const html = await response.text();
  const match = html.match(/href="(\/products\/[a-z0-9-]+)"/);
  return match ? match[1] : null;
}

const CATEGORIES = ['performance', 'accessibility', 'best-practices', 'seo'];

/**
 * Desktop and the emulated-mobile profile Lighthouse uses by default.
 *
 * `preset: 'desktop'` is a CLI-only flag — the programmatic API ignores it, so
 * passing it here silently measured mobile twice and reported identical scores
 * for both viewports. The config object is the API's actual switch, and its
 * shape is asserted below rather than assumed.
 */
const desktopConfig = require('lighthouse').desktopConfig;
const PRESETS = [
  { name: 'mobile', config: undefined },
  { name: 'desktop', config: desktopConfig },
];

const median = (values) => {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};

async function seedAgeGate(port) {
  // Navigate once so the origin exists, then record the answer the gate reads.
  const url = `http://127.0.0.1:${port}/json/new?${encodeURIComponent(`${BASE}/`)}`;
  const created = await fetch(url, { method: 'PUT' }).then((r) => r.json());
  const { default: WebSocket } = await import('ws');
  const ws = new WebSocket(created.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.once('open', resolve);
    ws.once('error', reject);
  });
  let id = 0;
  const send = (method, params = {}) =>
    new Promise((resolve) => {
      const msgId = ++id;
      const onMessage = (raw) => {
        const msg = JSON.parse(raw.data ?? raw);
        if (msg.id === msgId) {
          ws.off('message', onMessage);
          resolve(msg.result);
        }
      };
      ws.on('message', onMessage);
      ws.send(JSON.stringify({ id: msgId, method, params }));
    });

  await send('Page.enable');
  // Wait for the app's effect to run before writing: the gate reads storage in
  // an effect, and a write before hydration is overwritten by the first read.
  await new Promise((r) => setTimeout(r, 2500));
  await send('Runtime.evaluate', {
    expression: `localStorage.setItem('lw:age-verified','yes')`,
  });
  const check = await send('Runtime.evaluate', {
    expression: `localStorage.getItem('lw:age-verified')`,
    returnByValue: true,
  });
  ws.close();
  await fetch(`http://127.0.0.1:${port}/json/close/${created.id}`);
  return check?.result?.value === 'yes';
}

async function main() {
  const product = await discoverProductPath();
  if (!product) {
    console.error(`Could not discover a product path from ${BASE}/shop.`);
    process.exit(1);
  }
  let routes = ROUTES.map((r) => (r.name === 'product' ? { ...r, path: product } : r));
  if (ONLY) routes = routes.filter((r) => r.name === ONLY);

  fs.mkdirSync(OUT, { recursive: true });

  const chrome = await chromeLauncher.launch({
    chromePath: process.env.CHROME_PATH || '/usr/bin/chromium',
    chromeFlags: ['--headless=new', '--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
  });

  const seeded = await seedAgeGate(chrome.port);
  console.log(
    `Age gate seeded in the audited browser: ${seeded ? 'yes' : 'NO — scores would measure the modal'}`,
  );
  if (!seeded) {
    await chrome.kill();
    process.exit(1);
  }

  const summary = [];

  for (const preset of PRESETS) {
    for (const route of routes) {
      const runs = [];
      for (let i = 0; i < RUNS; i += 1) {
        const result = await lighthouse(
          `${BASE}${route.path}`,
          {
            port: chrome.port,
            output: 'json',
            logLevel: 'error',
            onlyCategories: CATEGORIES,
          },
          preset.config,
        );
        const report = result.lhr;

        // A viewport that did not apply is a measurement bug, not a fast page:
        // it made both presets report identical numbers once. Assert it rather
        // than trust it.
        const formFactor = report.configSettings.formFactor;
        const expected = preset.name === 'desktop' ? 'desktop' : 'mobile';
        if (formFactor !== expected) {
          throw new Error(
            `Lighthouse ran ${formFactor} for the ${preset.name} preset on ${route.path}`,
          );
        }
        // A route that did not render is not a score. Lighthouse still reports
        // one, so the status is checked rather than trusted.
        const status = report.audits['final-screenshot']?.details?.data ? 'ok' : 'no-screenshot';
        runs.push({ report, status });
      }

      const okRuns = runs.filter((r) => r.status === 'ok');
      if (okRuns.length === 0) {
        console.log(`${preset.name.padEnd(8)} ${route.name.padEnd(16)} NO USABLE RUN`);
        summary.push({ viewport: preset.name, route: route.name, failed: true });
        continue;
      }

      const scores = {};
      for (const category of CATEGORIES) {
        const values = okRuns.map((r) => r.report.categories[category].score * 100);
        scores[category] = Math.round(median(values));
      }

      const base = path.join(OUT, `${preset.name}-${route.name}`);
      fs.writeFileSync(`${base}.json`, JSON.stringify(okRuns[0].report, null, 2));

      const failing = CATEGORIES.flatMap((category) =>
        okRuns[0].report.categories[category].auditRefs
          .filter((ref) => {
            const audit = okRuns[0].report.audits[ref.id];
            return audit && audit.score !== null && audit.score < 1 && ref.weight > 0;
          })
          .map((ref) => `${category}:${ref.id}`),
      );

      console.log(
        `${preset.name.padEnd(8)} ${route.name.padEnd(16)} ` +
          CATEGORIES.map((c) => `${c.slice(0, 4)}=${String(scores[c]).padStart(3)}`).join(' ') +
          (failing.length ? `  failing: ${failing.slice(0, 4).join(', ')}` : ''),
      );

      summary.push({ viewport: preset.name, route: route.name, path: route.path, scores, failing });
    }
  }

  fs.writeFileSync(path.join(OUT, 'summary.json'), JSON.stringify(summary, null, 2));
  await chrome.kill();

  const subHundred = summary.filter((s) => !s.failed && CATEGORIES.some((c) => s.scores[c] < 100));
  console.log(`\n${subHundred.length} viewport/route pairs below 100. Reports in ${OUT}/`);
  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
