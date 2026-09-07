import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getAuthenticatedUser } from "@/lib/auth";

/**
 * Flag the signed-in account as wanting projections access.
 *
 * This is the "notify the admin" channel: there is no mail infrastructure in
 * this app, so a request is a timestamp on the user row that surfaces as a
 * pending row at the top of /admin. Self-registration sets it too, so every new
 * account arrives in the queue.
 *
 * A session is required — middleware enforces that for every non-public API
 * route, and this handler re-checks rather than trusting it.
 */
export async function POST() {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (user.hasProjectionsAccess) {
    return NextResponse.json({ success: true, alreadyGranted: true });
  }

  // Only stamp the first request, so re-clicking doesn't move the account to
  // the back of an admin's queue.
  const { error } = await getSupabaseAdmin()
    .from("users")
    .update({ access_requested_at: new Date().toISOString() })
    .eq("id", user.userId)
    .is("access_requested_at", null);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
