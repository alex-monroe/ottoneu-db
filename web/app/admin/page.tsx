import { getAuthenticatedUser } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { redirect } from "next/navigation";
import Link from "next/link";
import AdminPanel from "./AdminPanel";

export default async function AdminPage() {
  const user = await getAuthenticatedUser();
  if (!user?.isAdmin) redirect("/");

  const { data: users } = await getSupabaseAdmin()
    .from("users")
    .select("id, email, is_admin, has_projections_access, created_at")
    .order("created_at", { ascending: true });

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between gap-4 mb-6">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
          User Management
        </h1>
        <Link
          href="/admin/workflows"
          className="text-sm font-medium text-blue-600 dark:text-blue-400 hover:underline"
        >
          Workflow Status →
        </Link>
      </div>
      <AdminPanel users={users ?? []} currentUserId={user.userId} />
    </div>
  );
}
