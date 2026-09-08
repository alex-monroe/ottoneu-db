import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { parseJson } from "@/lib/validate";
import { SaveBallotSchema } from "@/lib/schemas/power-ranking";
import { isCompleteBallot, saveBallot } from "@/lib/power-rankings";
import { fetchLeagueTeams } from "@/lib/team-binding";

/**
 * Save (or lock in) the signed-in host's ballot for one week.
 *
 * Middleware has already checked `is_podcaster` off the session cookie for
 * everything under /api/podcast, but the cookie is a 7-day snapshot, so the
 * role is re-read from the database here too. A host whose role was revoked
 * this morning should not still be able to write a ballot this afternoon.
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

  const parsed = await parseJson(req, SaveBallotSchema);
  if (!parsed.ok) return parsed.response;
  const { season, week, order, notes, submit } = parsed.data;

  // Drafts may be partial — that is the point of a draft. A submitted ballot
  // has to be a total order of the league, because consolidation averages
  // positions and a missing team would silently score as "unranked".
  if (submit) {
    const teams = await fetchLeagueTeams();
    if (!isCompleteBallot(order, teams)) {
      return NextResponse.json(
        {
          error:
            `Rank all ${teams.length} teams exactly once before locking the ballot in.`,
        },
        { status: 400 },
      );
    }
  }

  try {
    await saveBallot({ userId: user.userId, season, week, order, notes, submit });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not save the ballot";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  return NextResponse.json({ success: true, submitted: submit });
}
