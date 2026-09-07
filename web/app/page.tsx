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
  ExternalLink,
  ArrowRight,
  CalendarClock,
  Swords,
  Shield,
  UserPlus,
  type LucideIcon,
} from "lucide-react";
import { getSeasonContextNow } from "@/lib/season";
import { PHASE_UI, describeNextBoundary } from "@/lib/season-ui";
import { getAuthenticatedUser } from "@/lib/auth";
import { getViewerTeam } from "@/lib/viewer-team";
import { teamHref, toTeamGame } from "@/lib/teams";
import { getLeagueStatus } from "@/lib/matchups";
import ScoreboardCard from "@/components/ScoreboardCard";
import StandingsTable from "@/components/StandingsTable";
import { LEAGUE_ID } from "@/lib/config";

export const revalidate = 3600; // Revalidate every hour

interface HubLink {
  href: string;
  title: string;
  description: string;
  icon: LucideIcon;
  external?: boolean;
  /** This card alone needs projections access (its group may be public). */
  gated?: boolean;
}

interface HubGroup {
  label: string;
  links: HubLink[];
  /** Requires projections access (auth-gated). */
  gated?: boolean;
  /** Visually de-emphasized (e.g. off-phase offseason tools). */
  muted?: boolean;
}

const SOFA_LEAGUE_URL = `https://ottoneu.fangraphs.com/football/${LEAGUE_ID}/`;

const HUB_GROUPS: HubGroup[] = [
  // Mirrors the nav taxonomy in lib/nav.ts — grouped by the task you came to
  // do, not by which table the number came from. Keep the two in step.
  {
    label: "My Team",
    links: [
      { href: "/matchup", title: "Your Matchup", description: "Your optimal lineup against this week's opponent, with the projected margin.", icon: Swords },
      { href: "/lineup", title: "Lineup", description: "Set this week's lineup from the per-game projections.", icon: LayoutGrid },
      { href: "/projected-salary", title: "Keep or Cut", description: "Your roster against projected value, with cap space.", icon: DollarSign, gated: true },
    ],
  },
  {
    label: "League",
    links: [
      { href: "/scoreboard", title: "Scoreboard", description: "Every week's matchups, the standings, and the playoff picture.", icon: Swords },
      { href: "/teams", title: "Teams", description: "Each team's roster, cap space, record and schedule in one place.", icon: Shield },
      { href: "/rosters", title: "Rosters", description: "League-wide roster view at any date in the season.", icon: ClipboardList },
      { href: "/arb-progress", title: "Arbitration Progress", description: "League-wide arbitration completion and allocations.", icon: Activity },
      { href: "/arb-planner-public", title: "Arbitration Plans", description: "Read-only view of saved arbitration plans.", icon: Eye },
    ],
  },
  {
    label: "Players",
    links: [
      { href: "/players", title: "Player Directory", description: "Search every player, or view the salary-vs-production chart.", icon: Users },
      { href: "/projections", title: "Season Projections", description: "Season-long projected PPG for every player, rookies included.", icon: LineChart, gated: true },
      { href: "/weekly", title: "Weekly Projections", description: "Per-game forecasts for one NFL week.", icon: CalendarClock, gated: true },
      { href: "/free-agents", title: "Free Agents", description: "Who's on the wire, ranked by value, flagged where they beat your starters.", icon: UserPlus, gated: true },
    ],
  },
  {
    label: "Analysis",
    gated: true,
    links: [
      { href: "/value", title: "Player Value", description: "VORP, surplus rankings, and your manual adjustments.", icon: BarChart3 },
      { href: "/arbitration", title: "Arbitration", description: "Targets, Monte Carlo simulation, and budget planner.", icon: Gavel },
    ],
  },
  {
    label: "Tools",
    gated: true,
    muted: true,
    links: [
      { href: "/mock-draft", title: "Mock Draft", description: "Practice keeper auction against AI opponents.", icon: Target },
    ],
  },
];

/** Flat lookup of hub links by base path (query stripped). */
const LINKS_BY_PATH: Record<string, HubLink> = Object.fromEntries(
  HUB_GROUPS.flatMap((g) => g.links).map((l) => [l.href, l]),
);

function basePath(href: string): string {
  return href.split("?")[0];
}

function HubCard({ link, href, muted }: { link: HubLink; href?: string; muted?: boolean }) {
  const Icon = link.icon;
  return (
    <Link
      href={href ?? link.href}
      className={`group flex items-start gap-3 rounded-lg border p-4 transition-colors ${
        muted
          ? "border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-900/40 hover:bg-slate-100 dark:hover:bg-slate-900"
          : "border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 hover:border-blue-300 dark:hover:border-blue-800 hover:bg-blue-50/40 dark:hover:bg-blue-950/20"
      }`}
    >
      <span className={`mt-0.5 shrink-0 rounded-md p-2 ${muted ? "bg-slate-200/70 dark:bg-slate-800 text-slate-500 dark:text-slate-400" : "bg-blue-100 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400"}`}>
        <Icon size={18} aria-hidden="true" />
      </span>
      <span className="min-w-0">
        <span className="flex items-center gap-1 font-semibold text-slate-900 dark:text-white">
          {link.title}
          <ArrowRight size={14} className="opacity-0 -translate-x-1 transition-all group-hover:opacity-100 group-hover:translate-x-0" aria-hidden="true" />
        </span>
        <span className="mt-1 block text-sm text-slate-500 dark:text-slate-400">{link.description}</span>
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
  const boundary = describeNextBoundary(ctx);
  const hasAccess = !!user?.hasProjectionsAccess;

  // In season, the viewer's own game is the thing they came for — surface it
  // above the generic league status instead of making them find it in the grid.
  const myGame =
    ctx.phase === "in_season" && viewerTeam && league?.week != null
      ? (league.matchups
          .map((m) => toTeamGame(m, viewerTeam))
          .find((g) => g !== null && g.week === league.week) ?? null)
      : null;

  // Featured cards for the current phase (resolve hrefs to metadata by base path).
  const featured = ui.featuredLinks
    .map((href) => {
      const link = LINKS_BY_PATH[basePath(href)];
      return link ? { link, href } : null;
    })
    .filter((x): x is { link: HubLink; href: string } => x !== null)
    // Only show featured tools the visitor can actually open — gating may sit
    // on the group or on the individual card.
    .filter(({ link }) => {
      const group = HUB_GROUPS.find((g) => g.links.includes(link));
      return hasAccess || (!group?.gated && !link.gated);
    });

  return (
    <main className="min-h-screen bg-white dark:bg-black p-8">
      <div className="max-w-6xl mx-auto space-y-10">
        {/* Hero */}
        <header className="rounded-xl border border-slate-200 dark:border-slate-800 bg-gradient-to-br from-slate-50 to-white dark:from-slate-900 dark:to-black p-8">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
              The SOFA
            </h1>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 dark:bg-amber-950/50 px-3 py-1 text-xs font-semibold text-amber-800 dark:text-amber-300">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-500" aria-hidden="true" />
              {ui.label}
            </span>
          </div>
          <p className="mt-3 max-w-2xl text-slate-600 dark:text-slate-300">{ui.blurb}</p>
          {boundary && (
            <p className="mt-3 inline-flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
              <CalendarClock size={15} aria-hidden="true" />
              {boundary.daysUntil >= 0 ? (
                <>
                  <span className="font-medium text-slate-700 dark:text-slate-200 capitalize">{boundary.label}</span>
                  {" "}in{" "}
                  <span className="font-semibold text-slate-900 dark:text-white">{boundary.daysUntil}</span>
                  {" "}day{boundary.daysUntil === 1 ? "" : "s"} ({boundary.date})
                </>
              ) : (
                <>Next: <span className="font-medium text-slate-700 dark:text-slate-200 capitalize">{boundary.label}</span></>
              )}
            </p>
          )}
          <div className="mt-4">
            <a
              href={SOFA_LEAGUE_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-sm font-medium text-blue-600 dark:text-blue-400 hover:underline"
            >
              Open the league on Ottoneu <ExternalLink size={14} aria-hidden="true" />
            </a>
          </div>
        </header>

        {/* Your week — only in season, and only once we know whose team is whose */}
        {myGame && viewerTeam && (
          <section className="rounded-xl border border-blue-200 dark:border-blue-900 bg-blue-50/60 dark:bg-blue-950/30 p-5">
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-blue-900/70 dark:text-blue-300/70">
              Your week
            </h2>
            <p className="text-lg font-semibold text-slate-900 dark:text-white">
              <Link href={teamHref(viewerTeam)} className="hover:underline">
                {viewerTeam}
              </Link>{" "}
              vs{" "}
              <Link href={teamHref(myGame.opponent)} className="hover:underline">
                {myGame.opponent}
              </Link>
              {myGame.score != null && myGame.opponentScore != null && (
                <span className="ml-2 tabular-nums text-slate-600 dark:text-slate-300">
                  {myGame.score.toFixed(2)} – {myGame.opponentScore.toFixed(2)}
                </span>
              )}
            </p>
            <p className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
              <Link href="/matchup" className="font-medium text-blue-600 dark:text-blue-400 hover:underline">
                See the projected margin →
              </Link>
              <Link href="/lineup" className="text-blue-600 dark:text-blue-400 hover:underline">
                Set your lineup →
              </Link>
              {hasAccess && (
                <Link href="/free-agents" className="text-blue-600 dark:text-blue-400 hover:underline">
                  Check the wire →
                </Link>
              )}
            </p>
          </section>
        )}

        {/* League status — scoreboard + standings, straight off the game log */}
        {league && (
          <section>
            <h2 className="mb-3 flex flex-wrap items-baseline justify-between gap-2 text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              <span className="flex items-center gap-2">
                <Swords size={14} aria-hidden="true" />
                {league.season} · {league.week != null ? `Week ${league.week}` : "Season"}
              </span>
              <Link
                href="/scoreboard"
                className="text-xs font-medium normal-case tracking-normal text-blue-600 dark:text-blue-400 hover:underline"
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
            <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-500" aria-hidden="true" />
              Featured now
            </h2>
            <div className="grid gap-3 sm:grid-cols-2">
              {featured.map(({ link, href }) => (
                <HubCard key={href} link={link} href={href} />
              ))}
            </div>
          </section>
        )}

        {/* Section groups */}
        {HUB_GROUPS.map((group) => {
          // A group can mix public and gated cards (Players, My Team), so hide
          // the cards the viewer can't open and only show the sign-in prompt
          // when nothing in the group is reachable.
          const visible = hasAccess
            ? group.links
            : group.gated
              ? []
              : group.links.filter((l) => !l.gated);
          const locked = visible.length === 0;
          return (
            <section key={group.label}>
              <h2 className="mb-3 flex items-center gap-1.5 text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                {(group.gated || locked) && <Lock size={12} aria-hidden="true" />}
                {group.label}
              </h2>
              {locked ? (
                // /access, not /login: an authenticated user without projections
                // access is redirected away from /login and lands back here,
                // having been told nothing.
                <Link
                  href="/access"
                  className="flex items-center gap-3 rounded-lg border border-dashed border-slate-300 dark:border-slate-700 p-4 text-sm text-slate-500 dark:text-slate-400 hover:border-blue-300 dark:hover:border-blue-800 hover:text-slate-700 dark:hover:text-slate-200 transition-colors"
                >
                  <Lock size={16} aria-hidden="true" />
                  {user
                    ? `Your account doesn't have access to ${group.label.toLowerCase()} tools yet.`
                    : `Sign in to access ${group.label.toLowerCase()} tools.`}
                </Link>
              ) : (
                <div className={`grid gap-3 sm:grid-cols-2 ${visible.length > 2 ? "lg:grid-cols-3" : ""}`}>
                  {visible.map((link) => (
                    <HubCard key={link.href} link={link} muted={group.muted} />
                  ))}
                </div>
              )}
            </section>
          );
        })}
      </div>
    </main>
  );
}
