/**
 * Server-side data for the mock-draft tool: seed every team's current keeper
 * roster (from league_prices) and the free-agent pool priced by Draft Sharks
 * superflex market value — the same inputs scripts/auction_simulator.py uses.
 * See docs/references/mock-draft.md.
 */
import { CAP_PER_TEAM } from "@/lib/config";
import type { FAPlayer, Pos, RosterPlayer } from "@/lib/mock-draft-engine";
import { POS_LIST } from "@/lib/mock-draft-engine";
import { fetchRosterData } from "@/lib/roster-reconstruction";
import { getLeagueSeason } from "@/lib/season";
import { fetchAllRows, supabase } from "@/lib/supabase";

export interface MockDraftTeamSeed {
  name: string;
  roster: RosterPlayer[];
  committed: number;
  cap: number;
}

export interface MockDraftData {
  teams: MockDraftTeamSeed[];
  faPool: FAPlayer[];
  season: number;
}

const isPos = (p: string): p is Pos => (POS_LIST as string[]).includes(p);

export async function fetchMockDraftData(): Promise<MockDraftData> {
  const season = await getLeagueSeason();

  const [rd, dsv] = await Promise.all([
    fetchRosterData(),
    // draft_sharks_values for the draft season (a few hundred rows; paginate to be safe)
    fetchAllRows<{ player_id: string; market_auction_value: number | null }>((from, to) =>
      supabase
        .from("draft_sharks_values")
        .select("player_id, market_auction_value")
        .eq("season", season)
        .order("player_id")
        .range(from, to),
    ),
  ]);

  const mvMap = new Map<string, number>(
    dsv.map((r) => [r.player_id, r.market_auction_value ?? 0]),
  );
  const playerMap = new Map(rd.players.map((p) => [p.id, p]));

  // Seed rosters from current league_prices (non-FA rows).
  const rosterByTeam = new Map<string, RosterPlayer[]>();
  const rosteredIds = new Set<string>();
  for (const lp of rd.leaguePrices) {
    const team = lp.team_name;
    if (!team || team === "FA") continue;
    const pl = playerMap.get(lp.player_id);
    if (!pl || !isPos(pl.position)) continue;
    rosteredIds.add(lp.player_id);
    const slots = rosterByTeam.get(team) ?? [];
    slots.push({
      id: pl.id,
      name: pl.name,
      pos: pl.position,
      salary: lp.price ?? 0,
      mv: mvMap.get(pl.id) ?? 0,
    });
    rosterByTeam.set(team, slots);
  }

  const teams: MockDraftTeamSeed[] = [...rosterByTeam.entries()]
    .map(([name, roster]) => {
      const c = roster.reduce((a, p) => a + p.salary, 0);
      return { name, roster, committed: c, cap: CAP_PER_TEAM - c };
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  // FA pool = valued players (mv > 0) not on any roster, richest first.
  const faPool: FAPlayer[] = rd.players
    .filter((p) => isPos(p.position) && !rosteredIds.has(p.id) && (mvMap.get(p.id) ?? 0) > 0)
    .map((p) => ({
      id: p.id,
      name: p.name,
      pos: p.position as Pos,
      mv: mvMap.get(p.id) as number,
      nflTeam: p.nfl_team,
    }))
    .sort((a, b) => b.mv - a.mv);

  return { teams, faPool, season };
}
