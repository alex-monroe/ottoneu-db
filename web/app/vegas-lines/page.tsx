import { fetchAvailableSeasons, fetchVegasLinesForSeason } from "@/lib/vegas-lines";
import { DIVISIONS, TEAM_NAME_BY_CODE } from "@/lib/nfl-divisions";
import SeasonSelector from "./SeasonSelector";
import PageShell from "@/components/PageShell";

export const revalidate = 3600;

interface Props {
  searchParams: Promise<{ season?: string }>;
}

function formatNumber(value: number, fractionDigits = 1): string {
  return value.toLocaleString("en-US", {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  });
}

export default async function VegasLinesPage({ searchParams }: Props) {
  const params = await searchParams;
  const seasons = await fetchAvailableSeasons();

  if (seasons.length === 0) {
    return (
      <PageShell width="wide" gap="none">
          <h1 className="text-3xl font-bold tracking-tight text-ink">
            Preseason Vegas Lines
          </h1>
          <p className="text-ink-subtle mt-4">
            No data available. Run{" "}
            <code className="px-1.5 py-0.5 rounded bg-sunken text-xs">
              venv/bin/python scripts/backfill_vegas_lines.py
            </code>{" "}
            to populate the <code>team_vegas_lines</code> table.
          </p>
      </PageShell>
    );
  }

  const requested = Number(params.season);
  const targetSeason = seasons.includes(requested) ? requested : seasons[0];

  const rows = await fetchVegasLinesForSeason(targetSeason);
  const lineByTeam = new Map(rows.map((r) => [r.team, r]));

  const totalsForLeagueMean = rows
    .map((r) => r.implied_total)
    .filter((v): v is number => v !== null);
  const leagueMean =
    totalsForLeagueMean.length > 0
      ? totalsForLeagueMean.reduce((sum, v) => sum + v, 0) / totalsForLeagueMean.length
      : null;
  const hasImpliedTotals = totalsForLeagueMean.length > 0;

  const knownCodes = new Set(
    DIVISIONS.flatMap((d) => d.teams.map((t) => t.code)),
  );
  const unknownTeams = rows.filter((r) => !knownCodes.has(r.team));

  const afcDivisions = DIVISIONS.filter((d) => d.conference === "AFC");
  const nfcDivisions = DIVISIONS.filter((d) => d.conference === "NFC");

  return (
    <PageShell width="wide">
        <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-ink">
              Preseason Vegas Lines — {targetSeason}
            </h1>
            <p className="text-ink-subtle mt-1 text-sm">
              Per-team season implied total points and Pythagorean expected
              wins, aggregated from nflverse game lines. Available as the
              <code className="ml-1">implied_team_total_raw</code> feature for
              projection models — see <a href="/projections" className="underline">/projections</a>{" "}
              for which model is currently active.
            </p>
          </div>
          <SeasonSelector currentSeason={targetSeason} seasons={seasons} />
        </header>

        {hasImpliedTotals && leagueMean !== null ? (
          <section className="rounded-lg border border-line bg-sunken px-4 py-3 text-sm text-ink-muted">
            <span className="font-medium text-ink">
              League average implied total:
            </span>{" "}
            {formatNumber(leagueMean, 1)} points · {rows.length} teams ·
            sum-of-game-implied-points across the regular season.
          </section>
        ) : (
          <section className="rounded-lg border border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-950 px-4 py-3 text-sm text-amber-900 dark:text-amber-200">
            <span className="font-medium">Implied totals not yet available for {targetSeason}.</span>{" "}
            Win totals are sportsbook preseason consensus; per-game lines (and
            therefore implied totals) populate once the NFL schedule is released
            and nflverse picks it up. Run{" "}
            <code className="px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-900/40 text-xs">
              venv/bin/python scripts/backfill_vegas_lines.py
            </code>{" "}
            after schedule release to backfill.
          </section>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <ConferenceSection
            label="AFC"
            divisions={afcDivisions}
            lineByTeam={lineByTeam}
            leagueMean={leagueMean}
          />
          <ConferenceSection
            label="NFC"
            divisions={nfcDivisions}
            lineByTeam={lineByTeam}
            leagueMean={leagueMean}
          />
        </div>

        {unknownTeams.length > 0 && (
          <section className="rounded-lg border border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-950 px-4 py-3 text-sm text-amber-900 dark:text-amber-200">
            <strong>Unmapped teams:</strong>{" "}
            {unknownTeams.map((u) => u.team).join(", ")}. Update{" "}
            <code>web/lib/nfl-divisions.ts</code> if a relocation has occurred.
          </section>
        )}
    </PageShell>
  );
}

type LineForTeam = { implied_total: number | null; win_total: number | null };

function ConferenceSection({
  label,
  divisions,
  lineByTeam,
  leagueMean,
}: {
  label: string;
  divisions: typeof DIVISIONS;
  lineByTeam: Map<string, LineForTeam>;
  leagueMean: number | null;
}) {
  return (
    <section className="space-y-4">
      <h2 className="text-xs font-bold uppercase tracking-widest text-ink-subtle">
        {label}
      </h2>
      <div className="space-y-4">
        {divisions.map((division) => (
          <DivisionCard
            key={`${division.conference}-${division.direction}`}
            label={`${division.conference} ${division.direction}`}
            teams={division.teams}
            lineByTeam={lineByTeam}
            leagueMean={leagueMean}
          />
        ))}
      </div>
    </section>
  );
}

function DivisionCard({
  label,
  teams,
  lineByTeam,
  leagueMean,
}: {
  label: string;
  teams: readonly { code: string; name: string }[];
  lineByTeam: Map<string, LineForTeam>;
  leagueMean: number | null;
}) {
  const sorted = [...teams].sort((a, b) => {
    const aWins = lineByTeam.get(a.code)?.win_total ?? -Infinity;
    const bWins = lineByTeam.get(b.code)?.win_total ?? -Infinity;
    return bWins - aWins;
  });

  return (
    <div className="rounded-lg border border-line bg-raised overflow-hidden">
      <div className="px-4 py-2 border-b border-line bg-sunken">
        <h3 className="text-sm font-semibold text-ink">
          {label}
        </h3>
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-xs uppercase tracking-wide text-ink-subtle">
            <th className="px-4 py-2 text-left font-medium">Team</th>
            <th className="px-4 py-2 text-right font-medium">Implied Total</th>
            <th className="px-4 py-2 text-right font-medium">Win Total</th>
            <th className="px-4 py-2 text-right font-medium">vs League</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((team) => {
            const line = lineByTeam.get(team.code);
            const delta =
              line && line.implied_total !== null && leagueMean !== null
                ? line.implied_total - leagueMean
                : null;
            return (
              <tr
                key={team.code}
                className="border-t border-slate-100 dark:border-slate-900"
              >
                <td className="px-4 py-2">
                  <div className="font-medium text-ink">
                    {TEAM_NAME_BY_CODE[team.code] ?? team.name}
                  </div>
                  <div className="text-xs text-ink-subtle">
                    {team.code}
                  </div>
                </td>
                <td className="px-4 py-2 text-right font-mono text-ink">
                  {line && line.implied_total !== null
                    ? formatNumber(line.implied_total, 1)
                    : "—"}
                </td>
                <td className="px-4 py-2 text-right font-mono text-ink">
                  {line && line.win_total !== null
                    ? formatNumber(line.win_total, 1)
                    : "—"}
                </td>
                <td
                  className={`px-4 py-2 text-right font-mono ${
                    delta === null
                      ? "text-ink-subtle"
                      : delta > 0
                        ? "text-positive"
                        : delta < 0
                          ? "text-rose-600 dark:text-rose-400"
                          : "text-slate-500"
                  }`}
                >
                  {delta === null
                    ? "—"
                    : `${delta >= 0 ? "+" : ""}${formatNumber(delta, 1)}`}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
