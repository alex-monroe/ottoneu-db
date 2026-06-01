import { getAuthenticatedUser } from "@/lib/auth";
import { getSeasonContextNow } from "@/lib/season";
import { PHASE_UI } from "@/lib/season-ui";
import Navigation from "./Navigation";

export default async function NavigationWrapper() {
  const [user, ctx] = await Promise.all([
    getAuthenticatedUser(),
    getSeasonContextNow(),
  ]);
  const ui = PHASE_UI[ctx.phase];
  return (
    <Navigation
      isAuthenticated={user !== null}
      isAdmin={user?.isAdmin ?? false}
      featuredLinks={ui.featuredLinks}
      featuredGroup={ui.featuredGroup ?? null}
    />
  );
}
