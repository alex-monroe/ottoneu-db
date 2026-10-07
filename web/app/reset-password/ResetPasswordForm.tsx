"use client";

import { useState, FormEvent } from "react";
import { useRouter } from "next/navigation";

interface ResetPasswordFormProps {
  token: string;
  /** The account the link belongs to, so the user knows whose password this is. */
  email: string;
}

export default function ResetPasswordForm({ token, email }: ResetPasswordFormProps) {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");

    // Checked here too so a typo doesn't cost a round trip; the API enforces it.
    if (password.length < 6) {
      setError("Password must be at least 6 characters");
      return;
    }
    if (password.length > 72) {
      setError("Password must be at most 72 characters");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password, confirmPassword }),
      });
      if (!response.ok) {
        const data = await response.json();
        setError(data.error || "Failed to reset password");
        setIsLoading(false);
        return;
      }
      // The API signs the user in on success.
      router.push("/");
      router.refresh();
    } catch (err) {
      console.error("Reset-password error:", err);
      setError("An error occurred. Please try again.");
      setIsLoading(false);
    }
  };

  const inputClass =
    "appearance-none rounded-md relative block w-full px-3 py-2 border border-line-strong placeholder-slate-500 dark:placeholder-slate-400 text-ink bg-raised focus:outline-none focus:ring-accent focus:border-blue-500 focus:z-10 sm:text-sm";

  return (
    <div className="min-h-screen flex items-center justify-center bg-sunken px-4">
      <div className="max-w-md w-full space-y-8">
        <div>
          <h2 className="mt-6 text-center text-3xl font-bold text-ink">Set a new password</h2>
          <p className="mt-2 text-center text-sm text-ink-muted">
            For <span className="font-medium text-ink">{email}</span>
          </p>
        </div>
        <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
          {/* Lets password managers file the new password under the right account. */}
          <input type="email" name="email" autoComplete="username" value={email} readOnly hidden />
          <div className="space-y-3">
            <div>
              <label htmlFor="password" className="sr-only">
                New password
              </label>
              <input
                id="password"
                name="password"
                type={showPassword ? "text" : "password"}
                autoComplete="new-password"
                required
                className={inputClass}
                placeholder="New password (min 6 characters)"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={isLoading}
              />
            </div>
            <div>
              <label htmlFor="confirmPassword" className="sr-only">
                Confirm new password
              </label>
              <input
                id="confirmPassword"
                name="confirmPassword"
                type={showPassword ? "text" : "password"}
                autoComplete="new-password"
                required
                className={inputClass}
                placeholder="Confirm new password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                disabled={isLoading}
              />
            </div>
            <label className="flex items-center gap-2 text-sm text-ink-muted">
              <input
                type="checkbox"
                checked={showPassword}
                onChange={(e) => setShowPassword(e.target.checked)}
                className="rounded border-line-strong"
              />
              Show passwords
            </label>
          </div>

          {error && (
            <div className="rounded-md bg-red-50 dark:bg-red-900/20 p-4" role="alert" aria-live="assertive">
              <p className="text-sm font-medium text-red-800 dark:text-red-200">{error}</p>
            </div>
          )}

          <button
            type="submit"
            disabled={isLoading}
            className="w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-accent disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isLoading ? "Saving..." : "Set password and sign in"}
          </button>
        </form>
      </div>
    </div>
  );
}
