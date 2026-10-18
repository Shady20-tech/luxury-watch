/**
 * Layout-aware accessibility and responsive audit of the running site.
 *
 * This complements `tests/a11y-shell.test.tsx`. That suite runs axe under jsdom,
 * which cannot lay out the document, so axe skips every geometry-dependent rule
 * there — colour contrast above all. This script drives a real Chromium against
 * a real build, so those rules run for real.
 *
 * It is a script rather than a Vitest test on purpose: it needs a server already
 * listening and a browser binary, neither of which belongs in the unit-test
 * job. Run it after `npm run build && npm run start`.
 *
 * Usage:
 *   node scripts/a11y-audit.mjs [base-url]
 *
 * Exit code is non-zero if any page has a critical or serious violation, or if
 * the shell overflows horizontally at a narrow viewport.
 */

import { chromium } from 'playwright';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const axePath = require.resolve('axe-core/axe.min.js');

const BASE = process.argv[2] ?? 'http://localhost:3000';

/** Pages that make up the shell and the templates built in this phase. */
const PAGES = [
  '/',
  '/collections/all',
  '/brands',
  '/brands/rolex',
  '/contact',
  '/pages/faq',
  '/design-system',
  // The cart and the wishlist are per-visitor and are not in the sitemap, but
  // they are the two surfaces this phase adds and both render chrome, cards and
  // interactive controls. Auditing them is the only check that catches a
  // contrast or overflow defect in the cart summary or the wishlist grid.
  '/cart',
  '/wishlist',
  // An unmatched path, so the not-found template is audited in every
  // configuration. `/brands/rolex` cannot stand in for it: it renders a real
  // brand page when a database is configured and only falls back to the 404
  // template when one is not, so the template would go unaudited in the very
  // configuration that CI runs.
  '/this-page-does-not-exist',
];

/** Widths worth checking. 320px is the narrowest phone still in use. */
const VIEWPORTS = [
  { name: 'mobile-320', width: 320, height: 720 },
  { name: 'mobile-390', width: 390, height: 844 },
  { name: 'tablet-768', width: 768, height: 1024 },
  { name: 'desktop-1440', width: 1440, height: 900 },
];

const SEVERITIES = ['critical', 'serious'];

async function auditPage(browser, path, viewport, { ageVerified = true } = {}) {
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    // Pin the colour scheme so contrast results are deterministic.
    colorScheme: 'light',
  });

  // The age gate is a modal that covers the page, so the page behind it is
  // `aria-hidden` and axe would audit the gate instead of the shell. Setting the
  // stored answer before any script runs means the ordinary pass audits the real
  // page; a separate pass below audits the gate itself while it is open.
  if (ageVerified) {
    await context.addInitScript(() => {
      try {
        window.localStorage.setItem('lw:age-verified', 'yes');
      } catch {
        // Storage unavailable; the gate will appear and be audited as the page.
      }
    });
  }

  const page = await context.newPage();

  const problems = [];
  try {
    await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle', timeout: 30_000 });

    // The gate is rendered by an effect, so it is not present in the initial
    // HTML. Wait for it when it is expected, so the audit sees the real state.
    if (!ageVerified) {
      await page
        .locator('[role="dialog"]')
        .waitFor({ state: 'visible', timeout: 5_000 })
        .catch(() => {});

      // A pass over a dialog that never opened would pass while proving nothing,
      // so the gate's presence is asserted rather than assumed.
      if ((await page.locator('[role="dialog"]').count()) === 0) {
        problems.push({
          kind: 'missing-gate',
          path,
          viewport: viewport.name,
          detail: 'the age gate did not open, so this pass proved nothing',
        });
      }
    }
    // Inject the same axe build the unit tests use, then run it in the page.
    // `axe` is attached to `window` by the injected script, so it is read from
    // there rather than imported; this callback is serialised and runs in the
    // browser, not in Node.
    await page.addScriptTag({ path: axePath });
    const results = await page.evaluate(async () => {
      return await window.axe.run(document, {
        resultTypes: ['violations'],
      });
    });

    for (const violation of results.violations) {
      if (SEVERITIES.includes(violation.impact)) {
        problems.push({
          kind: 'axe',
          path,
          viewport: viewport.name,
          id: violation.id,
          impact: violation.impact,
          help: violation.help,
          nodes: violation.nodes.slice(0, 3).map((node) => node.target.join(' ')),
        });
      }
    }

    // Horizontal overflow: a shell that scrolls sideways at 320px is broken on
    // the phones it will most often be read on.
    const overflow = await page.evaluate(() => {
      const doc = document.documentElement;
      const scrollWidth = doc.scrollWidth;
      const clientWidth = doc.clientWidth;
      if (scrollWidth <= clientWidth + 1) return null;

      // Name the widest offending element so the fix is obvious.
      let worst = { selector: 'html', width: 0 };
      for (const element of document.querySelectorAll('body *')) {
        const rect = element.getBoundingClientRect();
        if (rect.right > clientWidth + 1 && rect.width > worst.width) {
          const id = element.id ? `#${element.id}` : '';
          const cls =
            element.className && typeof element.className === 'string'
              ? `.${element.className.trim().split(/\s+/).slice(0, 3).join('.')}`
              : '';
          worst = {
            selector: `${element.tagName.toLowerCase()}${id}${cls}`,
            width: Math.round(rect.right),
          };
        }
      }
      return { scrollWidth, clientWidth, worst };
    });

    if (overflow) {
      problems.push({
        kind: 'overflow',
        path,
        viewport: viewport.name,
        ...overflow,
      });
    }
  } finally {
    await context.close();
  }

  return problems;
}

// Allow pointing at a Chromium already on the machine. CI installs the browser
// Playwright expects; a sandbox that already ships Chromium can reuse it via
// CHROMIUM_PATH instead of downloading a second copy.
const executablePath = process.env.CHROMIUM_PATH || undefined;
const browser = await chromium.launch(executablePath ? { executablePath } : {});
const allProblems = [];

try {
  for (const viewport of VIEWPORTS) {
    for (const path of PAGES) {
      const problems = await auditPage(browser, path, viewport);
      const status = problems.length === 0 ? 'ok  ' : 'FAIL';
      console.log(`  [${status}] ${viewport.name.padEnd(11)} ${path}`);
      allProblems.push(...problems);
    }
  }

  // The age gate is a modal, so it hides the page behind it and cannot be
  // audited in the pass above. It gets its own pass, with the stored answer
  // cleared, on the smallest viewport where it is most likely to be cramped.
  const gateViewport = VIEWPORTS[0];
  for (const path of ['/', '/collections/all']) {
    const problems = await auditPage(browser, path, gateViewport, { ageVerified: false });
    const status = problems.length === 0 ? 'ok  ' : 'FAIL';
    console.log(`  [${status}] ${gateViewport.name.padEnd(11)} ${path} (age gate open)`);
    allProblems.push(...problems);
  }
} finally {
  await browser.close();
}

console.log('');
if (allProblems.length === 0) {
  console.log(
    `No critical or serious issues, and no horizontal overflow, across ${PAGES.length} pages x ${VIEWPORTS.length} viewports.`,
  );
  process.exit(0);
}

console.error(`${allProblems.length} problem(s):`);
for (const problem of allProblems) {
  if (problem.kind === 'axe') {
    console.error(
      `  ${problem.viewport} ${problem.path}: [${problem.impact}] ${problem.id} — ${problem.help}`,
    );
    for (const node of problem.nodes) console.error(`      ${node}`);
  } else if (problem.kind === 'missing-gate') {
    console.error(`  ${problem.viewport} ${problem.path}: ${problem.detail}`);
  } else {
    console.error(
      `  ${problem.viewport} ${problem.path}: horizontal overflow ` +
        `(scrollWidth ${problem.scrollWidth} > clientWidth ${problem.clientWidth}); ` +
        `widest offender ${problem.worst.selector} ending at ${problem.worst.width}px`,
    );
  }
}
process.exit(1);
