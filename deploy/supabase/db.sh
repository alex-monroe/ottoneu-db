#!/usr/bin/env bash
# Laptop-side access to the self-hosted Postgres on the droplet. These replace
# the Supabase MCP tools, which only reach hosted projects. Everything runs
# `psql` inside the `supabase-db` container over `ssh`, so the laptop needs no
# psql, no tunnel and no database password.
#
#   deploy/supabase/db.sh sql "<query or psql meta-command>"   # read-only, as agent_readonly
#   deploy/supabase/db.sh migrate migrations/NNN_name.sql [--dry-run]
#   deploy/supabase/db.sh gen-types [out-file]
#   deploy/supabase/db.sh lint
#   deploy/supabase/db.sh setup-readonly
#
# Called through the `just sql`, `just migrate`, `just gen-types` and
# `just db-lint` recipes. SOFA_SSH_HOST overrides the ssh host (default `sofa`,
# from ~/.ssh/config). From Claude Code these run outside the sandbox (raw TCP
# for ssh is blocked inside it); see the sandbox `excludedCommands` in
# .claude/settings.json.
set -euo pipefail

host="${SOFA_SSH_HOST:-sofa}"
here="$(cd "$(dirname "$0")" && pwd)"
repo="$(cd "$here/../.." && pwd)"
cli="supabase@3.2.0"

# psql in the db container. -h 127.0.0.1 inside the container is `trust` in the
# image's pg_hba.conf, so agent_readonly needs no password and can't log in
# from anywhere else (it has none).
psql_as() {
  local role="$1"; shift
  ssh "$host" docker exec -i supabase-db psql -h 127.0.0.1 -U "$role" -d postgres -X -v ON_ERROR_STOP=1 "$@"
}

cmd="${1:-}"; shift || true
case "$cmd" in
  sql)
    query="${1:?usage: db.sh sql \"<query>\"}"
    printf '%s\n' "$query" | psql_as agent_readonly -P pager=off
    ;;

  migrate)
    file="${1:?usage: db.sh migrate migrations/NNN_name.sql [--dry-run]}"
    mode="${2:-}"
    [ -f "$file" ] || { echo "no such file: $file" >&2; exit 1; }
    name="$(basename "$file" .sql)"
    version="$(date -u +%Y%m%d%H%M%S)"
    tag="mig_$(openssl rand -hex 6)"
    case "$name" in *\'*) echo "bad file name: $name" >&2; exit 1 ;; esac
    if grep -qiE '^\s*(begin|commit|rollback|start transaction)\s*;|concurrently' "$file"; then
      echo "$file manages its own transaction or uses CONCURRENTLY; apply it by hand with psql." >&2
      exit 1
    fi
    end="commit;"
    [ "$mode" = "--dry-run" ] && end="rollback;"
    # One transaction: refuse a repeat, run the file, record it the way
    # Supabase's apply_migration does, refresh agent_readonly's grants for any
    # new table, and tell PostgREST to reload its schema cache.
    {
      echo "begin;"
      echo "do \$chk\$ begin if exists (select from supabase_migrations.schema_migrations where name = '$name') then raise exception 'already applied: $name'; end if; end \$chk\$;"
      cat "$file"
      echo
      echo ";"
      echo "insert into supabase_migrations.schema_migrations (version, name, statements, created_by)"
      printf "values ('%s', '%s', array[\$%s\$%s\$%s\$], 'just migrate');\n" "$version" "$name" "$tag" "$(cat "$file")" "$tag"
      cat "$here/agent-readonly-grants.sql"
      echo "notify pgrst, 'reload schema';"
      echo "$end"
    } | psql_as postgres -q
    if [ "$mode" = "--dry-run" ]; then
      echo "dry run OK, rolled back: $name"
    else
      echo "applied $name as version $version"
    fi
    ;;

  gen-types)
    out="${1:-$repo/.cache/supabase-types.generated.ts}"
    mkdir -p "$(dirname "$out")"
    raw="$(mktemp)"; trap 'rm -f "$raw"' EXIT
    # The CLI runs on the droplet (it needs Docker-free access to Postgres at
    # localhost). Its stdout starts with a few status lines before the code.
    ssh "$host" 'pw=$(grep "^POSTGRES_PASSWORD=" ~/supabase/.env | cut -d= -f2-);
      cd /tmp && npx --yes '"$cli"' gen types typescript --schema public \
        --remote="postgresql://postgres:$pw@localhost:5432/postgres?sslmode=disable" 2>/dev/null' > "$raw"
    sed -n '/^export type/,$p' "$raw" > "$raw.ts"
    npx --yes prettier@3.3.3 --parser typescript --no-semi "$raw.ts" > "$raw.fmt" 2>/dev/null
    python3 "$here/strip_fp_types.py" "$raw.fmt" > "$out"
    rm -f "$raw.ts" "$raw.fmt"
    echo "wrote $out ($(wc -l < "$out" | tr -d ' ') lines, fp_ tables stripped)."
    echo "Copy the entries you need into web/types/supabase.ts; that file is curated, not overwritten."
    ;;

  lint)
    ssh "$host" 'pw=$(grep "^POSTGRES_PASSWORD=" ~/supabase/.env | cut -d= -f2-);
      cd /tmp && npx --yes '"$cli"' db lint --schema public --level warning \
        --remote="postgresql://postgres:$pw@localhost:5432/postgres?sslmode=disable" 2>&1' \
      | grep -v -E '^(Connecting|Linting|Target:|A new version|We recommend|$)'
    ;;

  setup-readonly)
    psql_as postgres -q < "$here/agent-readonly.sql"
    psql_as postgres -q < "$here/agent-readonly-grants.sql"
    echo "agent_readonly ready"
    ;;

  *)
    sed -n '2,16p' "$0" >&2
    exit 2
    ;;
esac
