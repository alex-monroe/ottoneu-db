# Environment Variables

## Root `.env` (for Python scripts)

| Variable | Purpose |
|----------|---------|
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_KEY` | Supabase key used by `scripts/config.get_supabase_client()`. **Must be the service/secret key**, not the anon key: scrapers and the projection pipeline write to RLS-protected tables (e.g. `players`, `player_projections`, `draft_sharks_values`) that have only anon `SELECT` policies, so writes require a key that bypasses RLS. CI workflows source this from the `SUPABASE_SECRET_KEY` GitHub Actions secret. |
| `FANGRAPHS_USERNAME` | FanGraphs login username (for arbitration progress scraper) |
| `FANGRAPHS_PASSWORD` | FanGraphs login password (for arbitration progress scraper) |
| `OTTONEU_HOLDOUT_CACHE` | **Optional.** Absolute path to the holdout-eval cache dir (GH #629). Default: the main checkout's `.cache/holdout`, resolved via `git rev-parse --git-common-dir` so all worktrees share one cache. Set to override the location. |
| `OTTONEU_STORAGE_STATE` | **Optional.** Path to the Playwright `storage_state` JSON (cookies + localStorage) for an authenticated Ottoneu session. Default: `ottoneu_state.json` at the repo root (gitignored). Capture it with `just ottoneu-login`; the scraper worker loads it to clear the Cloudflare bot challenge on the search page. Absent → the worker browses anonymously (fine until Cloudflare challenges it). |
| `OTTONEU_HEADLESS` | **Optional.** Set to `0` to run the scraper's Chromium in a visible (non-headless) window — useful for debugging the Cloudflare challenge locally. Default headless. |

## `web/.env.local` (for Next.js)

| Variable | Purpose |
|----------|---------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key |
| `SUPABASE_SECRET_KEY` | Supabase secret key — bypasses RLS (server-side only). Also accepts `OTTONEU_DB_SUPABASE_SECRET_KEY` (Vercel integration) |
| `SESSION_SECRET` | Random string for HMAC session signing (server-side only). Also signs the MCP server's OAuth access and consent tokens (`web/lib/oauth/crypto.ts`) — payload type discriminators keep the two uses separate. **Rotating it invalidates every login session and every outstanding OAuth access token**; clients recover by re-running the OAuth flow. |
| `GITHUB_TOKEN` | **Optional.** Read-only GitHub token used by the `/admin/workflows` status page to raise the GitHub Actions API rate limit. The repo is public so the page works without it (60 req/hr unauthenticated); set it for headroom. Optionally pair with `GITHUB_REPO_OWNER` / `GITHUB_REPO_NAME` (default `alex-monroe` / `ottoneu-db`). |
| `MCP_API_KEY` | Shared bearer key for the remote MCP endpoint (`/api/mcp/mcp`). Generate with `openssl rand -hex 32`; also set in the Vercel project env for prod. Rotating it revokes access. Unset = the MCP endpoint rejects all requests (fails closed). See [mcp-server.md](mcp-server.md). |

## Templates

See `.env.example` and `web/.env.local.example` for templates.
