# Plan: self-host Supabase on the DigitalOcean droplet

**Status:** Proposed (2026-11-22). Nothing is built yet. Phase 0 has D1 (one
project) and D2 (cost: $25/month hosted) decided, with recommendations for the
rest; D4 still needs a check in the fantasy-pulse repo.

**Goal:** move the shared Supabase database off the hosted platform onto the
droplet (`sofa-db-server`, 138.68.230.37, SFO2, Ubuntu 24.04, user `deploy`). It
runs a trimmed stack: Postgres, PostgREST, GoTrue and an API gateway. Every
consumer must keep working: the sofa-db site on Vercel, the scrapers on GitHub
Actions and the droplet, fantasy-pulse, and agent tooling. The hosted project
stays untouched as the rollback until the new one has run cleanly for two weeks.

## What we are moving (measured 2026-11-22)

| Item | Value | Consequence |
|---|---|---|
| Database size | 195 MB | A dump and restore takes minutes, so a short write freeze is enough. No replication. |
| Postgres version | 17.6 | Start the self-hosted stack on Postgres 17 (Supabase's PG17 guide). The default image is 15. |
| `public` | 63 tables, 64 RLS policies, 9 functions (`dispatch_live_worm` + fantasy-pulse's OAuth RPCs, all `SECURITY DEFINER`), no views or triggers | Restored as-is by the schema dump. |
| Extensions | `pg_cron`, `pg_net`, `pg_stat_statements`, `pgcrypto`, `supabase_vault`, `uuid-ossp` | All ship in the `supabase/postgres` image. |
| pg_cron | one job, `live-score-worm-dispatch`, which migration 065 removes | Nothing scheduled in the database after 065. |
| Vault | one secret (`github_actions_dispatch`) | Unused after 065. Leave it out of the restore. |
| Auth (GoTrue) | 9 users, email/password only, all fantasy-pulse's | Users come over with their password hashes. Everyone signs in again (new JWT secret). sofa-db's own login (`web/lib/auth.ts`, the `ottoneu_auth` cookie) is unaffected. |
| Storage | 0 buckets, 0 objects | Don't run Storage. |
| Realtime | `supabase_realtime` publishes no tables | Don't run Realtime. |
| Edge Functions | none | Don't run Functions. |
| Applied migrations | 77 rows in `supabase_migrations.schema_migrations` | Keep the table; it stays the record of what was applied. |

### Who connects today

| Consumer | How | Variables to change at cutover |
|---|---|---|
| sofa-db site (Vercel `sofa-db`) | supabase-js over REST (`web/lib/supabase.ts`) | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and **add** `SUPABASE_SECRET_KEY`. Today the admin client falls back to the integration-managed `OTTONEU_DB_SUPABASE_SECRET_KEY`, which can't be edited. The plain variable wins, so add it. |
| GitHub Actions | supabase-py and supabase-js; 24 workflows read the `SUPABASE_URL` / `SUPABASE_SECRET_KEY` repository secrets | Those two secrets. |
| Droplet jobs | `~/ottoneu-db/.env` (`SUPABASE_URL`, `SUPABASE_KEY`) and `web/.env.local` (the three `NEXT_PUBLIC_*`/secret keys) | Both files. After cutover they can use `http://localhost:8000`. |
| fantasy-pulse (Vercel) | Supabase Marketplace integration variables: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_JWT_SECRET`, `POSTGRES_URL`, `POSTGRES_PRISMA_URL`, …; GoTrue sign-in; its `fp_*` RPCs | Its repo and Vercel project, outside this repo. See decision D4. |
| Agent tooling | Supabase MCP (`execute_sql`, `apply_migration`, `generate_typescript_types`, `list_migrations`, advisors); the `db-reader` subagent; the `fp_` guard in `.claude/hooks/guard.py` | The MCP goes through Supabase's Management API, so it **stops working** against a self-hosted database. Phase 3 replaces it. |

## Phase 0: decisions (needed before Phase 1)

- **D1. One project or two? Decided: one.** Migrate the one project that holds
  sofa-db's tables and fantasy-pulse's `fp_*` tables and users. The two Vercel
  Marketplace stores (`store_X2c3…` for fantasy-pulse, `store_Tv4p…` for
  sofa-db) still need a check at cutover, in Vercel → Storage: confirm both
  apps' `SUPABASE_URL` point at this project. If a second, unused project turns
  up, it is not migrated. Check it isn't adding to the bill.
- **D2. Why self-host? Decided: cost.** Hosted Supabase costs **$25/month**,
  the Pro plan billed through Vercel. The self-hosted cost is the droplet (now
  $12 + $2.40 backups), a domain (~$1/month) and off-droplet backup storage.
  Savings depend on staying at 2 GB (see D5). Owning backups, upgrades and
  security is the price.
- **D3. API hostname. Recommended: a cheap domain from Porkbun.** Vercel and
  GitHub reach the API over HTTPS, so it needs a name with a certificate.
  - Buy a domain at Porkbun: a `.com` is ~$11/year, and some other endings are
    a few dollars.
  - In Porkbun's DNS, add an **A record**: `db` → `138.68.230.37`.
  - The API is then `https://db.<yourdomain>`, and Caddy gets its certificate
    automatically.
  - The same domain is reused for fantasy-pulse's email (D6). That's why it
    beats the free alternative, a wildcard-IP name such as
    `138-68-230-37.sslip.io`. That works for HTTPS but can't send email and
    depends on a third-party DNS service.
- **D4. Does fantasy-pulse connect to Postgres directly?** It has
  `POSTGRES_URL` / `POSTGRES_PRISMA_URL`.
  - If its code uses them (Prisma, `pg`, Drizzle), the stack needs Supavisor
    and a TLS-protected Postgres port open to Vercel. That is a bigger exposure
    and ~200 MB more RAM.
  - If it only uses supabase-js, skip Supavisor.

  Check in the fantasy-pulse repo.
- **D5. Droplet size. Recommended: stay at 2 GB.** Cost is the reason to
  self-host, and 4 GB ($24/month) would make the move about break-even. The
  stripped-down stack (Phase 1) needs ~0.4 GB, the jobs ~0.3 GB at their peak,
  and the whole database (195 MB) fits in Postgres's cache. The droplet now uses
  ~0.45 GB of 1.9 GB, with 2 GB of swap behind it.
  - Measure in Phase 2.
  - Resize to 4 GB ("CPU and RAM only", undoable) only if memory sits above
    ~75% or the DigitalOcean memory alert fires.
- **D6. Email for fantasy-pulse's sign-up and password reset. Recommended:
  Resend's free tier** (3,000 emails/month, 100/day; 9 users need a handful).
  Porkbun is a domain registrar. It provides the domain the email is sent
  *from*, not the sending service.
  - Create a Resend account and add the D3 domain; Resend shows 3 DNS records
    (SPF, DKIM, return path).
  - Add those records in Porkbun.
  - Put Resend's SMTP host, port, user and API key in GoTrue's `SMTP_*`
    settings, with a sender like `no-reply@<yourdomain>`.
  - Also set `SITE_URL` and the redirect allow-list to fantasy-pulse's URL.
  - Check in the Supabase dashboard (Authentication → Emails) whether
    fantasy-pulse uses confirmation emails at all. If it only needs password
    reset, the setup is the same, but nothing breaks at sign-up if email is
    briefly down.

## Phase 1: stand up the stack (no data, no traffic)

1. **Get the compose files.** Clone `supabase/supabase` at a pinned release tag.
   Copy `docker/` to `/opt/supabase` and follow the Postgres 17 guide. Pin every
   image tag. Keep the upstream `docker-compose.yml` unchanged and put all
   changes in `docker-compose.override.yml`, so upgrades are a diff.
2. **Run only the stripped-down core: `db`, `rest`, `auth` and `kong`.** Add
   `supavisor` only if D4 says so.
   - That is Postgres, the REST API both apps and the scrapers use, sign-in for
     fantasy-pulse, and the gateway that checks API keys.
   - `meta` (postgres-meta) isn't needed: `supabase gen types --db-url` runs
     its own copy when generating types.
   - Start them by name: `docker compose up -d db rest auth kong`.
   - The upstream services' `depends_on: analytics` blocks must be dropped in
     the override, or Compose refuses to start.
   - Leave out `studio`, `storage`, `realtime`, `functions`, `imgproxy`,
     `analytics` and `vector`.
   - Set `KONG_NGINX_WORKER_PROCESSES=1`.
3. **Secrets.**
   - Run `generate-keys.sh`, then `utils/add-new-auth-keys.sh --update-env`.
     This gives `sb_publishable_` / `sb_secret_` keys, the same format the code
     uses today.
   - Store `/opt/supabase/.env` mode 600, and a copy somewhere off the droplet
     (a password manager).
   - It holds `POSTGRES_PASSWORD`, `JWT_SECRET`, the JWKS, and the
     legacy/publishable/secret keys.
4. **Ports.**
   - Bind every published port to `127.0.0.1` in the override, Postgres
     included. Docker ignores `ufw`. The Cloud Firewall already blocks
     everything but 22/80/443.
   - Reach Postgres from your Mac over an SSH tunnel:
     `ssh -L 5432:127.0.0.1:5432 deploy@…`.
5. **TLS.**
   - Install Caddy on the host as a reverse proxy: `<hostname> →
     127.0.0.1:8000` (Kong). Caddy gets and renews the Let's Encrypt
     certificate itself.
   - Ports 80/443 are already open in `sofa-db-server-fw`.
6. **PostgREST settings to match hosted.** Exposed schemas `public` (plus
   `graphql_public` only if something calls `/graphql/v1`; nothing here does).
   Keep `PGRST_DB_MAX_ROWS=1000`. The code already pages past it
   ([supabase-1000-row-cap](../references/database-workflow.md#supabase-pagination)),
   and raising it would hide a missing `.range()` instead of failing the same
   way in every environment.
7. **Health check.**
   - Add `ottoneu-supabase-health` to `deploy/droplet/`: a timer every
     5 minutes that runs `run-checked.sh supabase-health` with a `curl`
     against `https://<hostname>/rest/v1/` and `/auth/v1/health`.
   - Healthchecks then alerts if the API is down. A down API also shows up as
     failures in every job.
8. **Done when:** `curl https://<hostname>/rest/v1/ -H "apikey: <publishable>"`
   answers. The memory-use baseline is recorded.

## Phase 2: rehearsal restore (hosted stays live)

Run this at least once, and again just before cutover. It is the whole cutover
except switching any consumer over.

1. **Dump from hosted on the droplet.** The Supabase CLI needs Docker, which the
   droplet has. Use the session-pooler or direct connection string. You supply
   the database password; don't paste it into a chat.
   ```bash
   npx supabase db dump --db-url "$HOSTED_URL" -f roles.sql --role-only
   npx supabase db dump --db-url "$HOSTED_URL" -f schema.sql
   npx supabase db dump --db-url "$HOSTED_URL" -f data.sql --use-copy --data-only
   ```
   `supabase db dump` filters out Supabase's internal schemas and reserved
   roles. A raw `pg_dump` would not, and its restore fails on permissions.
2. **Edit `data.sql`:**
   - Comment out any `COPY` into tables or columns the self-hosted Auth version
     lacks (Supabase's troubleshooting list:
     `auth.oauth_clients`, newer `auth.flow_state` columns).
   - Drop the `vault.secrets` row.
3. **Restore:**
   ```bash
   psql --single-transaction -v ON_ERROR_STOP=1 \
     -f roles.sql -f schema.sql \
     -c 'SET session_replication_role = replica' -f data.sql \
     "postgres://postgres:$POSTGRES_PASSWORD@127.0.0.1:5432/postgres"
   ```
   For the first rehearsal, run it without `--single-transaction` to see every
   failure at once. Fix them, then rerun with it.
4. **Verify:**
   - **Row counts:** `count(*)` for every `public` table on both sides, built
     from `pg_tables` so no table is named by hand. Plus `auth.users` and
     `supabase_migrations.schema_migrations`. All must match exactly.
   - **Schema:** RLS policy and function counts match (64 / 9), and
     `pg_extension` lists the same extensions.
   - **API:** an anon read of a public table returns rows, and an anon read of
     an RLS-blocked table (`discord_posts`) returns none. The secret key reads
     both.
   - **Site:** point a **Vercel preview deployment** of sofa-db at the
     self-hosted URL and keys, using preview-scoped variables only. Click
     through `/`, `/players`, `/value`, `/arbitration`, `/scoreboard` and
     `/free-agents`, and log in.
   - **Jobs:** from the droplet, with `SUPABASE_URL=http://localhost:8000` set
     for the command only:
     - `scripts/live_score_worm.py --once --dry-run`
     - `post-auctions.sh --dry-run`
     - one GitHub workflow dispatched with `dry_run` against
       preview-scoped secrets, if one is cheap to wire.
   - **fantasy-pulse:** a sign-in on a fantasy-pulse preview against the
     self-hosted Auth (or ask its owner to).
5. **Write down** the time each step took and every manual edit to `data.sql`.
   The cutover runbook comes straight from these notes.

## Phase 3: tooling that assumes hosted Supabase

Land these before cutover so day one isn't spent rebuilding the workflow. Each
is a normal PR.

- **Migrations.** Replace `mcp__supabase__apply_migration` with a
  `just migrate <file>` recipe:
  - it applies the file with `psql` over the SSH tunnel inside a transaction;
  - it inserts `(version, name, statements)` into
    `supabase_migrations.schema_migrations`, keeping it the system of record.

  Then update `docs/references/database-workflow.md` and `migrations/README.md`.
- **Types.** `npx supabase gen types typescript --db-url <tunnel URL>`
  replaces `mcp__supabase__generate_typescript_types`. Add a `just gen-types`
  recipe.
- **Read-only SQL for agents.**
  - Create a `readonly` Postgres role (`SELECT` on `public`, no `fp_*` grants
    if that is easy to express, a `statement_timeout`).
  - Point a Postgres MCP server, or a `just sql` recipe, at it through the
    tunnel.
  - Rewire the `db-reader` subagent and `.claude/settings.json`.
  - Extend `.claude/hooks/guard.py` so its `fp_` block covers the new tool name
    too.
- **Advisors.** The hosted security and performance advisors go away. Run
  `npx supabase db lint` (or splinter's SQL) as part of `just check-db`, on
  demand.
- **Secrets inventory.** Add the self-hosted variables to
  `docs/references/environment-variables.md`, and record where the
  `/opt/supabase/.env` copy lives.

## Phase 4: backups and upgrades (before cutover, not after)

- **Nightly logical backup.**
  - `ottoneu-db-backup.timer` at 04:30 UTC runs `run-checked.sh db-backup`.
  - It dumps with `pg_dump -Fc` from inside the `db` container, encrypts with
    `age`, and uploads to **Backblaze B2**. At ~1 GB stored that is cents a month, against DigitalOcean Spaces' $5 minimum.
  - Keep 14 dailies and 8 weeklies. A dump compresses to ~30–50 MB.
  - A failed or missing backup alerts through Healthchecks: period 1 day,
    grace 2 h.
- **Droplet backups** (weekly, already on) cover the machine, not the database.
  A Postgres data directory copied while running is not a reliable backup.
- **Restore drill.** Once a month, restore the latest dump into a scratch
  container on the droplet and compare row counts. Phase 2's script does this.
  Add it to the README.
- **Upgrades.**
  - Check `docker/CHANGELOG.md` monthly.
  - Upgrade by bumping the pinned tags in a PR, with a fresh backup taken
    first.
  - A Postgres major upgrade (17 → 18) is a dump and restore, run like
    Phase 2.
  - Ubuntu security updates are already automatic (`unattended-upgrades`).

## Phase 5: cutover

Pick a quiet window: **a Tuesday or Wednesday morning, ET**. No NFL games, and
Ottoneu's week rolls over Wednesday. Allow 60–90 minutes. Post a heads-up in the
league Discord if fantasy-pulse users will notice the forced sign-in.

1. **T-1 day.** Rehearse Phase 2 once more and confirm the backup timer has
   succeeded. Have every new value ready in one place: the URL, publishable and
   secret keys, and fantasy-pulse's variables.
2. **Freeze writers.**
   - On the droplet:
     `sudo systemctl stop ottoneu-live-worm.timer ottoneu-post-auctions.timer`.
   - On GitHub, run `gh workflow disable <name>` for each scheduled workflow
     that writes to the database. The list is the `schedule:` workflows in
     `alert-scheduled-failure.yml`.
   - Wait for in-flight runs to finish (`gh run list --status in_progress`).
   - Put fantasy-pulse in maintenance mode, or accept that writes during the
     window are lost.
3. **Final dump and restore** (Phase 2, steps 1–4) into a freshly reset
   self-hosted database, then verify the row counts.
4. **Switch consumers.**
   - Droplet: `.env` and `web/.env.local` → `http://localhost:8000` and the new
     keys.
   - GitHub: update the `SUPABASE_URL` / `SUPABASE_SECRET_KEY` secrets (`gh
     secret set`, with the value read from a file you supply, not a chat).
   - Vercel `sofa-db`, production:
     - update `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`;
     - **add** `SUPABASE_SECRET_KEY`;
     - redeploy.
   - Vercel `fantasy-pulse`: the integration-managed variables can't be edited.
     Override them with project variables of the same name if Vercel allows,
     or disconnect the integration *without deleting the store* and set them
     by hand. Then redeploy.
5. **Smoke test.**
   - Repeat Phase 2's site checklist on production.
   - Run `post-auctions.sh --dry-run`, then re-enable its timer and watch one
     real run.
   - Dispatch one GitHub scrape by hand, for example `pull-roster-csv.yml`.
6. **Unfreeze.**
   - Re-enable the workflows (`gh workflow enable`) and the droplet timers.
   - Watch Healthchecks and the DigitalOcean memory graph for a day.
7. **Repo follow-up PR:**
   - docs that say "Supabase dashboard" or name the hosted URL;
   - `CLAUDE.md`/`AGENTS.md` references to the Supabase MCP;
   - the db-schema generator, if it calls the MCP;
   - the memory note on the shared database.

## Rollback

- **Before any writer is unfrozen (step 6):** point every consumer back at the
  hosted variables. Hosted has every row up to the freeze. Nothing is lost.
- **After unfreezing:** hosted is stale. Rolling back means dumping self-hosted
  (data only) and restoring it into hosted the same way, so decide within the
  first day.
- **Keep the hosted project for 14 days** after cutover with no consumers
  pointed at it. Then pause it if it is a free project, or remove it.
  **Removing a Marketplace store in Vercel deletes the Supabase project and its
  backups.** Take one last dump to B2 first, and only remove it once that
  dump has restored cleanly.

## Risks

| Risk | Mitigation |
|---|---|
| Droplet out of memory: Postgres killed, site down | Stripped-down stack, 2 GB swap, resize to 4 GB if Phase 2 shows the need (D5); DigitalOcean memory alert at 90%; `MemoryMax` on the job units |
| Droplet lost or disk corrupt | Nightly encrypted dumps off-droplet + monthly restore drill; weekly droplet backups; RPO about 24 h (add WAL archiving with `wal-g` only if that's too much) |
| API exposed on the internet | Only Kong behind Caddy TLS is public; Postgres is bound to localhost; RLS policies come over unchanged; the secret key never reaches the browser (already true) |
| Forgotten upgrades | Monthly changelog check; pinned tags make each upgrade a reviewable diff |
| Agent workflow breaks (no MCP) | Phase 3 lands before cutover |
| fantasy-pulse breaks | D1, D4, D6 answered first; rehearsed sign-in on its preview; its owner switches its variables |
| Single point of failure: droplet down takes the site *and* the jobs down | Accepted for a hobby project; Healthchecks `supabase-health` alerts within ~10 minutes |
