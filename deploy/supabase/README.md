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

## Check it

`ottoneu-supabase-health.timer` ([deploy/droplet/](../droplet/README.md))
alerts through Healthchecks if `https://db.rosterloom.com` stops answering. By
hand:

```bash
~/ottoneu-db/deploy/droplet/supabase-health.sh
```

Measured at Phase 1 (empty database): the five containers use ~265 MB. The
droplet had 1.3 GB available.
