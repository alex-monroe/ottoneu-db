"use client";

import { useState, FormEvent } from "react";
import Link from "next/link";
import { LOGIN_PATH } from "@/lib/access";

/**
 * Asks an admin for a reset link. Nothing is emailed — the request lands in the
 * queue on /admin and an admin sends the link by hand — so the confirmation
 * says exactly that rather than "check your inbox".
 */
export default function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setIsLoading(true);
    try {
      const response = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      if (!response.ok) {
        setError("Please enter a valid email address");
      } else {
        setSubmitted(true);
      }
    } catch (err) {
      console.error("Forgot-password error:", err);
      setError("An error occurred. Please try again.");
    }
    setIsLoading(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-sunken px-4">
      <div className="max-w-md w-full space-y-8">
        <div>
          <h2 className="mt-6 text-center text-3xl font-bold text-ink">Forgot your password?</h2>
          <p className="mt-2 text-center text-sm text-ink-muted">
            {submitted
              ? "Request sent."
              : "Enter your account email and an admin will send you a reset link."}
          </p>
        </div>

        {submitted ? (
          <div className="rounded-md bg-raised border border-line p-4 text-sm text-ink" role="status">
            If an account exists for <span className="font-medium">{email}</span>, the league admin
            has been notified. They&apos;ll send you a link to set a new password. It works for 24
            hours.
          </div>
        ) : (
          <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
            <div>
              <label htmlFor="email" className="sr-only">
                Email
              </label>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                className="appearance-none rounded-md relative block w-full px-3 py-2 border border-line-strong placeholder-slate-500 dark:placeholder-slate-400 text-ink bg-raised focus:outline-none focus:ring-accent focus:border-blue-500 focus:z-10 sm:text-sm"
                placeholder="Email address"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={isLoading}
              />
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
              {isLoading ? "Sending..." : "Request reset link"}
            </button>
          </form>
        )}

        <div className="text-center">
          <Link
            href={LOGIN_PATH}
            className="text-sm text-accent hover:text-blue-500 dark:hover:text-blue-300 transition-colors"
          >
            Back to sign in
          </Link>
        </div>
      </div>
    </div>
  );
}
