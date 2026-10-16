import { ImageResponse } from "next/og";
import { fetchMatchup } from "@/lib/matchups";
import { OG_COLORS, OG_SIZE, OgFrame } from "@/lib/og";

export const alt = "SOFA DB game score";
export const size = OG_SIZE;
export const contentType = "image/png";

// Same cadence as the page: lineups are re-scraped every half hour in game
// windows, and the revalidate webhook refreshes it after each scrape.
export const revalidate = 300;

const STATUS_LABEL = { scheduled: "Upcoming", in_progress: "Live", final: "Final" } as const;

function Side({ name, score, winning }: { name: string; score: number | null; winning: boolean }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 32 }}>
      <div
        style={{
          display: "flex",
          flex: 1,
          fontSize: 52,
          fontWeight: winning ? 800 : 500,
          color: winning ? OG_COLORS.ink : OG_COLORS.muted,
        }}
      >
        {name}
      </div>
      <div
        style={{
          display: "flex",
          fontSize: 64,
          fontWeight: 800,
          color: winning ? OG_COLORS.ink : OG_COLORS.muted,
        }}
      >
        {score == null ? "—" : score.toFixed(1)}
      </div>
    </div>
  );
}

/** Link-preview card for one game: both teams, the score, and the state. */
export default async function Image({ params }: { params: Promise<{ gameId: string }> }) {
  const gameId = Number((await params).gameId);
  const game = Number.isInteger(gameId) && gameId > 0 ? await fetchMatchup(gameId) : null;

  if (!game) {
    return new ImageResponse(
      (
        <OgFrame eyebrow="Scoreboard" title="Game not found">
          <div style={{ display: "flex" }} />
        </OgFrame>
      ),
      size,
    );
  }

  const home = game.home_score ?? 0;
  const away = game.away_score ?? 0;
  const started = game.status !== "scheduled";

  return new ImageResponse(
    (
      <OgFrame eyebrow={`Week ${game.week} · ${STATUS_LABEL[game.status]}`} title="Scoreboard">
        <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
          <Side name={game.home_team_name} score={game.home_score} winning={!started || home >= away} />
          <Side name={game.away_team_name} score={game.away_score} winning={!started || away >= home} />
        </div>
      </OgFrame>
    ),
    size,
  );
}
