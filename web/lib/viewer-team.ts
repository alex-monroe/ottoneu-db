/**
 * Whose team is "my team" for the person looking at the page.
 *
 * Before this module, `MY_TEAM` from config.json was the answer for everybody:
 * a single constant naming the operator's team, referenced by a dozen
 * components (page titles, surplus highlight rules, the lineup default, the
 * standings bold row, arbitration target exclusion). Every signed-in leaguemate
 * saw the operator's roster labelled as their own.
 *
 * The viewer's team now comes from `users.team_name`. `MY_TEAM` survives only
 * as the operator's default, applied to admin accounts not yet bound to a team
 * — never to an ordinary account.
 *
 * Server-only: reads the session cookie. Client components receive the resolved
 * team as a prop. Callers that already hold a user id (the MCP layer) should
 * use `getTeamForUser` from `./team-binding` instead, which skips the session.
 */

import { cache } from "react";
import { getAuthenticatedUser } from "./auth";
import { getTeamForUser } from "./team-binding";

export { getTeamForUser, fetchLeagueTeams } from "./team-binding";

/**
 * The signed-in user's team, or null when nobody is signed in / no team is
 * bound. React-cached, so the several components that need it during one
 * render share a single query.
 */
export const getViewerTeam = cache(async (): Promise<string | null> => {
  const user = await getAuthenticatedUser();
  if (!user) return null;
  return getTeamForUser(user.userId);
});
