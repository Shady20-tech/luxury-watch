#!/usr/bin/env node
/**
 * Local stand-in for Supabase's GoTrue auth server.
 *
 * Why this exists
 * ---------------
 * `npm run preview` brings up PostgREST, the prefix proxy and Next.js, but not
 * GoTrue. Without an auth server nothing can obtain a session cookie, so the
 * admin area can only ever be verified as *redirecting an anonymous caller* —
 * which proves the guard but not the signed-in write path behind it (H1).
 *
 * This server implements the handful of GoTrue endpoints the app actually calls,
 * and no more:
 *
 *   POST /auth/v1/token?grant_type=password   sign in
 *   GET  /auth/v1/user                        validate the bearer token
 *   POST /auth/v1/logout                      sign out
 *   POST /auth/v1/token?grant_type=refresh_token
 *
 * The token it mints is a real HS256 JWT signed with the same secret PostgREST
 * was started with, carrying `sub` and `role: authenticated`. PostgREST verifies
 * that signature and applies RLS as the authenticated user, so the requests that
 * follow are the genuine client path — `supabase-js` → PostgREST → RLS — rather
 * than a bypass. `auth.uid()` reads the `sub` claim, so the row a signed-in
 * request writes is attributed to that user by the database itself.
 *
 * Credentials are checked against `auth.users.encrypted_password` using
 * `extensions.crypt()` — pgcrypto, which Supabase installs into the `extensions`
 * schema — and that is the same bcrypt comparison GoTrue performs, so a wrong
 * password fails here for the same reason it fails in production.
 *
 * This is a development and verification tool only. It is never deployed, and it
 * refuses to start unless an explicit `--allow-insecure` flag is passed, so it
 * cannot be launched by accident against anything that matters.
 *
 * Usage
 * -----
 *   node scripts/dev-auth-stub.mjs --port 3003 \
 *     --jwt-secret <secret> --pg-url <postgres://...> [--allow-insecure]
 */

import crypto from 'node:crypto';
import http from 'node:http';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

function readArg(name, fallback) {
  const index = process.argv.indexOf(`--${name}`);
  return index !== -1 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

const PORT = Number(readArg('port', '3003'));
const JWT_SECRET = readArg('jwt-secret', '');
const PG_URL = readArg('pg-url', '');
const ALLOW_INSECURE = process.argv.includes('--allow-insecure');

// A year: the preview is not a session-lifetime test, and an expiring token mid
// walk would fail the audit for a reason unrelated to what it measures.
const TOKEN_TTL_SECONDS = 31_536_000;

const IS_ENTRY_POINT = process.argv[1] && import.meta.url === `file://${process.argv[1]}`;

if (IS_ENTRY_POINT) {
  if (!ALLOW_INSECURE) {
    console.error(
      'Refusing to start without --allow-insecure. This server accepts any ' +
        'account in the local database and must never be exposed.',
    );
    process.exit(1);
  }
  if (!JWT_SECRET) {
    console.error('Missing --jwt-secret; PostgREST would reject every token.');
    process.exit(1);
  }
  if (!PG_URL) {
    console.error('Missing --pg-url; cannot verify credentials.');
    process.exit(1);
  }
}

function b64url(input) {
  return Buffer.from(input).toString('base64url');
}

/** Mint an HS256 JWT PostgREST accepts, with `sub` so `auth.uid()` resolves. */
export function mintAccessToken(userId, email, secret = JWT_SECRET) {
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = b64url(
    JSON.stringify({
      sub: userId,
      email,
      role: 'authenticated',
      aud: 'authenticated',
      iss: 'lw-preview-auth-stub',
      iat: now,
      exp: now + TOKEN_TTL_SECONDS,
      session_id: crypto.randomUUID(),
    }),
  );
  const signingInput = `${header}.${payload}`;
  const signature = crypto.createHmac('sha256', secret).update(signingInput).digest('base64url');
  return `${signingInput}.${signature}`;
}

/** Decode without verifying. Safe here: this server issued the token. */
function readSubject(token) {
  try {
    const [, payload] = token.split('.');
    const claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    return typeof claims.sub === 'string' ? claims : null;
  } catch {
    return null;
  }
}

async function psql(sql) {
  const { stdout } = await execFileAsync('psql', [PG_URL, '-tAqc', sql], {
    env: { ...process.env, PGCONNECT_TIMEOUT: '5' },
  });
  return stdout.trim();
}

function sqlLiteral(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

/**
 * Verify a password against `auth.users.encrypted_password`.
 *
 * The comparison runs in Postgres via `crypt()`, which is bcrypt — the same
 * function GoTrue uses. Doing it in the database keeps the hash out of this
 * process and makes a wrong password fail for the same reason it would in
 * production.
 */
async function verifyCredentials(email, password) {
  const row = await psql(
    `select id || E'\\t' || email || E'\\t' ||
            coalesce((encrypted_password = extensions.crypt(${sqlLiteral(password)},
              encrypted_password))::text, 'false')
       from auth.users
      where lower(email) = lower(${sqlLiteral(email)})
      limit 1`,
  );
  if (!row) return null;
  const [id, userEmail, matches] = row.split('\t');
  if (matches !== 'true') return null;
  return { id, email: userEmail };
}

async function readUserById(id) {
  const row = await psql(
    `select id || E'\\t' || coalesce(email, '') || E'\\t' ||
            coalesce(to_char(created_at, 'YYYY-MM-DD"T"HH24:MI:SSOF'), '')
       from auth.users where id = ${sqlLiteral(id)} limit 1`,
  );
  if (!row) return null;
  const [userId, email, createdAt] = row.split('\t');
  return { id: userId, email, createdAt };
}

function userPayload(user) {
  return {
    id: user.id,
    aud: 'authenticated',
    role: 'authenticated',
    email: user.email,
    email_confirmed_at: user.createdAt || new Date().toISOString(),
    confirmed_at: user.createdAt || new Date().toISOString(),
    app_metadata: { provider: 'email', providers: ['email'] },
    user_metadata: {},
    identities: [],
    created_at: user.createdAt || new Date().toISOString(),
  };
}

function sessionPayload(user) {
  return {
    access_token: mintAccessToken(user.id, user.email),
    token_type: 'bearer',
    expires_in: TOKEN_TTL_SECONDS,
    expires_at: Math.floor(Date.now() / 1000) + TOKEN_TTL_SECONDS,
    refresh_token: `rt.${user.id}.${crypto.randomUUID()}`,
    user: userPayload(user),
  };
}

function sendJson(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'content-type': 'application/json',
    'content-length': Buffer.byteLength(payload),
  });
  res.end(payload);
}

function bearerToken(req) {
  const header = req.headers.authorization ?? '';
  const match = /^Bearer\s+(.+)$/i.exec(header);
  return match ? match[1] : null;
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (chunks.length === 0) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    return {};
  }
}

export const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const path = url.pathname.replace(/^\/auth\/v1/, '');

  try {
    if (req.method === 'POST' && path === '/token') {
      const grantType = url.searchParams.get('grant_type');
      const body = await readBody(req);

      if (grantType === 'refresh_token') {
        // The refresh token carries the subject (`rt.<userId>.<nonce>`) so a
        // refresh resolves the same user without server-side session state.
        const userId = String(body.refresh_token ?? '').split('.')[1] ?? '';
        const user = /^[0-9a-f-]{36}$/i.test(userId) ? await readUserById(userId) : null;
        if (!user) {
          sendJson(res, 400, {
            error: 'invalid_grant',
            error_description: 'Invalid refresh token',
          });
          return;
        }
        sendJson(res, 200, sessionPayload(user));
        return;
      }

      const user = await verifyCredentials(body.email ?? '', body.password ?? '');
      if (!user) {
        // One message for an unknown address and a wrong password, matching
        // GoTrue and the app's own enumeration defence.
        sendJson(res, 400, {
          error: 'invalid_grant',
          error_description: 'Invalid login credentials',
        });
        return;
      }
      sendJson(res, 200, sessionPayload(user));
      return;
    }

    if (req.method === 'GET' && path === '/user') {
      const token = bearerToken(req);
      const subject = token ? readSubject(token) : null;
      const user = subject ? await readUserById(subject.sub) : null;
      if (!user) {
        sendJson(res, 401, { error: 'invalid_claim', error_description: 'Invalid token' });
        return;
      }
      sendJson(res, 200, userPayload(user));
      return;
    }

    if (req.method === 'POST' && path === '/logout') {
      sendJson(res, 204, {});
      return;
    }

    sendJson(res, 404, { message: `No auth stub route for ${req.method} ${path}` });
  } catch (error) {
    sendJson(res, 500, { message: error instanceof Error ? error.message : 'stub failure' });
  }
});

if (IS_ENTRY_POINT) {
  server.listen(PORT, () => {
    console.log(`Auth stub on http://127.0.0.1:${PORT}/auth/v1 (local preview only)`);
  });
}
