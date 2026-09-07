import { getAuthenticatedUser } from "@/lib/auth";
import { getSeasonContextNow } from "@/lib/season";
import { PHASE_UI } from "@/lib/season-ui";
import { getViewerTeam } from "@/lib/viewer-team";
import Navigation from "./Navigation";

export default async function NavigationWrapper() {
  const [user, ctx, viewerTeam] = await Promise.all([
    getAuthenticatedUser(),
    getSeasonContextNow(),
    getViewerTeam(),
  ]);
  const ui = PHASE_UI[ctx.phase];
  return (
    <Navigation
      isAuthenticated={user !== null}
      isAdmin={user?.isAdmin ?? false}
      featuredLinks={ui.featuredLinks}
      featuredGroup={ui.featuredGroup ?? null}
      activeSinceSeason={ctx.statsSeason - 1}
      hasProjectionsAccess={user?.hasProjectionsAccess ?? false}
      isPodcaster={user?.isPodcaster ?? false}
      viewerTeam={viewerTeam}
    />
  );
}
