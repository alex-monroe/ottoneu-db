import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { verifySession } from "./lib/session";

export const PROTECTED_ROUTES = [
  "/projected-salary",
  "/vorp",
  "/surplus-value",
  "/arbitration",
  "/arbitration-simulation",
  "/arbitration-planner",
  "/projections",
  "/projection-accuracy",
];

export const PUBLIC_API_ROUTES = [
  "/api/auth/login",
  "/api/auth/logout",
];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Allow public assets
  if (pathname.startsWith("/_next")) {
    return NextResponse.next();
  }

  const isApiRoute = pathname.startsWith("/api");
  const isPublicApiRoute = PUBLIC_API_ROUTES.some((route) =>
    pathname === route || pathname.startsWith(route + "/") || pathname.startsWith(route + "?")
  );

  // Allow public API routes
  if (isApiRoute && isPublicApiRoute) {
    return NextResponse.next();
  }

  // Check if UI route is protected
  const isProtectedUiRoute = !isApiRoute && PROTECTED_ROUTES.some((route) =>
    pathname.startsWith(route)
  );

  // If it's not an API route and not a protected UI route, allow it
  if (!isApiRoute && !isProtectedUiRoute) {
    return NextResponse.next();
  }

  // At this point, the route is either a protected UI route or a non-public API route.
  // Both require authentication.

  // Check for authentication cookie
  const authCookie = request.cookies.get("ottoneu_auth");
  const isAuthenticated = await verifySession(authCookie?.value);

  if (!isAuthenticated) {
    if (isApiRoute) {
      // Return 401 for unauthorized API requests
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    } else {
      // Redirect to login with original path as redirect parameter for UI requests
      const loginUrl = new URL("/login", request.url);
      loginUrl.searchParams.set("redirect", pathname);
      return NextResponse.redirect(loginUrl);
    }
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
