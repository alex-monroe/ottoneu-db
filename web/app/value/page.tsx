import Tabs from "@/components/Tabs";
import VorpSection from "./VorpSection";
import SurplusSection from "./SurplusSection";
import AdjustmentsSection from "./AdjustmentsSection";
import PageShell from "@/components/PageShell";

// Adjustments read/write per-user data, so keep this route always-fresh.
export const revalidate = 0;

export const metadata = {
  title: "Value | Ottoneu Analytics",
  description: "VORP, surplus value, and manual value adjustments for League 309",
};

interface Props {
  searchParams: Promise<{ tab?: string }>;
}

export default async function ValuePage({ searchParams }: Props) {
  const { tab } = await searchParams;
  return (
    <PageShell width="wide">
        <header>
          <h1 className="text-3xl font-bold tracking-tight text-ink">
            Player Value
          </h1>
          <p className="text-ink-subtle mt-2">
            Replacement-based value, surplus rankings, and your manual adjustments.
          </p>
        </header>

        <Tabs
          activeId={tab}
          tabs={[
            { id: "vorp", label: "VORP", content: <VorpSection /> },
            { id: "surplus", label: "Surplus", content: <SurplusSection /> },
            { id: "adjustments", label: "Adjustments", content: <AdjustmentsSection /> },
          ]}
        />
    </PageShell>
  );
}
