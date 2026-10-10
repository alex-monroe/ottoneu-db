
import { createClient, SupabaseClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

/** Public client using the anon/publishable key — subject to RLS policies. */
import { Database } from "../types/supabase"

export const supabase = createClient<Database>(supabaseUrl || "http://localhost:54321", supabaseKey || "fake-anon-key")

// NOTE: The players table has 3000+ rows (most from historical backfill with
// negative synthetic ottoneu_ids). Web queries add .gt("ottoneu_id", 0) to
// filter to scraper-origin players — but that set is now >1000 (1,252+), so
// .gt() alone NO LONGER avoids the PostgREST 1000-row cap. Any read that can
// exceed 1000 rows (players, league_prices/transactions for the league,
// player_projections for a season) MUST page through with fetchAllRows below.

/**
 * Page through a Supabase query past PostgREST's 1000-row default cap.
 *
 * Pass a builder that applies a STABLE `.order(...)` AND `.range(from, to)` to
 * your filtered query, e.g.:
 *   const rows = await fetchAllRows((from, to) =>
 *     supabase.from("players").select("*").gt("ottoneu_id", 0).order("id").range(from, to));
 *
 * A plain `.select()` silently returns only the first 1000 rows, which on this
 * project drops ~20% of players and full player-seasons from analysis pages.
 *
 * The `.order("id")` (or any unique-column order) is REQUIRED, not optional:
 * PostgREST/Postgres do not guarantee a stable row order across requests without
 * an ORDER BY, so successive `.range()` pages can overlap — silently dropping
 * rows from the final result (e.g. 1,252 players collapsed to 1,070 unique,
 * stranding individual players like a rookie projection). Always order by the
 * primary key (`id` works even when not in the `select` list).
 * `web/__tests__/lib/architecture.test.ts` enforces `.order("id")` on every
 * paged read.
 *
 * Runtime backstop: when the rows carry an `id`, a repeated id means the pages
 * overlapped — an unstable order, or rows written mid-read — and that some
 * other row was probably skipped. The duplicate is dropped (a primary key can't
 * legitimately appear twice) and the overlap is logged, so it surfaces in the
 * server logs instead of as a silently missing player.
 */
export async function fetchAllRows<T>(
  buildPage: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
): Promise<T[]> {
  const pageSize = 1000;
  const out: T[] = [];
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await buildPage(offset, offset + pageSize - 1);
    if (error) throw new Error(error.message);
    if (!data || data.length === 0) break;
    out.push(...data);
    if (data.length < pageSize) break;
  }
  return dropOverlappingRows(out);
}

/** Exported for tests. See fetchAllRows. */
export function dropOverlappingRows<T>(rows: T[]): T[] {
  const ids = new Set<unknown>();
  const kept: T[] = [];
  let duplicates = 0;
  for (const row of rows) {
    const id = (row as { id?: unknown } | null)?.id;
    if (id == null) {
      kept.push(row);
      continue;
    }
    if (ids.has(id)) {
      duplicates++;
      continue;
    }
    ids.add(id);
    kept.push(row);
  }
  if (duplicates > 0) {
    console.error(
      `fetchAllRows: ${duplicates} duplicate id(s) across pages — the query's order is ` +
        `not stable (add .order("id")) or rows changed mid-read; other rows may be missing.`,
    );
  }
  return kept;
}

/**
 * Server-side admin client using the secret key — bypasses RLS.
 * Only use in server components, API routes, and server-side auth logic.
 * Never import this in client components.
 *
 * Lazily initialized to avoid crashing when the env var is not yet set
 * (e.g. during build or in client bundles that tree-shake this away).
 */
let _supabaseAdmin: SupabaseClient<Database> | null = null

export function getSupabaseAdmin(): SupabaseClient<Database> {
  if (!_supabaseAdmin) {
    const secretKey = process.env.SUPABASE_SECRET_KEY ?? process.env.OTTONEU_DB_SUPABASE_SECRET_KEY
    if (!secretKey) {
      throw new Error(
        'SUPABASE_SECRET_KEY is not set. Add it to web/.env.local (get it from Supabase Dashboard > Settings > API Keys).'
      )
    }
    _supabaseAdmin = createClient<Database>(supabaseUrl, secretKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    })
  }
  return _supabaseAdmin
}
