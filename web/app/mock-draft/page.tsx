import Link from "next/link";
import { getAuthenticatedUser } from "@/lib/auth";
import { fetchMockDraftData } from "@/lib/mock-draft";
import MockDraftClient from "./MockDraftClient";

export const metadata = { title: "Mock Draft" };

export default async function MockDraftPage() {
  const user = await getAuthenticatedUser();
  if (!user?.hasProjectionsAccess) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 text-center">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Mock Draft</h1>
        <p className="mt-3 text-slate-600 dark:text-slate-300">
          The mock draft uses market projections and is available to members with projections
          access.{" "}
          <Link href="/login" className="text-indigo-600 hover:underline dark:text-indigo-400">
            Sign in
          </Link>{" "}
          to run one.
        </p>
      </div>
    );
  }

  const data = await fetchMockDraftData();
  return <MockDraftClient teams={data.teams} faPool={data.faPool} season={data.season} />;
}
