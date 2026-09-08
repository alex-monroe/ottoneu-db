import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getAuthenticatedUser, setAuthCookie } from "@/lib/auth";

/**
 * Re-sign the session cookie from the current database row.
 *
 * The cookie carries `is_admin` / `has_projections_access` / `is_podcaster` for 7 days so that
 * middleware can gate without a DB round-trip. That means a user granted access
 * keeps being turned away until the cookie expires. /access calls this so the
 * grant takes effect immediately instead of on the next sign-in.
 */
export async function POST() {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await getSupabaseAdmin()
    .from("users")
    .select("id, is_admin, has_projections_access, is_podcaster")
    .eq("id", user.userId)
    .single();

  if (error || !data) {
    return NextResponse.json({ error: "Account not found" }, { status: 404 });
  }

  await setAuthCookie(
    data.id,
    data.is_admin,
    data.has_projections_access,
    data.is_podcaster,
  );
  return NextResponse.json({
    success: true,
    hasProjectionsAccess: data.has_projections_access,
    isPodcaster: data.is_podcaster,
  });
}
