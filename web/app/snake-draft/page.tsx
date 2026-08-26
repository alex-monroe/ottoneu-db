import Link from "next/link";
import { getAuthenticatedUser } from "@/lib/auth";
import { fetchSnakeDraftData } from "@/lib/snake-draft";
import SnakeDraftClient from "./SnakeDraftClient";

export const metadata = { title: "Snake Draft" };

export default async function SnakeDraftPage() {
  const user = await getAuthenticatedUser();
  if (!user?.hasProjectionsAccess) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 text-center">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Snake Draft</h1>
        <p className="mt-3 text-slate-600 dark:text-slate-300">
          The snake draft runs off the market consensus board and is available to members with
          projections access.{" "}
          <Link href="/login" className="text-indigo-600 hover:underline dark:text-indigo-400">
            Sign in
          </Link>{" "}
          to run one.
        </p>
      </div>
    );
  }

  const data = await fetchSnakeDraftData();
  return <SnakeDraftClient pool={data.pool} season={data.season} />;
}
