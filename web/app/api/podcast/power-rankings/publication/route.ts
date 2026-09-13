import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { parseJson } from "@/lib/validate";
import { SetPublicationSchema } from "@/lib/schemas/power-ranking";
import { setPublication } from "@/lib/community-rankings";

/**
 * Publish a week's community ranking early, hold it back past Thursday, or
 * return it to the schedule. Hosts only — under /api/podcast, so middleware
 * checks the cookie, and the role is re-read live here like the ballot route.
 */
export async function PUT(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: account } = await getSupabaseAdmin()
    .from("users")
    .select("is_podcaster")
    .eq("id", user.userId)
    .single();
  if (!account?.is_podcaster) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const parsed = await parseJson(req, SetPublicationSchema);
  if (!parsed.ok) return parsed.response;
  const { season, week, action } = parsed.data;

  try {
    await setPublication(season, week, action, user.userId);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not update the publication";
    return NextResponse.json({ error: message }, { status: 500 });
  }
  return NextResponse.json({ success: true });
}
