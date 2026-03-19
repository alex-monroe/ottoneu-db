"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface User {
  id: string;
  email: string;
  is_admin: boolean;
  has_projections_access: boolean;
  created_at: string;
}

interface AdminPanelProps {
  users: User[];
  currentUserId: string;
}

export default function AdminPanel({ users, currentUserId }: AdminPanelProps) {
  const router = useRouter();
  const [newEmail, setNewEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newProjectionsAccess, setNewProjectionsAccess] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState("");
  const [togglingId, setTogglingId] = useState<string | null>(null);
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
          <button onClick={() => setError("")} className="mt-1 text-xs text-red-600 dark:text-red-400 underline">
            Dismiss
          </button>
        </div>
      )}

      {/* Users table */}
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-700">
          <thead>
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">Email</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">Role</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">Projections Access</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">Created</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
            {users.map((u) => (
              <tr key={u.id}>
                <td className="px-4 py-3 text-sm text-slate-900 dark:text-white">{u.email}</td>
                <td className="px-4 py-3 text-sm">
                  {u.is_admin ? (
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-purple-100 dark:bg-purple-900/30 text-purple-800 dark:text-purple-200">
                      Admin
                    </span>
                  ) : (
                    <span className="text-slate-500 dark:text-slate-400">User</span>
                  )}
                </td>
                <td className="px-4 py-3 text-sm">
                  <button
                    onClick={() => handleToggleAccess(u.id, u.has_projections_access)}
                    disabled={togglingId === u.id}
                    className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium transition-colors ${
                      u.has_projections_access
                        ? "bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-200 hover:bg-green-200 dark:hover:bg-green-900/50"
                        : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700"
                    } disabled:opacity-50`}
                  >
                    {u.has_projections_access ? "Enabled" : "Disabled"}
                  </button>
                </td>
                <td className="px-4 py-3 text-sm text-slate-500 dark:text-slate-400">
                  {new Date(u.created_at).toLocaleDateString()}
                </td>
                <td className="px-4 py-3 text-sm">
                  {u.id === currentUserId ? (
                    <span className="text-slate-400 dark:text-slate-500 text-xs">You</span>
                  ) : (
                    <button
                      onClick={() => handleDelete(u.id)}
                      disabled={deletingId === u.id}
                      className={`text-xs font-medium transition-colors disabled:opacity-50 ${
                        confirmDeleteId === u.id
                          ? "text-red-600 dark:text-red-400"
                          : "text-slate-500 dark:text-slate-400 hover:text-red-600 dark:hover:text-red-400"
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
      <div className="border-t border-slate-200 dark:border-slate-700 pt-6">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">Add User</h2>
        <form onSubmit={handleCreateUser} className="flex flex-wrap items-end gap-3">
          <div>
            <label htmlFor="new-email" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
              Email
            </label>
            <input
              id="new-email"
              type="email"
              required
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              className="rounded-md border border-slate-300 dark:border-slate-700 px-3 py-1.5 text-sm bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:ring-blue-500 focus:border-blue-500"
              placeholder="user@example.com"
            />
          </div>
          <div>
            <label htmlFor="new-password" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
              Password
            </label>
            <input
              id="new-password"
              type="password"
              required
              minLength={6}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="rounded-md border border-slate-300 dark:border-slate-700 px-3 py-1.5 text-sm bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:ring-blue-500 focus:border-blue-500"
              placeholder="Min 6 characters"
            />
          </div>
          <div className="flex items-center gap-2">
            <input
              id="new-projections"
              type="checkbox"
              checked={newProjectionsAccess}
              onChange={(e) => setNewProjectionsAccess(e.target.checked)}
              className="rounded border-slate-300 dark:border-slate-700"
            />
            <label htmlFor="new-projections" className="text-sm text-slate-700 dark:text-slate-300">
              Projections access
            </label>
          </div>
          <button
            type="submit"
            disabled={isCreating}
            className="inline-flex items-center justify-center gap-2 px-4 py-1.5 text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isCreating && (
              <svg className="animate-spin -ml-1 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
            )}
            {isCreating ? "Creating..." : "Add User"}
          </button>
        </form>
      </div>
    </div>
  );
}
