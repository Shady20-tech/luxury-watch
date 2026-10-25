#!/usr/bin/env bash
# =============================================================================
# Ask a running production server for every public route and fail on a 5xx.
#
# Why this exists
# ---------------
# `next build` cannot catch a page that only fails at request time. A route that
# reads cookies but is classified as static builds cleanly and then 500s under
# `next start` — that is the documented "production 500" trap, and this
# repository has hit it twice. `next build` also never renders a dynamic route,
# so a dynamic page that throws on a database error passes the build and fails
# in production.
#
# A route being *slow* or *empty* is not a defect. Returning 500 is. That is the
# only thing asserted here, so the check is meaningful in both configurations:
# with a database the CMS pages render content, without one they degrade to an
# explanation, and neither is a 500.
#
# Usage:
#   scripts/smoke-routes.sh                 # start a server, probe, stop it
#   scripts/smoke-routes.sh http://host:port  # probe an already-running server
# =============================================================================
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

PORT="${LW_SMOKE_PORT:-3210}"
STARTED_SERVER=0

# Routes that must never 5xx. Every one is public, chrome-bearing and reachable
# from the navigation or the footer, so a 500 is a dead end for a visitor.
ROUTES=(
  /
  /shop
  /brands
  /contact
  /design-system
  /cart
  /wishlist
  /checkout
  /login
  /register
  /forgot-password
  /pages/about
  /pages/faq
  /pages/privacy
  /pages/shipping
  /pages/terms
  /pages/warranty
  /appointments
  /services/sell-trade
  /services/sourcing
  /services/repair-restoration
  # A slug that is not published. With a database this is a 404; without one the
  # page cannot tell, so it renders an explanation. Both are acceptable — a 500
  # is not, which is what this asserts.
  /pages/a-slug-that-was-never-written
  # An unmatched path, so the not-found template is exercised too.
  /this-page-does-not-exist
)

if [ $# -ge 1 ]; then
  BASE="${1%/}"
else
  BASE="http://127.0.0.1:$PORT"

  # Never probe a server that is already listening: it may be serving a stale
  # build, and the results would describe that build rather than this one.
  if curl -sfo /dev/null "$BASE/" 2>/dev/null; then
    echo "Something is already listening on $BASE. Stop it, or pass a base URL." >&2
    exit 1
  fi

  # Build first so the probe measures the current source, not a previous build.
  echo "Building..."
  npm run build >/tmp/lw-smoke-build.log 2>&1 \
    || { echo "Build failed; see /tmp/lw-smoke-build.log" >&2; exit 1; }

  nohup npx next start -p "$PORT" -H 127.0.0.1 >/tmp/lw-smoke-server.log 2>&1 &
  STARTED_SERVER=1

  for _ in $(seq 1 30); do
    curl -sfo /dev/null "$BASE/" 2>/dev/null && break
    sleep 1
  done
fi

stop_server() {
  # Kill by working directory, never by a bare "next" pattern: Next.js renames
  # its process to `next-server`, so the pattern either misses it or takes out an
  # unrelated server.
  for pid in $(pgrep -f next-server 2>/dev/null); do
    [ "$(readlink "/proc/$pid/cwd" 2>/dev/null)" = "$ROOT" ] && kill "$pid" 2>/dev/null
  done
}
[ "$STARTED_SERVER" = 1 ] && trap stop_server EXIT

failures=0
for route in "${ROUTES[@]}"; do
  code="$(curl -s -o /dev/null -w '%{http_code}' "$BASE$route")"
  case "$code" in
    5??) printf '  %-46s %s  <-- FAIL\n' "$route" "$code"; failures=$((failures + 1)) ;;
    000) printf '  %-46s %s  <-- FAIL (no response)\n' "$route" "$code"; failures=$((failures + 1)) ;;
    *)   printf '  %-46s %s\n' "$route" "$code" ;;
  esac
done

echo
if [ "$failures" -gt 0 ]; then
  echo "FAILED: $failures route(s) returned a server error."
  echo "Server log: /tmp/lw-smoke-server.log"
  exit 1
fi

echo "Route smoke check passed (no 5xx)."
