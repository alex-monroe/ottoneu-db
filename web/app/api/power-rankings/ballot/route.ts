import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { parseJson } from "@/lib/validate";
import { SaveListenerBallotSchema } from "@/lib/schemas/power-ranking";
import {
  fetchPowerRankingContext,
  isCompleteBallot,
  saveBallot,
} from "@/lib/power-rankings";
import { fetchPublicationStatus, listenerVotingOpen } from "@/lib/community-rankings";

/**
 * Save (or lock in) a listener's community power-ranking ballot.
 *
 * Middleware requires a session for every /api route. Beyond that:
 *
 * - **Hosts are turned away**, with the role read live from the database. A
 *   host's ballot already counts towards the community ranking; letting them
 *   save one here would convert it to a listener ballot and pull it out of the
 *   reveal.
 * - **Only the current week, and only until it is public.** Checked against
 *   the server's own week and publication state, not the client's claim.
 */
export async function PUT(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: account } = await getSupabaseAdmin()
    .from("users")
    .select("is_podcaster")
    .eq("id", user.userId)
    .single();
  if (!account) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (account.is_podcaster) {
    return NextResponse.json(
      { error: "Hosts vote on the podcast ballot, which already counts here." },
      { status: 403 },
    );
  }

  const parsed = await parseJson(req, SaveListenerBallotSchema);
  if (!parsed.ok) return parsed.response;
  const { season, week, order, submit } = parsed.data;

  const ctx = await fetchPowerRankingContext();
  const status = await fetchPublicationStatus(ctx.season, ctx.week);
  if (season !== ctx.season || !listenerVotingOpen(week, ctx.week, status)) {
    return NextResponse.json(
      { error: `Voting for week ${week} is closed.` },
      { status: 409 },
    );
  }

  if (submit && !isCompleteBallot(order, ctx.teams)) {
    return NextResponse.json(
      { error: `Rank all ${ctx.teams.length} teams exactly once before locking your ballot in.` },
      { status: 400 },
    );
  }

  try {
    await saveBallot({ userId: user.userId, voterKind: "listener", season, week, order, submit });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not save the ballot";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  return NextResponse.json({ success: true, submitted: submit });
}
