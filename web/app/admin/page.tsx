import { getAuthenticatedUser } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { redirect } from "next/navigation";
import Link from "next/link";
import { fetchLeagueTeams } from "@/lib/viewer-team";
import AdminPanel from "./AdminPanel";

export default async function AdminPage() {
  const user = await getAuthenticatedUser();
  if (!user?.isAdmin) redirect("/");

  const [{ data: users }, leagueTeams] = await Promise.all([
    getSupabaseAdmin()
      .from("users")
      .select("id, email, is_admin, has_projections_access, created_at, access_requested_at, team_name")
      .order("created_at", { ascending: true }),
    fetchLeagueTeams(),
  ]);

  // Accounts waiting on a manual grant come first — this list is the only place
  // an admin finds out somebody registered.
  const sorted = [...(users ?? [])].sort((a, b) => {
    const aPending = !a.has_projections_access && !!a.access_requested_at;
    const bPending = !b.has_projections_access && !!b.access_requested_at;
    if (aPending !== bPending) return aPending ? -1 : 1;
    return a.created_at.localeCompare(b.created_at);
  });
  const pendingCount = sorted.filter(
    (u) => !u.has_projections_access && !!u.access_requested_at,
  ).length;

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
            User Management
          </h1>
          {pendingCount > 0 && (
            <span className="inline-flex items-center rounded-full bg-amber-100 dark:bg-amber-950/60 px-2.5 py-0.5 text-xs font-semibold text-amber-800 dark:text-amber-300">
              {pendingCount} awaiting access
            </span>
          )}
        </div>
        <Link
          href="/admin/workflows"
          className="text-sm font-medium text-blue-600 dark:text-blue-400 hover:underline"
        >
          Workflow Status →
        </Link>
      </div>
      <AdminPanel users={sorted} currentUserId={user.userId} leagueTeams={leagueTeams} />
    </div>
  );
}
