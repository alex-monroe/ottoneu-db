import Tabs from "@/components/Tabs";
import VorpSection from "./VorpSection";
import SurplusSection from "./SurplusSection";
import EarnedSection from "./EarnedSection";
import AdjustmentsSection from "./AdjustmentsSection";
import PageShell from "@/components/PageShell";
import StatWindowPicker from "@/components/StatWindowPicker";
import { fetchPlayerSetEndOfSeason, listStatWindowSeasons } from "@/lib/data";

// Adjustments read/write per-user data, so keep this route always-fresh.
export const revalidate = 0;

export const metadata = {
  title: "Value | Ottoneu Analytics",
  description: "VORP, surplus value, and manual value adjustments for League 309",
};

interface Props {
  searchParams: Promise<{ tab?: string; season?: string }>;
}

export default async function ValuePage({ searchParams }: Props) {
  const { tab, season } = await searchParams;

  // Which season's production to read. The default is whatever the rest of the
  // site is showing; `?season=` lets a reader put this year's partial numbers and
  // last year's finished ones side by side, which during the season are different
  // questions with different answers.
  const seasons = await listStatWindowSeasons();
  const requested = Number(season);
  const chosen = seasons.includes(requested) ? requested : seasons[0];

  // Resolved once here and handed to every panel, so the heading, the caveat and
  // the arithmetic below can never be describing different amounts of football.
  const { window } = await fetchPlayerSetEndOfSeason(chosen);

  // Only the chosen season's window has been resolved, so only its label can say
  // "to date". Every other option is an earlier season, which is finished, and
  // reads as the bare year.
  const labels: Record<number, string> = Object.fromEntries(
    seasons.map((s) => [s, s === window.season ? window.shortLabel : String(s)]),
  );

  // Earned leads while a season is in progress: it is the only panel here that
  // makes no claim about football that has not happened yet. Once the season is
  // over all three are retrospective, and VORP is the long-standing entry point.
  const earnedTab = {
    id: "earned",
    label: "Earned",
    content: <EarnedSection window={window} />,
  };
  const valueTabs = [
    { id: "vorp", label: "VORP", content: <VorpSection window={window} /> },
    { id: "surplus", label: "Surplus", content: <SurplusSection window={window} /> },
  ];
  const tabs = window.complete
    ? [...valueTabs, earnedTab]
    : [earnedTab, ...valueTabs];

  return (
    <PageShell width="wide">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-ink">
              Player Value
            </h1>
            <p className="text-ink-subtle mt-2">
              Replacement-based value, surplus rankings, and what salaries have
              actually earned.
            </p>
          </div>
          {seasons.length > 1 && (
            <StatWindowPicker
              seasons={seasons}
              current={window.season}
              labels={labels}
            />
          )}
        </header>

        <Tabs
          activeId={tab}
          tabs={[
            ...tabs,
            { id: "adjustments", label: "Adjustments", content: <AdjustmentsSection /> },
          ]}
        />
    </PageShell>
  );
}
