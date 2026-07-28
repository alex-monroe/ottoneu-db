/**
 * OAuth consent screen.
 *
 * A plain server-rendered form posting to /api/oauth/authorize — no client JS,
 * so there is no way for the parameters to drift from what the server
 * validated. Integrity and CSRF protection come from `consentToken`, an
 * HMAC-signed copy of the validated request bound to this user's session.
 */

import { OAUTH_SCOPE_DESCRIPTION } from "@/lib/oauth/constants";

interface ConsentFormProps {
  clientName: string;
  redirectHost: string;
  userEmail: string;
  consentToken: string;
}

export default function ConsentForm({
  clientName,
  redirectHost,
  userEmail,
  consentToken,
}: ConsentFormProps) {
  return (
    <main className="min-h-screen bg-white dark:bg-black flex items-center justify-center p-8">
      <div className="max-w-md w-full border border-slate-200 dark:border-slate-800 rounded-lg p-6 space-y-5">
        <header>
          <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white">
            Authorize {clientName}
          </h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Signed in as {userEmail}
          </p>
        </header>

        <div className="rounded-md bg-slate-50 dark:bg-slate-900 p-4">
          <p className="text-sm font-medium text-slate-900 dark:text-slate-200">
            This application is requesting permission to:
          </p>
          <ul className="mt-2 space-y-1 text-sm text-slate-700 dark:text-slate-300 list-disc list-inside">
            <li>{OAUTH_SCOPE_DESCRIPTION}</li>
          </ul>
          <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
            Access is read-only — this application cannot change your roster, your
            salaries, or anything else in the league.
          </p>
        </div>

        <p className="text-xs text-slate-500 dark:text-slate-400">
          After approving, you will be sent to <span className="font-mono">{redirectHost}</span>.
          Only continue if you started this connection yourself.
        </p>

        <form action="/api/oauth/authorize" method="POST" className="flex gap-3">
          <input type="hidden" name="consent_token" value={consentToken} />
          <button
            type="submit"
            name="action"
            value="deny"
            className="flex-1 rounded-md border border-slate-300 dark:border-slate-700 px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-900"
          >
            Deny
          </button>
          <button
            type="submit"
            name="action"
            value="approve"
            className="flex-1 rounded-md bg-slate-900 dark:bg-white px-4 py-2 text-sm font-medium text-white dark:text-slate-900 hover:bg-slate-700 dark:hover:bg-slate-200"
          >
            Approve
          </button>
        </form>
      </div>
    </main>
  );
}
