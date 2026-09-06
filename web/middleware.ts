import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { verifySession } from "./lib/session";
import {
  accessRedirect,
  isPublicApiRoute,
  requiresAdmin,
  requiresProjectionsAccess,
} from "./lib/access";

// Re-exported for the tests and callers that previously imported them from
// here; `lib/access.ts` is the source of truth.
export { PROJECTIONS_ROUTES, ADMIN_ROUTES, PUBLIC_API_ROUTES } from "./lib/access";

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Allow public assets
  if (pathname.startsWith("/_next")) {
    return NextResponse.next();
  }

  const isApiRoute = pathname.startsWith("/api");

  // API routes that carry their own auth (bearer key, OAuth token, signed
  // consent token) are exempt from the cookie gate.
  if (isApiRoute && isPublicApiRoute(pathname)) {
    return NextResponse.next();
  }

  const needsGate =
    isApiRoute || requiresProjectionsAccess(pathname) || requiresAdmin(pathname);
  if (!needsGate) {
    return NextResponse.next();
  }

  const authCookie = request.cookies.get("ottoneu_auth");
  const session = await verifySession(authCookie?.value);

  // Every remaining API route just needs a valid session.
  if (isApiRoute) {
    if (!session.valid) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (requiresAdmin(pathname) && !session.isAdmin) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (requiresProjectionsAccess(pathname) && !session.hasProjectionsAccess) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    return NextResponse.next();
  }

  // UI routes. A signed-in user who lacks projections access is sent to
  // /access, NOT to /login — /login redirects an authenticated visitor straight
  // back to where they came from, which made this an infinite redirect loop for
  // every self-registered user (they start with has_projections_access = false).
  const destination = accessRedirect(pathname, {
    signedIn: session.valid,
    hasProjectionsAccess: session.hasProjectionsAccess ?? false,
    isAdmin: session.isAdmin ?? false,
  });

  if (destination) {
    return NextResponse.redirect(new URL(destination, request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public folder
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
