import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth";
import { parseJson } from "@/lib/validate";
import { SavePickSchema } from "@/lib/schemas/pickem";
import { fetchDisplayName, fetchPickemWeek, savePick } from "@/lib/pickem";

/**
 * Save, change or clear one pick'em pick.
 *
 * Middleware requires a session for every /api route. Beyond that, everything
 * the client says is checked against the server's own schedule and clock:
 *
 * - **Only the current week, and only before it locks.** A pick that arrives
 *   a second after Thursday's lock is refused, whatever the page last showed.
 * - **The game must be in that week, and the team must be playing in it.**
 * - **A board name first.** The board is public, and a pick with no name to
 *   show it under would be counted invisibly.
 */
export async function PUT(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = await parseJson(req, SavePickSchema);
  if (!parsed.ok) return parsed.response;
  const { season, week, gameId, teamId } = parsed.data;

  const ctx = await fetchPickemWeek(week);
  if (!ctx || ctx.season !== season || ctx.week !== week || !ctx.open) {
    return NextResponse.json(
      { error: `Picks for week ${week} are locked.` },
      { status: 409 },
    );
  }

  const game = ctx.games.find((g) => g.game_id === gameId);
  if (!game) {
    return NextResponse.json({ error: "That game isn't on this week's slate." }, { status: 400 });
  }
  if (teamId !== null && teamId !== game.home_team_id && teamId !== game.away_team_id) {
    return NextResponse.json({ error: "That team isn't playing in this game." }, { status: 400 });
  }

  if (!(await fetchDisplayName(user.userId))) {
    return NextResponse.json(
      { error: "Choose the name you'll appear under on the board first." },
      { status: 409 },
    );
  }

  try {
    await savePick({ userId: user.userId, season, week, gameId, teamId });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not save the pick";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
