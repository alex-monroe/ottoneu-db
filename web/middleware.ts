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

export const ADMIN_ROUTES = ["/admin"];

export const PUBLIC_API_ROUTES = [
  "/api/auth/login",
  "/api/auth/logout",
  "/api/auth/register",
];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Utility to add security headers
  const withSecurityHeaders = (response: NextResponse) => {
    response.headers.set("X-Frame-Options", "DENY");
    response.headers.set("X-Content-Type-Options", "nosniff");
    response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
    response.headers.set(
      "Strict-Transport-Security",
      "max-age=31536000; includeSubDomains"
    );
    return response;
  };

  // Allow public assets
  if (pathname.startsWith("/_next")) {
    return withSecurityHeaders(NextResponse.next());
  }

  const isApiRoute = pathname.startsWith("/api");
  const isPublicApiRoute = PUBLIC_API_ROUTES.some((route) =>
    pathname === route || pathname.startsWith(route + "/") || pathname.startsWith(route + "?")
  );

  // Allow public API routes
  if (isApiRoute && isPublicApiRoute) {
    return withSecurityHeaders(NextResponse.next());
  }

  // Check if UI route is protected (requires projections access)
  const isProtectedUiRoute = !isApiRoute && PROTECTED_ROUTES.some((route) =>
    pathname.startsWith(route)
  );

  // Check if UI route is admin-only
  const isAdminRoute = !isApiRoute && ADMIN_ROUTES.some((route) =>
    pathname.startsWith(route)
  );

  // If it's not an API route and not a protected/admin UI route, allow it
  if (!isApiRoute && !isProtectedUiRoute && !isAdminRoute) {
    return withSecurityHeaders(NextResponse.next());
  }

  // At this point, the route requires authentication.
  const authCookie = request.cookies.get("ottoneu_auth");
  const session = await verifySession(authCookie?.value);

  if (!session.valid) {
    if (isApiRoute) {
      return withSecurityHeaders(NextResponse.json({ error: "Unauthorized" }, { status: 401 }));
    } else {
      const loginUrl = new URL("/login", request.url);
      loginUrl.searchParams.set("redirect", pathname);
      return withSecurityHeaders(NextResponse.redirect(loginUrl));
    }
  }

  // Admin routes require isAdmin
  if (isAdminRoute && !session.isAdmin) {
    if (isApiRoute) {
      return withSecurityHeaders(NextResponse.json({ error: "Forbidden" }, { status: 403 }));
    }
    return withSecurityHeaders(NextResponse.redirect(new URL("/", request.url)));
  }

  // Protected routes require projections access
  if (isProtectedUiRoute && !session.hasProjectionsAccess) {
    if (isApiRoute) {
      return withSecurityHeaders(NextResponse.json({ error: "Forbidden" }, { status: 403 }));
    } else {
      const loginUrl = new URL("/login", request.url);
      loginUrl.searchParams.set("redirect", pathname);
      return withSecurityHeaders(NextResponse.redirect(loginUrl));
    }
  }

  return withSecurityHeaders(NextResponse.next());
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
