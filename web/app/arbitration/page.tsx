import Tabs from "@/components/Tabs";
import PhaseNote from "@/components/PhaseNote";
import type { ValueMode } from "@/components/ModeToggle";
import TargetsSection from "./TargetsSection";
import SimulationSection from "./SimulationSection";
import PlannerSection from "./PlannerSection";
import PageShell from "@/components/PageShell";

// Per-user adjustments/plans are read here, so keep this route always-fresh.
export const revalidate = 0;

export const metadata = {
  title: "Arbitration | Ottoneu Analytics",
  description: "Arbitration targets, simulation, and planner for League 309",
};

interface Props {
  searchParams: Promise<{ mode?: string; tab?: string }>;
}

export default async function ArbitrationPage({ searchParams }: Props) {
  const params = await searchParams;
  const mode: ValueMode =
    params.mode === "adjusted"
      ? "adjusted"
      : params.mode === "projected"
        ? "projected"
        : "raw";

  return (
    <PageShell width="wide">
        <header>
          <h1 className="text-3xl font-bold tracking-tight text-ink">
            Arbitration
          </h1>
          <p className="text-ink-subtle mt-2">
            Targets, Monte Carlo simulation, and budget planning for the offseason
            arbitration phase.
          </p>
        </header>

        <PhaseNote activeIn={["pre_arb"]} label="Arbitration" opensOn="arb_start" />

        <Tabs
          activeId={params.tab}
          tabs={[
            { id: "targets", label: "Targets", content: <TargetsSection mode={mode} /> },
            { id: "simulation", label: "Simulation", content: <SimulationSection mode={mode} /> },
            { id: "planner", label: "Planner", content: <PlannerSection /> },
          ]}
        />
    </PageShell>
  );
}
