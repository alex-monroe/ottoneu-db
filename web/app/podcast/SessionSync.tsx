"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Re-sign a session cookie that predates the podcaster grant.
 *
 * The cookie is a 7-day snapshot of the account's roles, and middleware gates
 * `/podcast/*` off that snapshot because it cannot reach the database. So a
 * host granted the role this morning gets bounced back here every time —
 * carrying `isPodcaster: false` in a cookie that is otherwise perfectly valid.
 *
 * /access solves the same problem for projections access with a button, because
 * there the grant is a request that might still be pending and the user needs
 * to be told which. Here the grant has already happened: the server rendered
 * this component precisely *because* the database says yes and the cookie says
 * no, so there is nothing to ask about and it just fixes itself on mount.
 */
export default function SessionSync({ returnTo }: { returnTo: string | null }) {
  const router = useRouter();
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/auth/refresh", { method: "POST" });
        if (cancelled) return;
        if (!res.ok) {
          setFailed(true);
          return;
        }
        if (returnTo) router.replace(returnTo);
        else router.refresh();
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [router, returnTo]);

  return (
    <div
      role="status"
      className="rounded-lg border border-line bg-raised p-4 text-sm text-ink-muted"
    >
      {failed
        ? "Couldn't refresh this browser's session. Sign out and back in to pick up the podcaster role."
        : "Bringing this browser's session up to date…"}
    </div>
  );
}
