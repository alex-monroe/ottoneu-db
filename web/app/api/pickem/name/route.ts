import { NextRequest, NextResponse } from "next/server";
import { getLiveAccessState } from "@/lib/auth";
import { parseJson } from "@/lib/validate";
import { SetPickemNameSchema } from "@/lib/schemas/pickem";
import {
  displayNameProblem,
  NameTakenError,
  normalizeDisplayName,
  saveDisplayName,
} from "@/lib/pickem";
import { fetchLeagueTeams } from "@/lib/team-binding";

/**
 * Set the name a player appears under on the pick'em board.
 *
 * The bound team is read live from the database rather than the session: it
 * decides whether this account may use a franchise's name, so a stale cookie
 * must not be what answers that.
 */
export async function PUT(req: NextRequest) {
  const live = await getLiveAccessState();
  if (!live) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = await parseJson(req, SetPickemNameSchema);
  if (!parsed.ok) return parsed.response;

  const displayName = normalizeDisplayName(parsed.data.displayName);
  const problem = displayNameProblem(displayName, await fetchLeagueTeams(), live.teamName);
  if (problem) return NextResponse.json({ error: problem }, { status: 400 });

  try {
    await saveDisplayName(live.userId, displayName);
  } catch (err) {
    if (err instanceof NameTakenError) {
      return NextResponse.json(
        { error: `Someone is already playing as "${displayName}".` },
        { status: 409 },
      );
    }
    const message = err instanceof Error ? err.message : "Could not save the name";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  return NextResponse.json({ success: true, displayName });
}
