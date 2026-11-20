#!/usr/bin/env node
/**
 * CI guard: every database test suite must be runnable inside a transaction.
 *
 * `scripts/db-verify.sh` wraps each suite in `begin; … rollback;` so that a suite
 * leaves no rows behind. Without that, the suites' published fixture products
 * and brands reached the public catalogue and the sitemap of any preview built on
 * the verified database (G66).
 *
 * The wrapper is only correct while the suites stay compatible with it. Two ways
 * a later edit could silently break it, both of which this script rejects:
 *
 *   1. Transaction control inside a suite. A `commit;` would make the rollback a
 *      no-op and the fixtures would leak again — silently, because every
 *      assertion would still pass.
 *   2. A statement Postgres refuses to run inside a transaction block
 *      (`CREATE INDEX CONCURRENTLY`, `VACUUM`, `CREATE DATABASE`, `ALTER SYSTEM`,
 *      `CREATE TABLESPACE`). The suite would fail with an error that names the
 *      statement, not the wrapper, which reads like a broken test.
 *
 * Run with: npm run check:test-isolation
 */

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const TESTS_DIR = join(process.cwd(), 'supabase', 'tests');

/** A suite file is `NN_name.sql`; the shim is `00_` and is not a suite. */
const SUITE_PATTERN = /^\d{2}_.*\.sql$/;
const SHIM = '00_supabase_shim.sql';

const failures = [];

function stripSqlComments(sql) {
  // Remove block comments first, then line comments, so a commented-out `commit;`
  // is not reported. This is deliberately simple: it does not need to handle a
  // semicolon inside a string literal, because no suite has one in a comment.
  // Newlines are preserved so a reported line number still points at the real
  // line in the file.
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, (comment) => comment.replace(/[^\n]/g, ' '))
    .replace(/--[^\n]*/g, ' ');
}

function checkTransactionControl(file, sql) {
  // `end;` is deliberately not checked: it closes every PL/pgSQL block in these
  // suites, so flagging it would reject all of them. It is a synonym for COMMIT
  // in plain SQL, but a suite that meant it that way would be the only one, and
  // the `commit;` check would not see it — a residual risk accepted because the
  // alternative flags correct code.
  const patterns = [
    { re: /^\s*commit\s*;/gim, what: 'COMMIT' },
    { re: /^\s*rollback\s*;/gim, what: 'ROLLBACK' },
    { re: /^\s*begin\s*;/gim, what: 'BEGIN' },
    { re: /^\s*start\s+transaction\s*;/gim, what: 'START TRANSACTION' },
    { re: /^\s*abort\s*;/gim, what: 'ABORT' },
  ];

  for (const { re, what } of patterns) {
    const match = re.exec(sql);
    if (match) {
      const line = sql.slice(0, match.index).split('\n').length;
      failures.push(
        `${file}:${line} contains ${what}. db-verify.sh wraps each suite in a ` +
          `transaction, and transaction control inside a suite defeats it. ` +
          `Remove the statement.`,
      );
    }
  }
}

function checkNonTransactionalStatements(file, sql) {
  const banned = [
    /create\s+index\s+concurrently\b/i,
    /^(\s*)vacuum\b/im,
    /^(\s*)create\s+database\b/im,
    /^(\s*)drop\s+database\b/im,
    /^(\s*)alter\s+system\b/im,
    /^(\s*)create\s+tablespace\b/im,
    /^(\s*)drop\s+tablespace\b/im,
    /^(\s*)reindex\b(?!\s*\(?\s*(table|index|schema)\s+[\w.]+\s*;)/im,
  ];

  for (const re of banned) {
    const match = re.exec(sql);
    if (match) {
      const line = sql.slice(0, match.index).split('\n').length;
      failures.push(
        `${file}:${line} contains a statement Postgres refuses inside a ` +
          `transaction (${match[0].trim().slice(0, 40)}). db-verify.sh wraps ` +
          `each suite in a transaction, so this suite cannot run there.`,
      );
    }
  }
}

const files = readdirSync(TESTS_DIR)
  .filter((name) => SUITE_PATTERN.test(name) && name !== SHIM)
  .sort();

if (files.length === 0) {
  console.error(`No suites found in ${TESTS_DIR}.`);
  process.exit(1);
}

for (const name of files) {
  const sql = stripSqlComments(readFileSync(join(TESTS_DIR, name), 'utf8'));
  checkTransactionControl(name, sql);
  checkNonTransactionalStatements(name, sql);
}

if (failures.length > 0) {
  console.error('Database test suites must be runnable inside a transaction:\n');
  for (const failure of failures) console.error(`  ${failure}`);
  console.error(`\n${failures.length} problem(s) found across ${files.length} suites.`);
  process.exit(1);
}

console.log(`${files.length} database test suites are transaction-safe.`);
