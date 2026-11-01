import { CalendarDays } from "lucide-react";
import ScoreboardCard from "@/components/ScoreboardCard";
import StandingsTable from "@/components/StandingsTable";
import { fetchLeagueStatus, fetchMatchupSeasons } from "@/lib/matchups";
import { fetchLiveTotals, fetchLiveWeek } from "@/lib/matchup-lineups";
import { isSettled, officialScores, shownScore, type LiveTotals } from "@/lib/live-score";
import { LIVE_REFRESH_SECONDS, fetchGamesAreLive } from "@/lib/live-worm";
import LiveRefresh from "@/components/LiveRefresh";
import { getPlayoffOdds } from "@/lib/playoff-odds-data";
import PlayoffOddsNote from "@/components/PlayoffOddsNote";
import { scoreboardProjection, type LiveGame } from "@/lib/live-matchup";
import { formatRecord } from "@/lib/standings";
import WeekPicker from "./WeekPicker";
import { getViewerTeam } from "@/lib/viewer-team";
import { teamHref } from "@/lib/teams";
import Link from "next/link";
import PageShell from "@/components/PageShell";
import TeamName from "@/components/TeamName";
import DataFreshness from "@/components/DataFreshness";

/**
 * The league's in-season status in one page: this week's scoreboard, the full
 * standings, and where the playoff field currently sits.
 *
 * Public — matchup results are league-wide facts anyone can read off Ottoneu,
 * so unlike the projection and valuation pages this one is not auth-gated.
 */

// Matchups are re-scraped every 5 minutes while games are being played, and
// each scrape pings the revalidate webhook; the five-minute timer is the
// fallback if that ping is missed.
export const revalidate = 300;

interface Props {
  searchParams: Promise<{ week?: string; season?: string }>;
}

function Empty({ message }: { message: string }) {
  return (
    <PageShell gap="none">
        <h1 className="text-3xl font-bold tracking-tight text-ink">
          Scoreboard
        </h1>
        <p className="mt-4 text-ink-subtle">{message}</p>
    </PageShell>
  );
}

/** "September 9 to September 15" for a week's date window. */
function weekWindow(starts: string | null, ends: string | null): string | null {
  if (!starts || !ends) return null;
  const fmt = (iso: string) =>
    new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      timeZone: "UTC",
    });
  return `${fmt(starts)} – ${fmt(ends)}`;
}

export default async function ScoreboardPage({ searchParams }: Props) {
  const params = await searchParams;
  // Null for anonymous visitors — this page is public, so the standings simply
  // highlight nobody rather than somebody else's team.
  const viewerTeam = await getViewerTeam();
  const seasons = await fetchMatchupSeasons();
  const requestedSeason = Number(params.season);
  const status = await fetchLeagueStatus(
    seasons.includes(requestedSeason) ? requestedSeason : undefined,
  );

  if (!status) {
    return (
      <Empty message="No schedule stored yet. Matchups are ingested from Ottoneu by `just scrape-matchups`." />
    );
  }

  const requestedWeek = Number(params.week);
  const week = status.weeks.includes(requestedWeek)
    ? requestedWeek
    : status.week ?? status.weeks[0];

  const slate = status.matchups.filter((m) => m.week === week);
  // Lineups exist only for weeks that were scraped while being played; for
  // any other week this is an empty map and the cards show scores alone.
  const [live, liveTotals, gamesAreLive]: [Map<number, LiveGame>, Map<number, LiveTotals>, boolean] =
    week != null
      ? await Promise.all([
          fetchLiveWeek(status.season, week),
          fetchLiveTotals(status.season, week, slate.map((m) => m.game_id)),
          fetchGamesAreLive(),
        ])
      : [new Map(), new Map(), false];
  // Headline scores: ESPN's live totals while games are on (lib/live-score.ts).
  const scores = new Map(
    slate.map((m) => {
      const game = live.get(m.game_id);
      return [
        m.game_id,
        shownScore({
          official: officialScores(m, game),
          live: liveTotals.get(m.game_id),
          gamesAreLive,
          settled: isSettled(m.status, game),
        }),
      ] as const;
    }),
  );
  const refreshing = gamesAreLive && slate.some((m) => m.status !== "final");
  // Odds are for the season being played; an older season picked from the
  // dropdown shows its final table alone.
  const currentOdds = await getPlayoffOdds();
  const odds = currentOdds?.season === status.season ? currentOdds : null;
  const window = weekWindow(slate[0]?.starts_on ?? null, slate[0]?.ends_on ?? null);
  const inField = status.playoffs.seeds.filter((s) => s.in_field);
  const chasing = status.playoffs.seeds.filter((s) => !s.in_field && !s.eliminated);

  return (
    <PageShell>
        <header className="space-y-3">
          <h1 className="text-3xl font-bold tracking-tight text-ink">
            Scoreboard
          </h1>
          <p className="text-ink-subtle">
            {status.season} head-to-head results and standings, scraped from the league.
            {!status.started && " The season has not started — this is the schedule as drawn."}
          </p>
          {/* The weekly loop runs scoreboard → your team → lineup; it used to
              dead-end here. */}
          <p className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
            {viewerTeam && (
              <Link href={teamHref(viewerTeam)} className="text-accent hover:underline">
                {viewerTeam} →
              </Link>
            )}
            <Link href="/lineup" className="text-accent hover:underline">
              Set a lineup →
            </Link>
          </p>
          <WeekPicker
            currentWeek={week}
            weeks={status.weeks}
            currentSeason={status.season}
            seasons={seasons}
          />
        </header>
      <DataFreshness source="matchups" />
      {refreshing && <LiveRefresh seconds={LIVE_REFRESH_SECONDS} />}

        <section>
          <h2 className="mb-3 flex flex-wrap items-center gap-2 text-sm font-semibold uppercase tracking-wide text-ink-subtle">
            Week {week}
            {window && (
              <span className="inline-flex items-center gap-1.5 font-normal normal-case tracking-normal text-ink-subtle">
                <CalendarDays size={14} aria-hidden="true" />
                {window}
              </span>
            )}
          </h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {slate.map((m) => {
              const score = scores.get(m.game_id) ?? null;
              const projection = scoreboardProjection(live.get(m.game_id));
              // Points so far are ESPN's while its score leads the card, so
              // shift the projection by the gap to keep the two agreeing.
              const shifted =
                projection && score?.official
                  ? {
                      home: projection.home + score.home - score.official.home,
                      away: projection.away + score.away - score.official.away,
                    }
                  : projection;
              return (
                <ScoreboardCard key={m.game_id} matchup={m} projection={shifted} score={score} />
              );
            })}
          </div>
          {live.size > 0 && (
            <p className="mt-2 text-xs text-ink-subtle">
              Proj is each lineup&apos;s live projection: points already scored plus the
              original projection of every starter still to play.
              {[...scores.values()].some((s) => s.official) &&
                " While NFL games are on, scores are live from ESPN's play-by-play, with Ottoneu's own score — the one the league is decided on — beneath each game."}
            </p>
          )}
        </section>

        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-subtle">
            Standings
          </h2>
          <StandingsTable playoffs={status.playoffs} viewerTeam={viewerTeam} odds={odds} />
          <p className="mt-2 text-xs text-ink-subtle">
            Derived from regular-season results only — playoff and consolation games do
            not count. Ties are broken by points for.
            {status.asOf && ` Last scraped ${new Date(status.asOf).toLocaleString()}.`}
          </p>
          {odds && <PlayoffOddsNote odds={odds} />}
        </section>

        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-subtle">
            Playoff picture
          </h2>
          {!status.playoffs.started ? (
            <p className="text-sm text-ink-subtle">
              Nothing to project until the first games are final. The league takes{" "}
              {status.playoffs.slots} playoff teams.
            </p>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-lg border border-line p-4">
                <h3 className="mb-2 text-sm font-semibold text-ink">
                  In the field ({status.playoffs.slots} spots)
                </h3>
                <ol className="space-y-1 text-sm">
                  {inField.map((s) => (
                    <li key={s.team_id} className="flex justify-between gap-3">
                      <span className="truncate text-ink-muted">
                        {s.seed}. <TeamName name={s.team_name} plain />
                        {s.clinched && (
                          <span className="ml-2 text-[11px] font-semibold uppercase text-positive">
                            clinched
                          </span>
                        )}
                      </span>
                      <span className="shrink-0 tabular-nums text-ink-subtle">
                        {formatRecord(s)}
                      </span>
                    </li>
                  ))}
                </ol>
              </div>
              <div className="rounded-lg border border-line p-4">
                <h3 className="mb-2 text-sm font-semibold text-ink">
                  Still chasing
                </h3>
                {chasing.length === 0 ? (
                  <p className="text-sm text-ink-subtle">
                    Everyone outside the field is mathematically eliminated.
                  </p>
                ) : (
                  <ol className="space-y-1 text-sm">
                    {chasing.map((s) => (
                      <li key={s.team_id} className="flex justify-between gap-3">
                        <span className="truncate text-ink-muted">
                          <TeamName name={s.team_name} plain />
                        </span>
                        <span className="shrink-0 tabular-nums text-ink-subtle">
                          {formatRecord(s)} · {s.games_back} GB
                        </span>
                      </li>
                    ))}
                  </ol>
                )}
                <p className="mt-3 text-xs text-ink-subtle">
                  Clinched and eliminated are called only when the arithmetic settles
                  them outright; tiebreakers can decide a spot sooner than this says.
                </p>
              </div>
            </div>
          )}
        </section>
    </PageShell>
  );
}
