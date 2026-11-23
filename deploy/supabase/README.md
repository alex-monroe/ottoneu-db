# Self-hosted Supabase on the droplet

The stripped-down self-hosted Supabase stack behind `https://db.rosterloom.com`,
on the DigitalOcean droplet (`sofa-db-server`, user `deploy`). The plan, the
decisions behind it and the migration steps are in
[docs/exec-plans/supabase-self-host.md](../../docs/exec-plans/supabase-self-host.md).

| Service | Image (release `self-hosted/v0.8.4`) | Role |
|---|---|---|
| `db` | `supabase/postgres:17.6.1.136` | Postgres 17, bound to `127.0.0.1:5432` |
| `rest` | `postgrest/postgrest:v14.18` | the REST API (`/rest/v1`) |
| `auth` | `supabase/gotrue:v2.197.0` | sign-in for fantasy-pulse (`/auth/v1`) |
| `api-gw` | `envoyproxy/envoy:v1.39.6` | checks API keys (legacy JWTs and `sb_publishable_`/`sb_secret_`), bound to `127.0.0.1:8000` |
| `caddy` | `caddy:2.10` | TLS on 80/443 (Let's Encrypt); passes only `/rest/v1/*` and `/auth/v1/*` |

Not run: Studio, postgres-meta, Supavisor, Storage, Realtime, Functions,
imgproxy, analytics. Their images were removed after setup.

## Files

- `~/supabase/`: the upstream Docker setup, installed by Supabase's `setup.sh`
  (`sh setup.sh -y --skip-deps -p supabase`). The release is recorded in
  `.supabase-version`, so `sh update.sh` can three-way-merge later releases.
  Upstream files are never edited.
- `~/supabase/.env` (mode 600): every secret (`POSTGRES_PASSWORD`,
  `JWT_SECRET`, JWKS, `ANON_KEY`/`SERVICE_ROLE_KEY`,
  `SUPABASE_PUBLISHABLE_KEY`/`SUPABASE_SECRET_KEY`) plus the URLs and
  `COMPOSE_FILE`. **Keep a copy off the droplet**, in a password manager. Losing
  it means new keys for every consumer. `sh run.sh secrets` prints the main ones.
- [`docker-compose.sofa.yml`](docker-compose.sofa.yml) → `~/supabase/docker-compose.sofa.yml`:
  our only layer. It adds the localhost port bindings, drops the gateway's
  Studio dependency, and adds Caddy.
- [`Caddyfile`](Caddyfile) → `~/supabase/volumes/proxy/sofa/Caddyfile`.

Settings changed in `~/supabase/.env` from `setup.sh`'s defaults:

```
SUPABASE_PUBLIC_URL=https://db.rosterloom.com
API_EXTERNAL_URL=https://db.rosterloom.com/auth/v1
SITE_URL=https://rosterloom.com
PROXY_DOMAIN=db.rosterloom.com
COMPOSE_FILE=docker-compose.yml:docker-compose.sofa.yml
```

## Run it

```bash
cd ~/supabase
docker compose up -d --wait db rest auth api-gw caddy   # never `sh run.sh start`: it starts every service
docker compose ps
docker compose logs -f auth
```

Every container is `restart: unless-stopped` and Docker starts at boot, so a
reboot brings the stack back by itself. After changing either of our files,
copy it into place and run `docker compose up -d --wait <service>`.

Reach Postgres from a laptop over an SSH tunnel; it's never on the public IP:

```bash
ssh -N -L 5432:127.0.0.1:5432 deploy@138.68.230.37
psql "postgres://postgres:<POSTGRES_PASSWORD>@127.0.0.1:5432/postgres"
```

## Copy hosted's data in (migration only, now retired)

The cutover is done and `~/supabase-migration/hosted.env` is deleted, so this
script stops at its first step. It is kept as the record of how the copy was
made. **Never recreate `hosted.env` and run it:** `--reset` wipes the live
database.

```bash
~/ottoneu-db/deploy/supabase/restore-from-hosted.sh ~/supabase-migration/<name> --reset
```

This dumps hosted (using `HOSTED_DB_URL` from `~/supabase-migration/hosted.env`,
mode 600), resets the self-hosted database, restores in one transaction,
copies the migration history, and compares [`counts.sql`](counts.sql) on both
sides. It takes ~2 minutes. `--reset` **wipes the self-hosted database**; while
it holds only a rehearsal copy, that's the point. After cutover, never run it
against the live self-hosted database.

## Query, migrate and generate types from a laptop

The Supabase MCP only reaches hosted projects, so these `just` recipes replace
it. Each one runs [`db.sh`](db.sh), which runs `psql` (or the Supabase CLI)
inside the droplet over `ssh sofa`. The laptop needs no psql, no tunnel and no
database password.

| Recipe | Replaces | What it does |
|---|---|---|
| `just sql "<query>"` | `execute_sql`, `list_tables` | Read-only SQL or a psql meta-command (`\dt`, `\d players`) as `agent_readonly`. |
| `just migrate migrations/NNN_x.sql [--dry-run]` | `apply_migration` | Runs the file and records it in `supabase_migrations.schema_migrations`, all in one transaction. Refuses a name that's already recorded. Then refreshes `agent_readonly`'s grants and reloads PostgREST. `--dry-run` rolls everything back. |
| `just gen-types` | `generate_typescript_types` | Writes `.cache/supabase-types.generated.ts` (prettier-formatted, `fp_` stripped). `web/types/supabase.ts` is curated, so copy in only the entries you need. |
| `just db-lint` | `get_advisors` | `supabase db lint` on `public`. |

`agent_readonly` ([agent-readonly.sql](agent-readonly.sql)):
- has `SELECT` on every `public` table except `fp_*`, plus `supabase_migrations.schema_migrations`;
- has `BYPASSRLS`, so it sees what the MCP's `postgres` role saw;
- defaults to read-only transactions with a 30 s statement timeout;
- has no password, so it can only log in from inside the db container.

Create it, or recreate it after a restore from hosted, with
`deploy/supabase/db.sh setup-readonly`.

From Claude Code, ssh can't run inside the sandbox, so these four recipes are
listed in the sandbox's `excludedCommands`. `just migrate` always asks for
approval. The guard hook blocks `fp_` names in a `just sql` query or a
migration file.

## Check it

`ottoneu-supabase-health.timer` ([deploy/droplet/](../droplet/README.md))
alerts through Healthchecks if `https://db.rosterloom.com` stops answering. By
hand:

```bash
~/ottoneu-db/deploy/droplet/supabase-health.sh
```

Measured at Phase 1 (empty database): the five containers use ~265 MB. The
droplet had 1.3 GB available.
