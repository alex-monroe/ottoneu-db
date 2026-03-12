# Environment Variables

## Root `.env` (for Python scripts)

| Variable | Purpose |
|----------|---------|
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_KEY` | Supabase anon/service key |

## `web/.env.local` (for Next.js)

| Variable | Purpose |
|----------|---------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key |
| `SUPABASE_SECRET_KEY` | Supabase secret key — bypasses RLS (server-side only). Also accepts `OTTONEU_DB_SUPABASE_SECRET_KEY` (Vercel integration) |
| `SESSION_SECRET` | Random string for HMAC session signing (server-side only) |

## Templates

See `.env.example` and `web/.env.local.example` for templates.
