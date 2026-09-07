import Link from "next/link";
import {
  Users,
  ClipboardList,
  LayoutGrid,
  BarChart3,
  LineChart,
  DollarSign,
  Target,
  Gavel,
  Activity,
  Eye,
  Lock,
  ArrowRight,
  Swords,
  Shield,
  UserPlus,
  type LucideIcon,
} from "lucide-react";
import { getSeasonContextNow } from "@/lib/season";
import { PHASE_UI } from "@/lib/season-ui";
import { getAuthenticatedUser } from "@/lib/auth";
import { getViewerTeam } from "@/lib/viewer-team";
import { toTeamGame } from "@/lib/teams";
import { getLeagueStatus } from "@/lib/matchups";
import { NAV_GROUPS, HUB_EXCLUDED_GROUPS, canSee, type NavItem, type Viewer } from "@/lib/nav";
import ScoreboardCard from "@/components/ScoreboardCard";
import StandingsTable from "@/components/StandingsTable";
import TeamName from "@/components/TeamName";
import { LEAGUE_ID } from "@/lib/config";
import PageShell, { PageHeader } from "@/components/PageShell";

export const revalidate = 3600; // Revalidate every hour

const SOFA_LEAGUE_URL = `https://ottoneu.fangraphs.com/football/${LEAGUE_ID}/`;

/**
 * What each destination *is*, keyed by route.
 *
 * The hub used to carry its own `HUB_GROUPS` array — group membership, labels
 * and access gating, all duplicated from `lib/nav.ts` under a comment saying
 * "Keep the two in step." They were already out of step: the nav's "My Team"
 * group is `requiresAuth` and contains a "Your Team" entry, while the hub's was
 * ungated and did not, so a signed-out visitor was shown "Your Matchup" and
 * "Lineup" cards for a team they do not have.
 *
 * Now only the *copy* lives here. Taxonomy, ordering and access come from
 * `NAV_GROUPS`, so the two literally cannot drift again.
 */
const HUB_META: Record<string, { description: string; icon: LucideIcon }> = {
  "/matchup": { description: "Your optimal lineup against this week's opponent, slot by slot, with the projected margin.", icon: Swords },
  "/lineup": { description: "Set this week's lineup from the per-game projections.", icon: LayoutGrid },
  "/projected-salary": { description: "Your roster against projected value, with cap space.", icon: DollarSign },
  "/scoreboard": { description: "Every week's matchups, the standings, and the playoff picture.", icon: Swords },
  "/teams": { description: "Each team's roster, cap space, record and schedule in one place.", icon: Shield },
  "/rosters": { description: "League-wide roster view at any date in the season.", icon: ClipboardList },
  "/arb-progress": { description: "League-wide arbitration completion and allocations.", icon: Activity },
  "/arb-planner-public": { description: "Read-only view of saved arbitration plans.", icon: Eye },
  "/players": { description: "Search every player, or view the salary-vs-production chart.", icon: Users },
  "/projections": { description: "Season-long projected PPG for every player, rookies included.", icon: LineChart },
  "/weekly": { description: "Per-game forecasts for one NFL week.", icon: LineChart },
  "/free-agents": { description: "Who's on the wire, ranked by value, flagged where they beat your starters.", icon: UserPlus },
  "/value": { description: "VORP, surplus rankings, and your manual adjustments.", icon: BarChart3 },
  "/arbitration": { description: "Targets, Monte Carlo simulation, and budget planner.", icon: Gavel },
  "/mock-draft": { description: "Practice keeper auction against AI opponents.", icon: Target },
};

/** Strip the query so a featured href resolves to its metadata. */
function basePath(href: string): string {
  return href.split("?")[0];
}

function HubCard({
  item,
  href,
  muted,
}: {
  item: NavItem;
  href?: string;
  muted?: boolean;
}) {
  const meta = HUB_META[basePath(item.href)];
  if (!meta) return null;
  const Icon = meta.icon;
  return (
    <Link
      href={href ?? item.href}
      className={`group flex items-start gap-3 rounded-lg border border-line p-4 transition-colors ${
        muted
          ? "bg-sunken hover:border-line-strong"
          : "bg-raised hover:border-accent"
      }`}
    >
      <span
        className={`mt-0.5 shrink-0 rounded-md p-2 ${
          muted ? "bg-page text-ink-subtle" : "bg-accent-soft text-accent"
        }`}
      >
        <Icon size={18} aria-hidden="true" />
      </span>
      <span className="min-w-0">
        <span className="flex items-center gap-1 font-semibold text-ink">
          {item.label}
          <ArrowRight
            size={14}
            className="opacity-0 -translate-x-1 transition-all group-hover:opacity-100 group-hover:translate-x-0"
            aria-hidden="true"
          />
        </span>
        <span className="mt-1 block text-sm text-ink-muted">{meta.description}</span>
      </span>
    </Link>
  );
}

export default async function Home() {
  const [ctx, user, league, viewerTeam] = await Promise.all([
    getSeasonContextNow(),
    getAuthenticatedUser(),
    getLeagueStatus(),
    getViewerTeam(),
  ]);
  const ui = PHASE_UI[ctx.phase];
  const hasAccess = !!user?.hasProjectionsAccess;
  const viewer: Viewer = {
    isAuthenticated: !!user,
    isAdmin: !!user?.isAdmin,
    hasProjectionsAccess: hasAccess,
    viewerTeam,
  };

  // In season, the viewer's own game is the thing they came for — surface it
  // above the generic league status instead of making them find it in the grid.
  const myGame =
    ctx.phase === "in_season" && viewerTeam && league?.week != null
      ? (league.matchups
          .map((m) => toTeamGame(m, viewerTeam))
          .find((g) => g !== null && g.week === league.week) ?? null)
      : null;

  // The hub, derived from the one taxonomy. A group the viewer can open nothing
  // in is kept but rendered as a single locked prompt, so the hub still tells a
  // signed-out visitor what exists.
  const groups = NAV_GROUPS.filter(
    (g) => !HUB_EXCLUDED_GROUPS.includes(g.label),
  ).map((group) => ({
    label: group.label,
    hidden: !!group.requiresAuth && !viewer.isAuthenticated,
    items: group.items.filter(
      (i) => i.dynamic !== "viewerTeam" && HUB_META[basePath(i.href)],
    ),
    visible: group.items.filter(
      (i) =>
        i.dynamic !== "viewerTeam" &&
        HUB_META[basePath(i.href)] &&
        canSee(i, viewer),
    ),
    // Off-phase practice tools sit quieter than the things in season.
    muted: group.label === "Tools",
  }));

  const allItems = groups.flatMap((g) => g.items);
  const featuredHrefs = new Set(ui.featuredLinks.map(basePath));

  // Featured cards for the current phase. Only tools the visitor can actually
  // open, and — since each also appears in its group below — the group render
  // skips whatever is promoted up here, rather than printing it twice.
  const featured = ui.featuredLinks
    .map((href) => {
      const item = allItems.find((i) => i.href === basePath(href));
      return item && canSee(item, viewer) ? { item, href } : null;
    })
    .filter((x): x is { item: NavItem; href: string } => x !== null);

  return (
    <PageShell gap="loose">
        {/* Hero.
            This used to print the phase label, the phase blurb and the
            countdown to the next boundary — the same three strings from the
            same PHASE_UI object that `PhaseBanner` renders about 120px above
            it. The banner is persistent chrome and owns that job; the hero
            says what the site is and gets out of the way. */}
        <PageHeader
          hero
          title="The SOFA"
          description={ui.blurb}
          links={[{ href: SOFA_LEAGUE_URL, label: "Open the league on Ottoneu", external: true }]}
        />

        {/* Your week — only in season, and only once we know whose team is whose */}
        {myGame && viewerTeam && (
          <section className="rounded-xl border border-accent/40 bg-accent-soft p-5">
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-accent-ink">
              Your week
            </h2>
            <p className="text-lg font-semibold text-ink">
              <TeamName name={viewerTeam} mine /> vs{" "}
              <TeamName name={myGame.opponent} />
              {myGame.score != null && myGame.opponentScore != null && (
                <span className="ml-2 tabular-nums text-ink-muted">
                  {myGame.score.toFixed(2)} – {myGame.opponentScore.toFixed(2)}
                </span>
              )}
            </p>
            <p className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
              <Link href="/matchup" className="font-medium text-accent hover:underline">
                See the projected margin →
              </Link>
              <Link href="/lineup" className="text-accent hover:underline">
                Set your lineup →
              </Link>
              {hasAccess && (
                <Link href="/free-agents" className="text-accent hover:underline">
                  Check the wire →
                </Link>
              )}
            </p>
          </section>
        )}

        {/* League status — scoreboard + standings, straight off the game log */}
        {league && (
          <section>
            <h2 className="mb-3 flex flex-wrap items-baseline justify-between gap-2 text-sm font-semibold uppercase tracking-wide text-ink-subtle">
              <span className="flex items-center gap-2">
                <Swords size={14} aria-hidden="true" />
                {league.season} · {league.week != null ? `Week ${league.week}` : "Season"}
              </span>
              <Link
                href="/scoreboard"
                className="text-xs font-medium normal-case tracking-normal text-accent hover:underline"
              >
                Full scoreboard &amp; playoff picture →
              </Link>
            </h2>
            <div className="grid gap-4 lg:grid-cols-3">
              <div className="lg:col-span-2">
                <div className="grid gap-3 sm:grid-cols-2">
                  {league.matchups
                    .filter((m) => m.week === league.week)
                    .map((m) => (
                      <ScoreboardCard key={m.game_id} matchup={m} />
                    ))}
                </div>
              </div>
              <div>
                <StandingsTable playoffs={league.playoffs} compact viewerTeam={viewerTeam} />
              </div>
            </div>
          </section>
        )}

        {/* Featured for this phase */}
        {featured.length > 0 && (
          <section>
            <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-ink-subtle">
              <span className="h-1.5 w-1.5 rounded-full bg-phase" aria-hidden="true" />
              Featured now
            </h2>
            <div className="grid gap-3 sm:grid-cols-2">
              {featured.map(({ item, href }) => (
                <HubCard key={href} item={item} href={href} />
              ))}
            </div>
          </section>
        )}

        {/* Section groups, straight off NAV_GROUPS */}
        {groups.map((group) => {
          if (group.hidden) return null;
          // A card promoted into "Featured now" is not printed again here; the
          // page used to render the same destination twice on one screen.
          const cards = group.visible.filter((i) => !featuredHrefs.has(i.href));
          const locked = group.visible.length === 0;
          return (
            <section key={group.label}>
              <h2 className="mb-3 flex items-center gap-1.5 text-sm font-semibold uppercase tracking-wide text-ink-subtle">
                {locked && <Lock size={12} aria-hidden="true" />}
                {group.label}
              </h2>
              {locked ? (
                // /access, not /login: an authenticated user without projections
                // access is redirected away from /login and lands back here,
                // having been told nothing.
                <Link
                  href="/access"
                  className="flex items-center gap-3 rounded-lg border border-dashed border-line-strong p-4 text-sm text-ink-subtle transition-colors hover:border-accent hover:text-ink-muted"
                >
                  <Lock size={16} aria-hidden="true" />
                  {user
                    ? `Your account doesn't have access to ${group.label.toLowerCase()} tools yet.`
                    : `Sign in to access ${group.label.toLowerCase()} tools.`}
                </Link>
              ) : cards.length === 0 ? null : (
                <div className={`grid gap-3 sm:grid-cols-2 ${cards.length > 2 ? "lg:grid-cols-3" : ""}`}>
                  {cards.map((item) => (
                    <HubCard key={item.href} item={item} muted={group.muted} />
                  ))}
                </div>
              )}
            </section>
          );
        })}
    </PageShell>
  );
}
