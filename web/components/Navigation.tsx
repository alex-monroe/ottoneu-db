"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, useRef, useEffect } from "react";
import { Lock, ExternalLink, ChevronDown, Shield, Menu, X } from "lucide-react";
import GlobalPlayerSearch from "./GlobalPlayerSearch";

// Shared styling for a top-level nav item (inline desktop bar).
function navItemClass(isActive: boolean): string {
  return `inline-flex items-center gap-1 px-3 py-2 text-sm font-medium rounded-md whitespace-nowrap transition-colors ${
    isActive
      ? "bg-blue-600 text-white"
      : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-900"
  }`;
}

// Styling for a link in the collapsed mobile panel (full-width rows).
function mobileItemClass(isActive: boolean): string {
  return `flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
    isActive
      ? "bg-blue-600 text-white"
      : "text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
  }`;
}

const PUBLIC_LINKS = [
  { href: "/", label: "Player Efficiency" },
  { href: "/players", label: "Players" },
  { href: "/rosters", label: "Rosters" },
  { href: "/arb-progress", label: "Arb Progress" },
];

const SOFA_LEAGUE_LINK = {
  href: "https://ottoneu.fangraphs.com/football/309/",
  label: "SOFA League",
  isExternal: true,
};

const AUTHENTICATED_LINKS = [
  { href: "/arb-planner-public", label: "Arb Planner" },
];

const PRIVATE_GROUPS = [
  {
    label: "Projections",
    links: [
      { href: "/projected-salary", label: "Projected Salary" },
      { href: "/projections", label: "Projections" },
      { href: "/projection-accuracy", label: "Proj. Accuracy" },
      { href: "/vegas-lines", label: "Vegas Lines" },
    ],
  },
  {
    label: "Value",
    links: [
      { href: "/vorp", label: "VORP" },
      { href: "/surplus-value", label: "Surplus Value" },
      { href: "/surplus-adjustments", label: "Adjustments" },
    ],
  },
  {
    label: "Arbitration",
    links: [
      { href: "/arbitration", label: "Arbitration" },
      { href: "/arbitration-simulation", label: "Arb Simulation" },
      { href: "/arbitration-planner", label: "Arb Planner" },
    ],
  },
];

function NavDropdown({
  label,
  links,
  pathname,
}: {
  label: string;
  links: { href: string; label: string }[];
  pathname: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const hasActiveChild = links.some((l) => pathname === l.href);
  const dropdownId = `nav-dropdown-${label.toLowerCase().replace(/\s+/g, '-')}`;

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function handleEscape(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, []);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-haspopup="true"
        aria-controls={dropdownId}
        className={`inline-flex items-center gap-1 px-3 py-2 text-sm font-medium rounded-md whitespace-nowrap transition-colors ${hasActiveChild
          ? "bg-blue-600 text-white"
          : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-900"
          }`}
      >
        <Lock size={12} className={hasActiveChild ? "opacity-80" : "opacity-60"} aria-hidden="true" />
        {label}
        <ChevronDown
          size={14}
          className={`transition-transform ${open ? "rotate-180" : ""}`}
          aria-hidden="true"
        />
      </button>
      {open && (
        <div
          id={dropdownId}
          className="absolute left-0 top-full mt-1 z-50 min-w-[180px] rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-lg py-1"
        >
          {links.map((link) => {
            const isActive = pathname === link.href;
            return (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setOpen(false)}
                className={`block px-4 py-2 text-sm transition-colors ${isActive
                  ? "bg-blue-600 text-white"
                  : "text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                  }`}
              >
                {link.label}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

interface NavigationProps {
  isAuthenticated: boolean;
  isAdmin: boolean;
}

export default function Navigation({ isAuthenticated, isAdmin }: NavigationProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  // Authenticated users have many more nav items (3 dropdown groups + extra
  // links), so the inline bar only fits on very wide screens. Logged-out users
  // have just the public links and fit comfortably much sooner — collapse to a
  // hamburger only when the items genuinely won't fit. Class names are written
  // as full literals so Tailwind keeps them.
  const inlineWrapperClass = isAuthenticated
    ? "hidden 2xl:flex items-center gap-1"
    : "hidden lg:flex items-center gap-1";
  const collapsedHiddenClass = isAuthenticated ? "2xl:hidden" : "lg:hidden";

  const handleLogout = async () => {
    setIsLoggingOut(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      setIsLoggingOut(false);
      router.push("/");
      router.refresh();
    } catch (error) {
      console.error("Logout error:", error);
      setIsLoggingOut(false);
    }
  };

  return (
    <nav className="border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-black">
      <div className="px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-14 gap-2">
          <div className="flex items-center gap-1 min-w-0">
            {/* Hamburger toggle — shown when the inline bar is hidden (< 2xl) */}
            <button
              onClick={() => setMobileOpen((o) => !o)}
              aria-expanded={mobileOpen}
              aria-controls="mobile-nav"
              aria-label="Toggle navigation menu"
              className={`${collapsedHiddenClass} inline-flex items-center justify-center p-2 rounded-md text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-900 transition-colors`}
            >
              {mobileOpen ? <X size={20} aria-hidden="true" /> : <Menu size={20} aria-hidden="true" />}
            </button>

            {/* Inline navigation — shown once the items fit (breakpoint depends on auth) */}
            <div className={inlineWrapperClass}>
              {/* Public links */}
              {PUBLIC_LINKS.map((link) => (
                <Link key={link.href} href={link.href} className={navItemClass(pathname === link.href)}>
                  {link.label}
                </Link>
              ))}

              {/* SOFA League external link */}
              <a
                href={SOFA_LEAGUE_LINK.href}
                target="_blank"
                rel="noopener noreferrer"
                className={navItemClass(false)}
              >
                {SOFA_LEAGUE_LINK.label}
                <ExternalLink size={14} />
              </a>

              {/* Authenticated-only plain links (e.g. public Arb Planner) */}
              {isAuthenticated &&
                AUTHENTICATED_LINKS.map((link) => (
                  <Link key={link.href} href={link.href} className={navItemClass(pathname === link.href)}>
                    {link.label}
                  </Link>
                ))}

              {/* Protected dropdown groups (only if authenticated) */}
              {isAuthenticated &&
                PRIVATE_GROUPS.map((group) => (
                  <NavDropdown
                    key={group.label}
                    label={group.label}
                    links={group.links}
                    pathname={pathname}
                  />
                ))}

              {/* Admin link */}
              {isAdmin && (
                <Link href="/admin" className={navItemClass(pathname === "/admin")}>
                  <Shield size={12} className={pathname === "/admin" ? "opacity-80" : "opacity-60"} aria-hidden="true" />
                  Admin
                </Link>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 sm:gap-4">
            <GlobalPlayerSearch />
            {isAuthenticated ? (
              <button
                onClick={handleLogout}
                disabled={isLoggingOut}
                aria-label="Sign out"
                className="px-3 py-1.5 text-sm font-medium rounded-md text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-900 transition-colors disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap flex items-center justify-center gap-2"
              >
                {isLoggingOut ? (
                  <>
                    <svg className="animate-spin h-4 w-4 text-slate-500 dark:text-slate-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    <span>Signing out...</span>
                  </>
                ) : (
                  "Sign Out"
                )}
              </button>
            ) : (
              <Link
                href="/login"
                className="px-3 py-1.5 text-sm font-medium rounded-md text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-900 transition-colors whitespace-nowrap"
              >
                Sign In
              </Link>
            )}
          </div>
        </div>
      </div>

      {/* Collapsed menu — shown when the hamburger is toggled */}
      {mobileOpen && (
        <div
          id="mobile-nav"
          className={`${collapsedHiddenClass} border-t border-slate-200 dark:border-slate-800 px-4 sm:px-6 lg:px-8 py-3 space-y-1 max-h-[calc(100vh-3.5rem)] overflow-y-auto`}
        >
          {/* Public links */}
          {PUBLIC_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              onClick={() => setMobileOpen(false)}
              className={mobileItemClass(pathname === link.href)}
            >
              {link.label}
            </Link>
          ))}

          {/* SOFA League external link */}
          <a
            href={SOFA_LEAGUE_LINK.href}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => setMobileOpen(false)}
            className={mobileItemClass(false)}
          >
            {SOFA_LEAGUE_LINK.label}
            <ExternalLink size={14} aria-hidden="true" />
          </a>

          {/* Authenticated-only plain links */}
          {isAuthenticated &&
            AUTHENTICATED_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setMobileOpen(false)}
                className={mobileItemClass(pathname === link.href)}
              >
                {link.label}
              </Link>
            ))}

          {/* Protected groups, expanded as labeled sections */}
          {isAuthenticated &&
            PRIVATE_GROUPS.map((group) => (
              <div key={group.label} className="pt-2">
                <div className="flex items-center gap-1.5 px-3 pb-1 text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
                  <Lock size={11} aria-hidden="true" />
                  {group.label}
                </div>
                {group.links.map((link) => (
                  <Link
                    key={link.href}
                    href={link.href}
                    onClick={() => setMobileOpen(false)}
                    className={mobileItemClass(pathname === link.href)}
                  >
                    {link.label}
                  </Link>
                ))}
              </div>
            ))}

          {/* Admin link */}
          {isAdmin && (
            <Link
              href="/admin"
              onClick={() => setMobileOpen(false)}
              className={`mt-2 ${mobileItemClass(pathname === "/admin")}`}
            >
              <Shield size={14} aria-hidden="true" />
              Admin
            </Link>
          )}
        </div>
      )}
    </nav>
  );
}
