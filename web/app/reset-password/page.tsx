import Link from "next/link";
import { peekResetToken } from "@/lib/password-reset";
import ResetPasswordForm from "./ResetPasswordForm";

export const metadata = { title: "Reset password" };

/**
 * Lands from an admin-issued reset link. The token is checked (not consumed)
 * here so a dead link says so up front instead of after the user has typed a
 * new password twice.
 */
export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  const account = await peekResetToken(token);

  if (!token || !account) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-sunken px-4">
        <div className="max-w-md w-full space-y-6 text-center">
          <h2 className="mt-6 text-3xl font-bold text-ink">Link expired</h2>
          <p className="text-sm text-ink-muted">
            This reset link is invalid, has already been used, or is more than 24 hours old.
            Ask an admin for a new one.
          </p>
          <Link
            href="/forgot-password"
            className="inline-block text-sm text-accent hover:text-blue-500 dark:hover:text-blue-300 transition-colors"
          >
            Request a new link
          </Link>
        </div>
      </div>
    );
  }

  return <ResetPasswordForm token={token} email={account.email} />;
}
