import { spawn } from 'node:child_process';
import { createHmac } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { mintAccessToken } from '../scripts/dev-auth-stub.mjs';

/**
 * Behavioural tests for the local auth stub.
 *
 * The stub exists so a real session can be obtained on a local preview (H1), and
 * the preview scripts depend on its wire contract: the exact paths `gotrue-js`
 * calls, the fields `hasSession()` requires, and a token PostgREST will verify.
 * Those are the properties that break silently — a wrong path or a missing
 * `expires_in` makes `signInWithPassword` return an error that reads like bad
 * credentials rather than a broken stub.
 *
 * The signature is verified here with an independent HMAC rather than by calling
 * the stub's own code twice, so the test can actually fail if the signing is
 * wrong. The database half of the flow is covered by the preview run recorded in
 * KNOWN_ISSUES, because a unit test cannot reach a real Postgres.
 */
const SCRIPT = fileURLToPath(new URL('../scripts/dev-auth-stub.mjs', import.meta.url));
const SECRET = 'test-only-jwt-secret';
const USER_ID = 'a0000000-0000-4000-8000-00000000ad11';

const PORT = 3987;
const BASE = `http://127.0.0.1:${PORT}/auth/v1`;

let child: ReturnType<typeof spawn> | undefined;

async function waitForReady(timeoutMs = 5000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${BASE}/user`);
      if (response.status === 401) return;
    } catch {
      // Not listening yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error('auth stub did not start');
}

beforeAll(async () => {
  child = spawn(
    process.execPath,
    [
      SCRIPT,
      '--port',
      String(PORT),
      '--jwt-secret',
      SECRET,
      '--pg-url',
      'postgres://unused',
      '--allow-insecure',
    ],
    { stdio: 'ignore' },
  );
  await waitForReady();
});

afterAll(() => {
  child?.kill();
});

function parts(token: string): { header: string; payload: string; signature: string } {
  const segments = token.split('.');
  if (segments.length !== 3) throw new Error(`expected a three-part JWT, got ${segments.length}`);
  const [header, payload, signature] = segments;
  if (!header || !payload || !signature) throw new Error('empty JWT segment');
  return { header, payload, signature };
}

function claimsOf(token: string): Record<string, unknown> {
  return JSON.parse(Buffer.from(parts(token).payload, 'base64url').toString());
}

describe('auth stub token', () => {
  it('signs an HS256 token PostgREST accepts, carrying the claims RLS reads', () => {
    const token = mintAccessToken(USER_ID, 'admin@preview.test', SECRET);
    const { header, payload, signature } = parts(token);

    const expected = createHmac('sha256', SECRET)
      .update(`${header}.${payload}`)
      .digest('base64url');
    expect(signature).toBe(expected);

    expect(JSON.parse(Buffer.from(header, 'base64url').toString())).toMatchObject({
      alg: 'HS256',
      typ: 'JWT',
    });

    const claims = claimsOf(token);
    // `sub` is what `auth.uid()` returns, so it is what attributes an admin write
    // to the caller. `role: authenticated` is what makes PostgREST apply the
    // signed-in policies rather than the anonymous ones.
    expect(claims.sub).toBe(USER_ID);
    expect(claims.role).toBe('authenticated');
    expect(claims.exp).toBeGreaterThan(Math.floor(Date.now() / 1000));
  });

  it('produces a different signature under a different secret', () => {
    const { header, payload, signature } = parts(
      mintAccessToken(USER_ID, 'admin@preview.test', 'a-different-secret'),
    );
    const expected = createHmac('sha256', SECRET)
      .update(`${header}.${payload}`)
      .digest('base64url');
    expect(signature).not.toBe(expected);
  });
});

describe('auth stub endpoints', () => {
  it('refuses to start without --allow-insecure', async () => {
    const guarded = spawn(
      process.execPath,
      [SCRIPT, '--port', String(PORT + 1), '--jwt-secret', SECRET],
      { stdio: ['ignore', 'ignore', 'pipe'] },
    );
    const code = await new Promise<number | null>((resolve) => guarded.on('exit', resolve));
    expect(code).toBe(1);
  });

  it('answers the password grant route instead of 404ing', async () => {
    // The credential check reaches Postgres, which is absent here, so this cannot
    // succeed. What matters is that the route exists: a 404 is the failure that
    // surfaces to the user as "we could not complete that request", which reads
    // like a wrong password.
    const response = await fetch(`${BASE}/token?grant_type=password`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'nobody@example.test', password: 'x' }),
    });
    expect(response.status).not.toBe(404);
  });

  it('rejects an unauthenticated /user request', async () => {
    const response = await fetch(`${BASE}/user`);
    expect(response.status).toBe(401);
  });

  it('rejects a bearer token that is not a JWT', async () => {
    const response = await fetch(`${BASE}/user`, {
      headers: { authorization: 'Bearer not-a-jwt' },
    });
    expect(response.status).toBe(401);
  });
});
