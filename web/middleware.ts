import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const PROTECTED_ROUTES = [
  "/projected-salary",
  "/vorp",
  "/surplus-value",
  "/arbitration",
  "/arbitration-simulation",
  "/projections",
];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Allow API routes and public assets
  if (pathname.startsWith("/api") || pathname.startsWith("/_next")) {
    return NextResponse.next();
  }

  // Check if route is protected
  const isProtectedRoute = PROTECTED_ROUTES.some((route) =>
    pathname.startsWith(route)
  );

  if (!isProtectedRoute) {
    return NextResponse.next();
  }

  // Check for authentication cookie
  const authCookie = request.cookies.get("ottoneu_auth");
  const isAuthenticated = authCookie?.value === "authenticated";

  if (!isAuthenticated) {
    // Redirect to login with original path as redirect parameter
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("redirect", pathname);
    return NextResponse.redirect(loginUrl);
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
