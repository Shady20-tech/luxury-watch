#!/usr/bin/env bash
# =============================================================================
# Serve a preview of the current build against the real local database.
#
# Why this exists
# ---------------
# `next start` alone renders an empty catalogue. The seed data lives in Postgres,
# and the app reaches it through `supabase-js` -> PostgREST -> Postgres. Without
# PostgREST running, every public page falls back to the fixture or shows nothing,
# so a preview of "the app" shows none of the catalogue, cart or wishlist work.
#
# This script brings up the three processes a real preview needs and leaves them
# running:
#
#   1. PostgREST      :3001  against the verified local database
#   2. prefix proxy   :3002  strips /rest/v1, exactly as Kong does in production
#   3. Next.js        :12000 the production build
#
# It also mints an anon JWT signed with a secret it controls, because the seed
# anon key is signed with a secret we do not hold. The key is only ever forwarded
# to PostgREST, so a locally-generated one behaves identically.
#
# This is a development and verification tool only. Vercel talks to the Supabase
# project URL directly.
#
# Usage:
#   scripts/preview.sh          # start everything
#   scripts/preview.sh stop     # stop everything
# =============================================================================
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

CONTAINER="${LW_PG_CONTAINER:-lw-pg-test}"
PGRST_PORT=3001
PROXY_PORT=3002
APP_PORT="${LW_PREVIEW_PORT:-12000}"
WORKDIR="${LW_PREVIEW_WORKDIR:-/tmp/lw-preview}"

mkdir -p "$WORKDIR"

# --- Docker, via sudo when the daemon is root-owned ---------------------------
if docker info >/dev/null 2>&1; then
  DOCKER=(docker)
elif sudo -n docker info >/dev/null 2>&1; then
  DOCKER=(sudo -n docker)
else
  echo "Cannot reach the Docker daemon." >&2
  exit 1
fi

stop_all() {
  # Kill by working directory, never by a bare "next" pattern: Next.js renames
  # its process to `next-server`, and a loose pattern either misses it or takes
  # out an unrelated server.
  for pid in $(pgrep -f next-server 2>/dev/null); do
    [ "$(readlink "/proc/$pid/cwd" 2>/dev/null)" = "$ROOT" ] && kill "$pid" 2>/dev/null
  done
  pkill -f "dev-postgrest-proxy.mjs --port $PROXY_PORT" 2>/dev/null
  pkill -f "postgrest $WORKDIR/pgrst.conf" 2>/dev/null
  sleep 1
  echo "Preview stopped."
}

if [ "${1:-start}" = "stop" ]; then
  stop_all
  exit 0
fi

stop_all

# --- 1. JWTs signed with a secret we control --------------------------------
# Two roles are needed, not one. Public pages read through `anon` and its RLS
# policies, but the guest cart and wishlist are deliberately handled server-side
# with the service-role client (see src/lib/cart/session.ts). Setting the
# service-role key to an anon token does not fail loudly — the action logs
# `cart.add_failed` and the cart stays empty — so both tokens are minted here.
SECRET="lw-preview-local-jwt-secret-not-for-production"
mint_jwt() {
  python3 - "$SECRET" "$1" <<'PY'
import base64, hmac, hashlib, json, sys, time

def b64(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).rstrip(b"=").decode()

secret, role = sys.argv[1], sys.argv[2]
header = {"alg": "HS256", "typ": "JWT"}
now = int(time.time())
payload = {"role": role, "iss": "supabase", "iat": now, "exp": now + 315_360_000}
signing = (
    f"{b64(json.dumps(header, separators=(',', ':')).encode())}."
    f"{b64(json.dumps(payload, separators=(',', ':')).encode())}"
)
sig = hmac.new(secret.encode(), signing.encode(), hashlib.sha256).digest()
print(f"{signing}.{b64(sig)}")
PY
}
ANON_JWT="$(mint_jwt anon)"
SERVICE_JWT="$(mint_jwt service_role)"

# --- 2. PostgREST -------------------------------------------------------------
if [ ! -x "$WORKDIR/postgrest" ]; then
  echo "Fetching PostgREST..."
  curl -sL --max-time 120 -o "$WORKDIR/pgrst.tar.xz" \
    "https://github.com/PostgREST/postgrest/releases/download/v12.2.3/postgrest-v12.2.3-linux-static-x64.tar.xz" \
    && tar -xJf "$WORKDIR/pgrst.tar.xz" -C "$WORKDIR" \
    || { echo "Could not download PostgREST." >&2; exit 1; }
fi

cat > "$WORKDIR/pgrst.conf" <<CONF
db-uri = "postgres://authenticator:postgres@127.0.0.1:55432/postgres"
db-schemas = "public"
db-anon-role = "anon"
jwt-secret = "$SECRET"
server-port = $PGRST_PORT
CONF

nohup "$WORKDIR/postgrest" "$WORKDIR/pgrst.conf" > "$WORKDIR/pgrst.log" 2>&1 &
sleep 4

# --- 3. /rest/v1 prefix-stripping proxy --------------------------------------
nohup node scripts/dev-postgrest-proxy.mjs \
  --port "$PROXY_PORT" --target "http://127.0.0.1:$PGRST_PORT" \
  > "$WORKDIR/proxy.log" 2>&1 &
sleep 2

# --- 4. Point the app at the proxy -------------------------------------------
# NEXT_PUBLIC_* is inlined at build time, so the build below must see these.
if [ ! -f .env.local ]; then
  echo ".env.local is missing; copy .env.example and fill it in first." >&2
  exit 1
fi
cp .env.local "$WORKDIR/env.local.backup"
python3 - "$ANON_JWT" "$SERVICE_JWT" "$PROXY_PORT" <<'PY'
import io, re, sys

anon, service, proxy_port = sys.argv[1], sys.argv[2], sys.argv[3]
text = io.open(".env.local", encoding="utf-8").read()


def set_var(text: str, key: str, value: str) -> str:
    pattern = rf"(?m)^{key}=.*$"
    line = f"{key}={value}"
    if re.search(pattern, text):
        return re.sub(pattern, line.replace("\\", "\\\\"), text)
    return text.rstrip("\n") + f"\n{line}\n"


text = set_var(text, "NEXT_PUBLIC_SUPABASE_URL", f"http://127.0.0.1:{proxy_port}")
text = set_var(text, "NEXT_PUBLIC_SUPABASE_ANON_KEY", anon)
# The guest cart and wishlist go through the service-role client, so this must be
# a service_role token. An anon token here fails silently at runtime.
text = set_var(text, "SUPABASE_SERVICE_ROLE_KEY", service)
io.open(".env.local", "w", encoding="utf-8").write(text)
PY

# --- 5. Build and serve -------------------------------------------------------
echo "Building (NEXT_PUBLIC_* is inlined, so the build must see the proxy URL)..."
npm run build > "$WORKDIR/build.log" 2>&1 \
  || { echo "Build failed; see $WORKDIR/build.log" >&2; exit 1; }

nohup npx next start -p "$APP_PORT" -H 0.0.0.0 > "$WORKDIR/next.log" 2>&1 &
sleep 8

SITE_URL="$(sed -nE 's/^NEXT_PUBLIC_SITE_URL=(.*)$/\1/p' .env.local | tail -1)"

if curl -sfo /dev/null "http://127.0.0.1:$APP_PORT/shop"; then
  echo
  echo "Preview ready on port $APP_PORT."
  echo "  Local:  http://127.0.0.1:$APP_PORT"
  echo "  Public: ${SITE_URL:-<set NEXT_PUBLIC_SITE_URL in .env.local>}"
  echo
  echo "Logs: $WORKDIR/{pgrst,proxy,build,next}.log"
  echo "Stop: scripts/preview.sh stop"
else
  echo "Preview did not come up; see $WORKDIR/next.log" >&2
  exit 1
fi
