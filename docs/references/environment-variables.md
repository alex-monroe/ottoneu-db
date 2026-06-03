# Environment Variables

## Root `.env` (for Python scripts)

| Variable | Purpose |
|----------|---------|
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_KEY` | Supabase key used by `scripts/config.get_supabase_client()`. **Must be the service/secret key**, not the anon key: scrapers and the projection pipeline write to RLS-protected tables (e.g. `players`, `player_projections`, `draft_sharks_values`) that have only anon `SELECT` policies, so writes require a key that bypasses RLS. CI workflows source this from the `SUPABASE_SECRET_KEY` GitHub Actions secret. |
| `FANGRAPHS_USERNAME` | FanGraphs login username (required by the arbitration-progress and league-calendar scrapers — Ottoneu is hosted under FanGraphs auth) |
| `FANGRAPHS_PASSWORD` | FanGraphs login password (same scrapers as above) |
| `SEASON_OVERRIDE` | Optional. Short-circuits the date-driven season resolver — set to a season label (e.g. `2026`) for testing or off-schedule Ottoneu events. Read by both `scripts/season.py` and `web/lib/season.ts` (server-side), so a single env-var set covers Python + Next.js. |
| `PHASE_OVERRIDE` | Optional. Short-circuits the resolver's phase (`pre_arb` / `pre_keeper` / `pre_draft` / `in_season`); pairs with `SEASON_OVERRIDE`. Same dual-consumer behavior as above. |

## `web/.env.local` (for Next.js)

| Variable | Purpose |
|----------|---------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key |
| `SUPABASE_SECRET_KEY` | Supabase secret key — bypasses RLS (server-side only). Also accepts `OTTONEU_DB_SUPABASE_SECRET_KEY` (Vercel integration) |
| `SESSION_SECRET` | Random string for HMAC session signing (server-side only) |

## Templates

See `.env.example` and `web/.env.local.example` for templates.
