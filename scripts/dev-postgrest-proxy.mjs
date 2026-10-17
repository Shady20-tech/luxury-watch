#!/usr/bin/env node
/**
 * Local PostgREST prefix-stripping proxy.
 *
 * Why this exists
 * ---------------
 * `@supabase/supabase-js` always requests `<projectUrl>/rest/v1/<table>`, because
 * in a real Supabase project Kong routes `/rest/v1` to the PostgREST container.
 * A bare PostgREST started locally serves at `/` instead, so pointing
 * `NEXT_PUBLIC_SUPABASE_URL` at it makes every request 404 on the extra prefix.
 *
 * That gap matters because it is the difference between testing the app against
 * a shim and testing the real client path. This proxy strips the `/rest/v1`
 * prefix, which is exactly what Kong does in production, so the application
 * talks to a real PostgREST through the real `supabase-js` code path with real
 * RLS applied.
 *
 * It is a development and verification tool only. It is never used in a
 * deployment: Vercel talks to the Supabase project URL directly.
 *
 * Usage
 * -----
 *   node scripts/dev-postgrest-proxy.mjs [--port 3002] [--target http://127.0.0.1:3001]
 *
 * Then set NEXT_PUBLIC_SUPABASE_URL to the proxy (e.g. http://127.0.0.1:3002)
 * and NEXT_PUBLIC_SUPABASE_ANON_KEY to the anon JWT the PostgREST instance
 * accepts. See AGENTS.md, "Verifying against a real database".
 */

import http from 'node:http';

function readArg(name, fallback) {
  const index = process.argv.indexOf(`--${name}`);
  return index !== -1 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

const PORT = Number(readArg('port', '3002'));
const TARGET = new URL(readArg('target', 'http://127.0.0.1:3001'));
const PREFIX = '/rest/v1';

const server = http.createServer((req, res) => {
  const incoming = new URL(req.url, `http://localhost:${PORT}`);

  if (!incoming.pathname.startsWith(PREFIX)) {
    res.writeHead(404, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ message: `Only ${PREFIX}/* is proxied` }));
    return;
  }

  const upstreamPath = incoming.pathname.slice(PREFIX.length) || '/';
  const upstream = new URL(upstreamPath + incoming.search, TARGET);

  const proxied = http.request(
    {
      protocol: upstream.protocol,
      hostname: upstream.hostname,
      port: upstream.port,
      method: req.method,
      path: upstream.pathname + upstream.search,
      headers: { ...req.headers, host: upstream.host },
    },
    (upstreamRes) => {
      res.writeHead(upstreamRes.statusCode ?? 502, upstreamRes.headers);
      upstreamRes.pipe(res);
    },
  );

  proxied.on('error', (error) => {
    res.writeHead(502, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ message: `Upstream unreachable: ${error.message}` }));
  });

  req.pipe(proxied);
});

server.listen(PORT, () => {
  console.log(`PostgREST proxy on http://127.0.0.1:${PORT}${PREFIX} -> ${TARGET.origin}/`);
});
