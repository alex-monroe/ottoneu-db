"use client";

/**
 * Makes every team's icon available wherever a team name is rendered.
 *
 * Team names appear in standings, scoreboards, rosters, DataTable owner
 * columns, the arbitration tools and the podcast pages — server and client
 * components alike, most fed rows that know nothing about icons. Like
 * `PositionalRanksProvider`, the root layout reads the (tiny) version map once
 * and provides it here; `TeamName` and `TeamIcon` look their team up, so a new
 * list gets the icon by default.
 */
import { createContext, useContext, type ReactNode } from "react";
import { lookupTeamIcon } from "@/lib/team-icons";
import type { TeamIconVersions } from "@/lib/types";

const TeamIconsContext = createContext<TeamIconVersions | null>(null);

export default function TeamIconsProvider({
  versions,
  children,
}: {
  versions: TeamIconVersions | null;
  children: ReactNode;
}) {
  return <TeamIconsContext.Provider value={versions}>{children}</TeamIconsContext.Provider>;
}

/** This team's icon URL, or null (no icon, a free agent, or no provider). */
export function useTeamIconSrc(name: string | null | undefined): string | null {
  return lookupTeamIcon(useContext(TeamIconsContext), name);
}
