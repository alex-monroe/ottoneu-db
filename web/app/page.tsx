import Link from "next/link";
import {
  Users,
  ClipboardList,
  LayoutGrid,
  BarChart3,
  LineChart,
  DollarSign,
  Target,
  TrendingUp,
  Gavel,
  Activity,
  Eye,
  Lock,
  ExternalLink,
  ArrowRight,
  CalendarClock,
  type LucideIcon,
} from "lucide-react";
import { getSeasonContextNow } from "@/lib/season";
import { PHASE_UI, describeNextBoundary } from "@/lib/season-ui";
import { getAuthenticatedUser } from "@/lib/auth";
import { LEAGUE_ID } from "@/lib/config";

export const revalidate = 3600; // Revalidate every hour

interface HubLink {
  href: string;
  title: string;
  description: string;
  icon: LucideIcon;
  external?: boolean;
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
  {
    label: "Explore",
    links: [
      { href: "/players", title: "Players", description: "Search the directory or view the salary-vs-production chart.", icon: Users },
      { href: "/rosters", title: "Rosters", description: "League-wide roster view with salaries and values.", icon: ClipboardList },
      { href: "/lineup", title: "Lineup", description: "Build a starting lineup from any team and see its projected total.", icon: LayoutGrid },
    ],
  },
  {
    label: "Projections",
    gated: true,
    links: [
      { href: "/projections", title: "Projections", description: "Recency-weighted projected PPG for every player.", icon: LineChart },
      { href: "/projected-salary", title: "Projected Salary", description: "Keep-or-cut decisions against projected value.", icon: DollarSign },
      { href: "/projection-accuracy", title: "Projection Accuracy", description: "Backtest accuracy explorer across models.", icon: Target },
      { href: "/vegas-lines", title: "Vegas Lines", description: "Preseason implied team totals feeding the model.", icon: TrendingUp },
    ],
  },
  {
    label: "Value",
    gated: true,
    links: [
      { href: "/value", title: "Player Value", description: "VORP, surplus rankings, and your manual adjustments.", icon: BarChart3 },
    ],
  },
  {
    label: "Offseason",
    gated: true,
    muted: true,
    links: [
      { href: "/arbitration", title: "Arbitration", description: "Targets, Monte Carlo simulation, and budget planner.", icon: Gavel },
      { href: "/arb-progress", title: "Arb Progress", description: "League-wide arbitration completion and allocations.", icon: Activity },
      { href: "/arb-planner-public", title: "Arb Planner (Public)", description: "Read-only view of saved arbitration plans.", icon: Eye },
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
  const [ctx, user] = await Promise.all([
    getSeasonContextNow(),
    getAuthenticatedUser(),
  ]);
  const ui = PHASE_UI[ctx.phase];
  const boundary = describeNextBoundary(ctx);
  const hasAccess = !!user?.hasProjectionsAccess;

  // Featured cards for the current phase (resolve hrefs to metadata by base path).
  const featured = ui.featuredLinks
    .map((href) => {
      const link = LINKS_BY_PATH[basePath(href)];
      return link ? { link, href } : null;
    })
    .filter((x): x is { link: HubLink; href: string } => x !== null)
    // Only show featured tools the visitor can actually open.
    .filter(({ link }) => {
      const group = HUB_GROUPS.find((g) => g.links.includes(link));
      return !group?.gated || hasAccess;
    });

  return (
    <main className="min-h-screen bg-white dark:bg-black p-8">
      <div className="max-w-6xl mx-auto space-y-10">
        {/* Hero */}
        <header className="rounded-xl border border-slate-200 dark:border-slate-800 bg-gradient-to-br from-slate-50 to-white dark:from-slate-900 dark:to-black p-8">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
              SOFA League {LEAGUE_ID}
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
          const locked = group.gated && !hasAccess;
          return (
            <section key={group.label}>
              <h2 className="mb-3 flex items-center gap-1.5 text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                {group.gated && <Lock size={12} aria-hidden="true" />}
                {group.label}
              </h2>
              {locked ? (
                <Link
                  href="/login"
                  className="flex items-center gap-3 rounded-lg border border-dashed border-slate-300 dark:border-slate-700 p-4 text-sm text-slate-500 dark:text-slate-400 hover:border-blue-300 dark:hover:border-blue-800 hover:text-slate-700 dark:hover:text-slate-200 transition-colors"
                >
                  <Lock size={16} aria-hidden="true" />
                  Sign in to access {group.label.toLowerCase()} tools.
                </Link>
              ) : (
                <div className={`grid gap-3 sm:grid-cols-2 ${group.links.length > 2 ? "lg:grid-cols-3" : ""}`}>
                  {group.links.map((link) => (
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
