import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getLiveAccessState, type LiveAccessState } from "@/lib/auth";
import { parseJson } from "@/lib/validate";
import { DeleteTeamIconSchema, SetTeamIconSchema } from "@/lib/schemas/team-icon";
import { parseTeamIconDataUrl, teamIconKey } from "@/lib/team-icons";
import { deleteTeamIcon, saveTeamIcon } from "@/lib/team-icons-data";
import { fetchLeagueTeams } from "@/lib/team-binding";

const sameTeamName = (a: string, b: string | null) =>
  b != null && teamIconKey(a) === teamIconKey(b);

/**
 * Set or remove a team's icon.
 *
 * A manager may change only the team bound to their account, read live from
 * the database rather than the session cookie (a binding changed by an admin
 * an hour ago must take effect now). Admins may name any league team, so the
 * operator can set icons for managers who never sign in.
 */
async function resolveTarget(
  live: LiveAccessState,
  requested: string | undefined,
): Promise<{ team: string } | { error: string; status: number }> {
  if (requested && !sameTeamName(requested, live.teamName)) {
    if (!live.isAdmin) {
      return { error: "You can only change your own team's icon.", status: 403 };
    }
    const team = (await fetchLeagueTeams()).find((t) => teamIconKey(t) === teamIconKey(requested));
    return team ? { team } : { error: `No league team named "${requested}".`, status: 404 };
  }
  if (!live.teamName) {
    return { error: "Your account is not linked to a team yet — ask the league admin.", status: 400 };
  }
  return { team: live.teamName };
}

/** Icons appear in every layout; drop every cached render so they show now. */
function revalidateEverywhere() {
  revalidatePath("/", "layout");
}

export async function PUT(req: NextRequest) {
  const live = await getLiveAccessState();
  if (!live) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = await parseJson(req, SetTeamIconSchema);
  if (!parsed.ok) return parsed.response;

  const target = await resolveTarget(live, parsed.data.teamName);
  if ("error" in target) {
    return NextResponse.json({ error: target.error }, { status: target.status });
  }

  const icon = parseTeamIconDataUrl(parsed.data.dataUrl);
  if (!icon.ok) return NextResponse.json({ error: icon.error }, { status: 400 });

  try {
    await saveTeamIcon(target.team, icon, live.userId);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not save the icon";
    return NextResponse.json({ error: message }, { status: 500 });
  }
  revalidateEverywhere();
  return NextResponse.json({ success: true, teamName: target.team });
}

export async function DELETE(req: NextRequest) {
  const live = await getLiveAccessState();
  if (!live) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = await parseJson(req, DeleteTeamIconSchema);
  if (!parsed.ok) return parsed.response;

  const target = await resolveTarget(live, parsed.data.teamName);
  if ("error" in target) {
    return NextResponse.json({ error: target.error }, { status: target.status });
  }

  try {
    await deleteTeamIcon(target.team);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not remove the icon";
    return NextResponse.json({ error: message }, { status: 500 });
  }
  revalidateEverywhere();
  return NextResponse.json({ success: true, teamName: target.team });
}
