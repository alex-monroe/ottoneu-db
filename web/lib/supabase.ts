
import { createClient, SupabaseClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

/** Public client using the anon/publishable key — subject to RLS policies. */
import { Database } from "../types/supabase"

export const supabase = createClient<Database>(supabaseUrl, supabaseKey)

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
