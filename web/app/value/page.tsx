import Tabs from "@/components/Tabs";
import VorpSection from "./VorpSection";
import SurplusSection from "./SurplusSection";
import AdjustmentsSection from "./AdjustmentsSection";

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
    <main className="min-h-screen bg-white dark:bg-black p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        <header>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
            Player Value
          </h1>
          <p className="text-slate-500 dark:text-slate-400 mt-2">
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
      </div>
    </main>
  );
}
