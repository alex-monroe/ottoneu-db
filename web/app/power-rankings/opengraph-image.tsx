import { ImageResponse } from "next/og";
import { fetchPowerRankingContext } from "@/lib/power-rankings";
import { fetchCommunityRankings, fetchPublicationStatuses } from "@/lib/community-rankings";
import { discordMovement } from "@/lib/discord-power-rankings";
import { OG_COLORS, OG_SIZE, OgFrame } from "@/lib/og";

export const alt = "SOFA DB community power rankings";
export const size = OG_SIZE;
export const contentType = "image/png";

// Link previews are fetched by chat apps, not people; an hour is plenty fresh
// and keeps the image from re-rendering on every unfurl.
export const revalidate = 3600;

const TOP_N = 5;

/**
 * Link-preview card for `/power-rankings`: the latest *published* week's top
 * five. Never shows an unpublished week — crawlers are anonymous, so they get
 * what an anonymous visitor would see. The image can't read `?week=`, so a
 * link to an older week still previews the latest one.
 */
export default async function Image() {
  const ctx = await fetchPowerRankingContext();
  const statuses = await fetchPublicationStatuses(ctx.season, ctx.weeks);
  const publicWeeks = ctx.weeks.filter((w) => statuses[w].isPublic);
  const week = publicWeeks[publicWeeks.length - 1];

  const rows =
    week === undefined
      ? []
      : (await fetchCommunityRankings(ctx.season, week, ctx.teams)).rows.slice(0, TOP_N);

  return new ImageResponse(
    (
      <OgFrame
        eyebrow="Community power rankings"
        title={week === undefined ? `${ctx.season} power rankings` : `Week ${week} power rankings`}
      >
        {rows.length === 0 ? (
          <div style={{ display: "flex", fontSize: 36, color: OG_COLORS.muted }}>
            Rankings go public Thursday morning.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {rows.map((row) => {
              const move = discordMovement(row.movement);
              return (
                <div key={row.teamName} style={{ display: "flex", alignItems: "center", gap: 28 }}>
                  <div
                    style={{
                      display: "flex",
                      width: 64,
                      justifyContent: "flex-end",
                      fontSize: 48,
                      fontWeight: 800,
                      color: OG_COLORS.ink,
                    }}
                  >
                    {row.rank}
                  </div>
                  <div style={{ display: "flex", flex: 1, fontSize: 44, color: OG_COLORS.ink }}>
                    {row.teamName}
                  </div>
                  <div
                    style={{
                      display: "flex",
                      fontSize: 36,
                      color:
                        row.movement && row.movement > 0
                          ? OG_COLORS.up
                          : row.movement && row.movement < 0
                            ? OG_COLORS.down
                            : OG_COLORS.muted,
                    }}
                  >
                    {move}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </OgFrame>
    ),
    size,
  );
}
