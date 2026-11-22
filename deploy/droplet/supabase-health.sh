#!/usr/bin/env bash
# Is self-hosted Supabase answering from the internet? Checks the public URL
# end to end (DNS, Caddy's certificate, the gateway, GoTrue, PostgREST), so a
# failure alerts through run-checked.sh (check `supabase-health`) no matter
# which piece broke. Keys come from ~/supabase/.env and are never printed.
set -euo pipefail

env_file="${SUPABASE_ENV:-/home/deploy/supabase/.env}"
url="https://$(sed -n 's/^PROXY_DOMAIN=//p' "$env_file")"
publishable="$(sed -n 's/^SUPABASE_PUBLISHABLE_KEY=//p' "$env_file")"
secret="$(sed -n 's/^SUPABASE_SECRET_KEY=//p' "$env_file")"

check() {  # check <label> <path> <key>
  code=$(curl -sS -o /dev/null -w '%{http_code}' -m 15 "$url$2" -H "apikey: $3") || code="unreachable"
  echo "$1: $code"
  [ "$code" = "200" ]
}

ok=0
check "auth  $url/auth/v1/health" /auth/v1/health "$publishable" || ok=1
check "rest  $url/rest/v1/" /rest/v1/ "$secret" || ok=1
exit "$ok"
