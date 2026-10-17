#!/usr/bin/env node
/**
 * CI guard: the project must never acquire a payment gateway.
 *
 * The brief is unambiguous — payment is selected as an informational option and
 * settled offline. There is no online payment processing anywhere in this
 * application. This script fails the build if a payment provider, SDK, card
 * field or hosted payment surface is ever introduced, so the invariant cannot
 * be broken by accident in a later phase.
 *
 * Run with: npm run check:no-payment
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, extname } from 'node:path';

const ROOT = process.cwd();

const SKIP_DIRECTORIES = new Set([
  'node_modules',
  '.git',
  '.next',
  'coverage',
  'dist',
  'build',
  '.vercel',
  'test-results',
  'playwright-report',
]);

const SCANNED_EXTENSIONS = new Set([
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
  '.json',
  '.css',
  '.sql',
  '.md',
]);

/**
 * Files that legitimately discuss payments or card field names in order to
 * forbid them, strip them, or test that stripping. Naming a credential in a
 * redaction denylist or in the guard's own test suite is not a payment
 * integration.
 */
const ALLOWED_FILES = new Set([
  'scripts/check-no-payment-providers.mjs',
  'src/lib/logger.ts',
  'tests/logger.test.ts',
  'tests/payment-guard.test.ts',
  'IMPLEMENTATION_PLAN.md',
  'ARCHITECTURE.md',
  'CHANGELOG.md',
  'KNOWN_ISSUES.md',
  'REFERENCE_ANALYSIS.md',
  'DATABASE_SCHEMA.md',
  '.env.example',
  'README.md',
  'docs/SEO.md',
  'docs/SECURITY_HEADERS.md',
]);

/**
 * A line may opt out of the *content* checks by carrying this marker, either on
 * the line itself or on the line directly above it:
 *
 *     payment-guard:allow
 *
 * This exists for lines that name a forbidden term in order to forbid it — a
 * negative assertion in the database test suite, or a comment stating that no
 * card field is stored.
 *
 * Two deliberate restrictions keep the marker from becoming a way to smuggle a
 * real integration past the guard:
 *
 *   1. It only suppresses the *content* checks. A forbidden dependency or a
 *      payment webhook route is still reported, because a marker comment is not
 *      a reason to import a payment SDK.
 *
 *   2. It is only honoured in the files listed below. Every other file is
 *      checked unconditionally, so the marker cannot be introduced into
 *      application code as an escape hatch. Each entry here is a file that
 *      discusses card fields in order to rule them out.
 */
const ALLOW_MARKER = /payment-guard:allow/i;

const MARKER_ELIGIBLE_FILES = new Set([
  'supabase/migrations/0004_commerce.sql',
  'supabase/tests/40_order_and_inventory.sql',
]);

const FORBIDDEN_DEPENDENCIES = [
  '@stripe/',
  'stripe',
  'react-stripe-js',
  '@stripe/stripe-js',
  '@paypal/',
  'paypal',
  'braintree',
  '@braintree/',
  'squareup',
  '@square/',
  'adyen',
  '@adyen/',
  'klarna',
  'mollie',
  'worldpay',
  'checkout.com',
  'razorpay',
  'paystack',
  'flutterwave',
  'authorize.net',
  '2checkout',
  'paddle',
  'lemonsqueezy',
  '@lemonsqueezy/',
  'recurly',
  'chargebee',
];

/**
 * Patterns that indicate card data collection or a hosted payment surface.
 * Each is a regex tested against file content.
 *
 * Note on scope: this guard targets *collecting* payment data and *integrating*
 * a provider. It deliberately does not flag a bare mention of `cvv` or
 * `card_number` inside the redaction denylist in `src/lib/logger.ts`, because
 * naming a field in order to strip it is the opposite of collecting it. Those
 * two files are listed in `ALLOWED_FILES` below for that reason.
 */
const FORBIDDEN_CONTENT_PATTERNS = [
  { name: 'card number field', pattern: /\b(cc[-_]?number|card[-_]?number|cardnumber)\b/i },
  { name: 'card verification field', pattern: /\b(cvv|cvc|cvn|card[-_]?verification)\b/i },
  { name: 'card expiry field', pattern: /\b(card[-_]?expir|expiry[-_]?date|cc[-_]?exp)\b/i },
  {
    name: 'payment gateway host',
    pattern: /\b(checkout\.stripe\.com|js\.stripe\.com|paypal\.com\/sdk|braintreegateway)\b/i,
  },
  { name: 'payment iframe', pattern: /<iframe[^>]*(stripe|paypal|braintree|adyen)/i },
  { name: 'payment webhook', pattern: /\b(stripe|paypal|braintree|adyen)[-_]?webhook\b/i },
  { name: 'stripe secret key', pattern: /\bsk_(live|test)_[A-Za-z0-9]{10,}/ },
  { name: 'stripe publishable key', pattern: /\bpk_(live|test)_[A-Za-z0-9]{10,}/ },
];

/**
 * Patterns matched against the file *path*, not its content.
 *
 * A payment webhook is often identified by its route rather than by anything
 * written inside the handler — `src/app/api/stripe-webhook/route.ts` may
 * contain nothing but a function signature. Scanning content alone would miss
 * it, so the path is checked too.
 */
const FORBIDDEN_PATH_PATTERNS = [
  { name: 'payment webhook route', pattern: /(stripe|paypal|braintree|adyen|square)[-_]?webhook/i },
  {
    name: 'payment provider module',
    pattern: /(^|\/)(stripe|paypal|braintree|adyen|mollie|klarna)[-_.]/i,
  },
];

function walk(directory) {
  const entries = [];
  for (const entry of readdirSync(directory)) {
    if (SKIP_DIRECTORIES.has(entry)) continue;
    const fullPath = join(directory, entry);
    const stats = statSync(fullPath);
    if (stats.isDirectory()) {
      entries.push(...walk(fullPath));
    } else if (SCANNED_EXTENSIONS.has(extname(entry))) {
      entries.push(fullPath);
    }
  }
  return entries;
}

const violations = [];

for (const filePath of walk(ROOT)) {
  const relativePath = relative(ROOT, filePath).split('\\').join('/');
  if (ALLOWED_FILES.has(relativePath)) continue;

  const content = readFileSync(filePath, 'utf8');
  const lines = content.split('\n');

  for (const { name, pattern } of FORBIDDEN_PATH_PATTERNS) {
    if (pattern.test(relativePath)) {
      violations.push({
        file: relativePath,
        line: 1,
        rule: name,
        snippet: relativePath,
      });
    }
  }

  for (const dependency of FORBIDDEN_DEPENDENCIES) {
    const pattern = new RegExp(`['"\`]${dependency.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'i');
    lines.forEach((line, index) => {
      if (pattern.test(line)) {
        violations.push({
          file: relativePath,
          line: index + 1,
          rule: `payment dependency "${dependency}"`,
          snippet: line.trim().slice(0, 120),
        });
      }
    });
  }

  for (const { name, pattern } of FORBIDDEN_CONTENT_PATTERNS) {
    lines.forEach((line, index) => {
      if (!pattern.test(line)) return;
      // The marker only works in files that are allowed to carry it, and only
      // for the content checks. See MARKER_ELIGIBLE_FILES above.
      if (MARKER_ELIGIBLE_FILES.has(relativePath)) {
        if (ALLOW_MARKER.test(line) || (index > 0 && ALLOW_MARKER.test(lines[index - 1]))) return;
      }
      violations.push({
        file: relativePath,
        line: index + 1,
        rule: name,
        snippet: line.trim().slice(0, 120),
      });
    });
  }
}

if (violations.length > 0) {
  console.error('\nPayment-provider check FAILED.\n');
  console.error(
    'This project processes no payments online. Payment is an informational option that the\n' +
      'administrator settles offline. Remove the following:\n',
  );
  for (const violation of violations) {
    console.error(`  ${violation.file}:${violation.line}`);
    console.error(`    rule:    ${violation.rule}`);
    console.error(`    content: ${violation.snippet}\n`);
  }
  process.exit(1);
}

console.log('Payment-provider check passed: no gateway, SDK, card field or payment webhook found.');
