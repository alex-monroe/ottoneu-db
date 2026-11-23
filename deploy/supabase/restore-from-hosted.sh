#!/usr/bin/env bash
# Copy the hosted Supabase database into self-hosted Postgres on the droplet:
# Phase 2 (rehearsal) and Phase 5 (cutover) of docs/exec-plans/supabase-self-host.md.
#
#   deploy/supabase/restore-from-hosted.sh <workdir> [--reset]
#
#   <workdir>  new directory for the dumps and logs, e.g. ~/supabase-migration/cutover
#   --reset    wipe the self-hosted database first (stops the stack, deletes
#              ~/supabase/volumes/db/data, restarts). Needed on every run after
#              the first; the restore expects an empty database.
#
# Reads HOSTED_DB_URL (session pooler string, port 5432) from
# ~/supabase-migration/hosted.env and never prints it. Steps:
#   1. `supabase db dump`: roles, schema and data (Supabase filters out its
#      own internal schemas, which break a raw pg_dump restore).
#   2. Filter data.sql: drop COPY blocks that are empty, or whose table the
#      self-hosted stack lacks (Storage isn't run). A non-empty block for a
#      missing table is an error.
#   3. Restore in one transaction with ON_ERROR_STOP; a column the
#      self-hosted Auth lacks fails here loudly instead of losing rows.
#   4. Copy supabase_migrations (the dump skips it; it's the record of
#      applied migrations), then restart PostgREST so it reloads its schema cache.
#   5. Compare deploy/supabase/counts.sql on both sides. Run it during a write
#      freeze for an exact match; while jobs are writing, the busiest tables
#      differ by the rows written since the dump.
set -euo pipefail

work="${1:?usage: restore-from-hosted.sh <workdir> [--reset]}"
reset="${2:-}"
repo="$(cd "$(dirname "$0")/../.." && pwd)"
supa="$HOME/supabase"
set -a; . "$HOME/supabase-migration/hosted.env"; set +a
: "${HOSTED_DB_URL:?HOSTED_DB_URL missing from ~/supabase-migration/hosted.env}"

mkdir -p "$work"; chmod 700 "$work"; cd "$work"
redact() { sed -E 's#postgres(ql)?://[^ ]*#<db-url>#g'; }
step() { echo "== $1 ($(date +%T))"; }
psql_self() { docker exec -i supabase-db psql -U postgres -d postgres -X -q -v ON_ERROR_STOP=1 "$@"; }
t0=$(date +%s)

step "1. dump from hosted"
for spec in "roles.sql --role-only" "schema.sql" "data.sql --use-copy --data-only"; do
  set -- $spec; f=$1; shift
  npx --yes supabase@latest db dump --db-url "$HOSTED_DB_URL" -f "$f" "$@" 2>&1 | redact | grep -E "Dumped|rror" || true
  [ -s "$f" ] || { echo "dump of $f failed"; exit 1; }
done
docker exec -e HOSTED_DB_URL supabase-db sh -c \
  'pg_dump "$HOSTED_DB_URL" --schema=supabase_migrations --no-owner --no-privileges' > migrations.sql
chmod 600 ./*.sql
echo "dumped in $(( $(date +%s)-t0 ))s: $(du -ch ./*.sql | tail -1 | cut -f1)"

if [ "$reset" = "--reset" ]; then
  step "reset self-hosted database to empty"
  (cd "$supa" && docker compose stop caddy api-gw rest auth db >/dev/null 2>&1 \
     && sudo rm -rf volumes/db/data \
     && docker compose up -d --wait db rest auth api-gw caddy >/dev/null 2>&1)
fi

step "2. filter data.sql"
docker exec supabase-db psql -U postgres -XAtc \
  "select table_schema || '.' || table_name from information_schema.tables where table_type = 'BASE TABLE'" > target_tables
python3 - <<'EOF'
import re, sys
# Tables the restore will have: those the self-hosted stack already has (auth.*)
# plus every table schema.sql creates (public.*), which don't exist until the
# restore itself runs.
target = set(open("target_tables").read().split())
target |= {f"{s}.{t}" for s, t in re.findall(
    r'CREATE TABLE (?:IF NOT EXISTS )?"?([a-z_0-9]+)"?\."?([a-z_0-9]+)"?', open("schema.sql").read())}
lines = open("data.sql").read().splitlines(keepends=True)
out, i, dropped = [], 0, []
while i < len(lines):
    m = re.match(r'COPY "?([a-z_0-9]+)"?\."?([a-z_0-9]+)"? ', lines[i])
    if not m:
        out.append(lines[i]); i += 1; continue
    j = i + 1
    while lines[j].rstrip("\n") != "\\.":
        j += 1
    table, rows = f"{m.group(1)}.{m.group(2)}", j - i - 1
    if table not in target and rows:
        sys.exit(f"{table} has {rows} rows but the self-hosted database has no such table")
    if table not in target or rows == 0:
        dropped.append(table)
    else:
        out.extend(lines[i:j + 1])
    i = j + 1
open("data.final.sql", "w").writelines(out)
print(f"dropped {len(dropped)} empty or absent-table COPY blocks")
EOF
chmod 600 data.final.sql

step "3. restore (one transaction)"
t=$(date +%s)
cat roles.sql schema.sql data.final.sql | psql_self --single-transaction > restore.log 2>&1 \
  || { echo "restore FAILED, rolled back:"; grep ERROR restore.log | head -5; exit 1; }
echo "restored in $(( $(date +%s)-t ))s"

step "4. migration history + PostgREST reload"
psql_self --single-transaction < migrations.sql > migrations.log 2>&1 \
  || { grep ERROR migrations.log | head -3; exit 1; }
docker restart supabase-rest >/dev/null

step "5. verify against hosted"
docker cp "$repo/deploy/supabase/counts.sql" supabase-db:/tmp/counts.sql
docker exec -e HOSTED_DB_URL supabase-db sh -c 'psql "$HOSTED_DB_URL" -XAt -F"|" -f /tmp/counts.sql' > hosted.counts
docker exec supabase-db psql -U postgres -XAt -F"|" -f /tmp/counts.sql > self.counts
if diff hosted.counts self.counts > counts.diff; then
  echo "IDENTICAL: $(wc -l < self.counts) checks"
else
  echo "DIFFERENCES (< hosted, > self-hosted):"; cat counts.diff
fi
echo "total $(( $(date +%s)-t0 ))s"
