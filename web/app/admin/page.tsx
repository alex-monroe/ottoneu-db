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
      .select("id, email, is_admin, has_projections_access, is_podcaster, created_at, access_requested_at, password_reset_requested_at, team_name")
      .order("created_at", { ascending: true }),
    fetchLeagueTeams(),
  ]);

  // Accounts waiting on an admin come first — a locked-out user asking for a
  // reset link, then a manual access grant. This list is the only place an
  // admin finds out either has happened.
  const awaitingAccess = (u: { has_projections_access: boolean; access_requested_at: string | null }) =>
    !u.has_projections_access && !!u.access_requested_at;
  const rank = (u: Parameters<typeof awaitingAccess>[0] & { password_reset_requested_at: string | null }) =>
    u.password_reset_requested_at ? 0 : awaitingAccess(u) ? 1 : 2;
  const sorted = [...(users ?? [])].sort((a, b) => {
    if (rank(a) !== rank(b)) return rank(a) - rank(b);
    return a.created_at.localeCompare(b.created_at);
  });
  const pendingCount = sorted.filter(awaitingAccess).length;
  const resetCount = sorted.filter((u) => !!u.password_reset_requested_at).length;

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-ink">
            User Management
          </h1>
          {pendingCount > 0 && (
            <span className="inline-flex items-center rounded-full bg-amber-100 dark:bg-amber-950/60 px-2.5 py-0.5 text-xs font-semibold text-amber-800 dark:text-amber-300">
              {pendingCount} awaiting access
            </span>
          )}
          {resetCount > 0 && (
            <span className="inline-flex items-center rounded-full bg-amber-100 dark:bg-amber-950/60 px-2.5 py-0.5 text-xs font-semibold text-amber-800 dark:text-amber-300">
              {resetCount} password reset{resetCount === 1 ? "" : "s"} requested
            </span>
          )}
        </div>
        <Link
          href="/admin/workflows"
          className="text-sm font-medium text-accent hover:underline"
        >
          Workflow Status →
        </Link>
      </div>
      <AdminPanel users={sorted} currentUserId={user.userId} leagueTeams={leagueTeams} />
    </div>
  );
}
