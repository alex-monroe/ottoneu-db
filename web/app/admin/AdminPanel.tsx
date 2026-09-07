"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface User {
  id: string;
  email: string;
  is_admin: boolean;
  has_projections_access: boolean;
  created_at: string;
  /** When they asked for projections access; null = never asked. */
  access_requested_at: string | null;
  /** Ottoneu team this account manages; null = unbound. */
  team_name: string | null;
}

interface AdminPanelProps {
  users: User[];
  currentUserId: string;
  /** Team names currently holding a roster, for the per-user team picker. */
  leagueTeams: string[];
}

export default function AdminPanel({ users, currentUserId, leagueTeams }: AdminPanelProps) {
  const router = useRouter();
  const [newEmail, setNewEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newProjectionsAccess, setNewProjectionsAccess] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState("");
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [savingTeamId, setSavingTeamId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const handleToggleAccess = async (userId: string, currentAccess: boolean) => {
    setTogglingId(userId);
    try {
      const res = await fetch(`/api/admin/users/${userId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ has_projections_access: !currentAccess }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Failed to update user");
      } else {
        router.refresh();
      }
    } catch {
      setError("Failed to update user");
    }
    setTogglingId(null);
  };

  // Binding an account to a team is what makes "my team" mean the viewer's own
  // roster rather than the operator's — see web/lib/viewer-team.ts.
  const handleSetTeam = async (userId: string, teamName: string) => {
    setSavingTeamId(userId);
    setError("");
    try {
      const res = await fetch(`/api/admin/users/${userId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ team_name: teamName }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Failed to set team");
      } else {
        router.refresh();
      }
    } catch {
      setError("Failed to set team");
    }
    setSavingTeamId(null);
  };

  const handleDelete = async (userId: string) => {
    if (confirmDeleteId !== userId) {
      setConfirmDeleteId(userId);
      return;
    }
    setDeletingId(userId);
    setConfirmDeleteId(null);
    try {
      const res = await fetch(`/api/admin/users/${userId}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Failed to delete user");
      } else {
        router.refresh();
      }
    } catch {
      setError("Failed to delete user");
    }
    setDeletingId(null);
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setIsCreating(true);
    try {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: newEmail,
          password: newPassword,
          has_projections_access: newProjectionsAccess,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Failed to create user");
      } else {
        setNewEmail("");
        setNewPassword("");
        setNewProjectionsAccess(false);
        router.refresh();
      }
    } catch {
      setError("Failed to create user");
    }
    setIsCreating(false);
  };

  return (
    <div className="space-y-8">
      {error && (
        <div className="rounded-md bg-red-50 dark:bg-red-900/20 p-4">
          <p className="text-sm font-medium text-red-800 dark:text-red-200">{error}</p>
          <button onClick={() => setError("")} className="mt-1 text-xs text-negative underline">
            Dismiss
          </button>
        </div>
      )}

      {/* Users table */}
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-700">
          <thead>
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-ink-subtle uppercase tracking-wider">Email</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-ink-subtle uppercase tracking-wider">Role</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-ink-subtle uppercase tracking-wider">Team</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-ink-subtle uppercase tracking-wider">Projections Access</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-ink-subtle uppercase tracking-wider">Created</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-ink-subtle uppercase tracking-wider">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
            {users.map((u) => (
              <tr key={u.id}>
                <td className="px-4 py-3 text-sm text-ink">
                  <span className="flex items-center gap-2">
                    {u.email}
                    {!u.has_projections_access && u.access_requested_at && (
                      <span
                        title={`Requested ${new Date(u.access_requested_at).toLocaleDateString()}`}
                        className="inline-flex items-center rounded bg-amber-100 dark:bg-amber-950/60 px-1.5 py-0.5 text-xs font-medium text-amber-800 dark:text-amber-300"
                      >
                        Awaiting access
                      </span>
                    )}
                  </span>
                </td>
                <td className="px-4 py-3 text-sm">
                  {u.is_admin ? (
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-purple-100 dark:bg-purple-900/30 text-purple-800 dark:text-purple-200">
                      Admin
                    </span>
                  ) : (
                    <span className="text-ink-subtle">User</span>
                  )}
                </td>
                <td className="px-4 py-3 text-sm">
                  <select
                    aria-label={`Team for ${u.email}`}
                    value={u.team_name ?? ""}
                    disabled={savingTeamId === u.id}
                    onChange={(e) => handleSetTeam(u.id, e.target.value)}
                    className="rounded border border-line-strong bg-raised px-2 py-1 text-sm text-ink disabled:opacity-50"
                  >
                    <option value="">— none —</option>
                    {/* A team that no longer holds a roster still shows, so an
                        existing binding is never silently dropped. */}
                    {(u.team_name && !leagueTeams.includes(u.team_name)
                      ? [u.team_name, ...leagueTeams]
                      : leagueTeams
                    ).map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="px-4 py-3 text-sm">
                  <button
                    onClick={() => handleToggleAccess(u.id, u.has_projections_access)}
                    disabled={togglingId === u.id}
                    className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium transition-colors ${
                      u.has_projections_access
                        ? "bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-200 hover:bg-green-200 dark:hover:bg-green-900/50"
                        : "bg-sunken text-ink-muted hover:bg-line"
                    } disabled:opacity-50`}
                  >
                    {u.has_projections_access ? "Enabled" : "Disabled"}
                  </button>
                </td>
                <td className="px-4 py-3 text-sm text-ink-subtle">
                  {new Date(u.created_at).toLocaleDateString()}
                </td>
                <td className="px-4 py-3 text-sm">
                  {u.id === currentUserId ? (
                    <span className="text-ink-subtle text-xs">You</span>
                  ) : (
                    <button
                      onClick={() => handleDelete(u.id)}
                      disabled={deletingId === u.id}
                      className={`text-xs font-medium transition-colors disabled:opacity-50 ${
                        confirmDeleteId === u.id
                          ? "text-negative"
                          : "text-ink-subtle hover:text-red-600 dark:hover:text-red-400"
                      }`}
                    >
                      {confirmDeleteId === u.id ? "Confirm?" : deletingId === u.id ? "Deleting..." : "Delete"}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Add user form */}
      <div className="border-t border-line pt-6">
        <h2 className="text-lg font-semibold text-ink mb-4">Add User</h2>
        <form onSubmit={handleCreateUser} className="flex flex-wrap items-end gap-3">
          <div>
            <label htmlFor="new-email" className="block text-sm font-medium text-ink-muted mb-1">
              Email
            </label>
            <input
              id="new-email"
              type="email"
              required
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              className="rounded-md border border-line-strong px-3 py-1.5 text-sm bg-raised text-ink focus:outline-none focus:ring-accent focus:border-blue-500"
              placeholder="user@example.com"
            />
          </div>
          <div>
            <label htmlFor="new-password" className="block text-sm font-medium text-ink-muted mb-1">
              Password
            </label>
            <input
              id="new-password"
              type="password"
              required
              minLength={6}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="rounded-md border border-line-strong px-3 py-1.5 text-sm bg-raised text-ink focus:outline-none focus:ring-accent focus:border-blue-500"
              placeholder="Min 6 characters"
            />
          </div>
          <div className="flex items-center gap-2">
            <input
              id="new-projections"
              type="checkbox"
              checked={newProjectionsAccess}
              onChange={(e) => setNewProjectionsAccess(e.target.checked)}
              className="rounded border-line-strong"
            />
            <label htmlFor="new-projections" className="text-sm text-ink-muted">
              Projections access
            </label>
          </div>
          <button
            type="submit"
            disabled={isCreating}
            className="px-4 py-1.5 text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isCreating ? "Creating..." : "Add User"}
          </button>
        </form>
      </div>
    </div>
  );
}
