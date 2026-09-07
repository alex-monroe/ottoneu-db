import { requireProjectionsAccess } from "@/lib/auth";
import PhaseNote from "@/components/PhaseNote";
import { fetchMockDraftData } from "@/lib/mock-draft";
import MockDraftClient from "./MockDraftClient";

export const metadata = { title: "Mock Draft" };

export default async function MockDraftPage() {
  // Gated in one place now (lib/access.ts + middleware); this guard keeps the
  // page failing closed if the route is ever dropped from that list.
  await requireProjectionsAccess("/mock-draft");

  const data = await fetchMockDraftData();
  return (
    <>
      <div className="mx-auto max-w-6xl px-4 pt-6">
        <PhaseNote
          activeIn={["pre_draft", "post_draft"]}
          label="The mock draft"
          opensOn="keeper_deadline"
        />
      </div>
      <MockDraftClient teams={data.teams} faPool={data.faPool} season={data.season} />
    </>
  );
}
