import { getAuthenticatedUser } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { redirect } from "next/navigation";
import AdminPanel from "./AdminPanel";

export default async function AdminPage() {
  const user = await getAuthenticatedUser();
  if (!user?.isAdmin) redirect("/");

  const { data: users } = await supabase
    .from("users")
    .select("id, email, is_admin, has_projections_access, created_at")
    .order("created_at", { ascending: true });

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold text-slate-900 dark:text-white mb-6">
        User Management
      </h1>
      <AdminPanel users={users ?? []} currentUserId={user.userId} />
    </div>
  );
}
