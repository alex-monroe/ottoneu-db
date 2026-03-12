
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

/** Public client using the anon/publishable key — subject to RLS policies. */
export const supabase = createClient(supabaseUrl, supabaseKey)

/**
 * Server-side admin client using the secret key — bypasses RLS.
 * Only use in server components, API routes, and server-side auth logic.
 * Never import this in client components.
 */
export const supabaseAdmin = createClient(
  supabaseUrl,
  process.env.SUPABASE_SECRET_KEY!,
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  }
)
