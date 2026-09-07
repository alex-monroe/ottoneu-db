"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, useRef, useEffect } from "react";
import { Lock, ExternalLink, ChevronDown, Menu, X } from "lucide-react";
import GlobalPlayerSearch from "./GlobalPlayerSearch";
import { visibleNav, type NavGroup } from "@/lib/nav";
import { teamHref } from "@/lib/teams";

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

const SOFA_LEAGUE_LINK = {
  href: "https://ottoneu.fangraphs.com/football/309/",
  label: "The SOFA",
};

/** Home is a plain link; everything else is grouped by task in lib/nav.ts. */
const HOME_LINK = { href: "/", label: "Home" };

/** Small amber dot marking the phase-featured nav item. */
function FeaturedDot() {
  return (
    <span
      className="h-1.5 w-1.5 rounded-full bg-amber-500"
      title="Featured this part of the season"
      aria-hidden="true"
    />
  );
}

function NavDropdown({
  label,
  links,
  pathname,
  featured,
  featuredLinks,
  locked = false,
}: {
  label: string;
  links: { href: string; label: string }[];
  pathname: string;
  featured?: boolean;
  featuredLinks?: string[];
  /** Show the padlock — a group whose contents need projections access. */
  locked?: boolean;
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
        {locked && (
          <Lock size={12} className={hasActiveChild ? "opacity-80" : "opacity-60"} aria-hidden="true" />
        )}
        {label}
        {featured && <FeaturedDot />}
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
                className={`flex items-center gap-1.5 px-4 py-2 text-sm transition-colors ${isActive
                  ? "bg-blue-600 text-white"
                  : "text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                  }`}
              >
                {link.label}
                {featuredLinks?.includes(link.href) && !isActive && <FeaturedDot />}
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
  /** Hrefs to accent as "featured" for the current season phase. */
  featuredLinks?: string[];
  /** Nav dropdown group label to accent for the current season phase. */
  featuredGroup?: string | null;
  /** Earliest season a player counts as "active" in global search ranking. */
  activeSinceSeason: number;
  hasProjectionsAccess: boolean;
  /** The viewer's own team, which becomes the first item under "My Team". */
  viewerTeam: string | null;
}

export default function Navigation({
  isAuthenticated,
  isAdmin,
  featuredLinks = [],
  featuredGroup = null,
  activeSinceSeason,
  hasProjectionsAccess,
  viewerTeam,
}: NavigationProps) {
  const groups: NavGroup[] = visibleNav(
    { isAuthenticated, isAdmin, hasProjectionsAccess, viewerTeam },
    teamHref,
  );
  /** A group is padlocked when every item in it needs projections access. */
  const isLocked = (g: NavGroup) =>
    g.items.every((i) => i.access === "projections" || i.access === "admin");
  const pathname = usePathname();
  const router = useRouter();
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const navRef = useRef<HTMLElement>(null);

  // Dismiss the collapsed menu on outside click or Escape.
  useEffect(() => {
    if (!mobileOpen) return;
    function onOutside(e: MouseEvent) {
      if (navRef.current && !navRef.current.contains(e.target as Node)) {
        setMobileOpen(false);
      }
    }
    function onEscape(e: KeyboardEvent) {
      if (e.key === "Escape") setMobileOpen(false);
    }
    document.addEventListener("mousedown", onOutside);
    document.addEventListener("keydown", onEscape);
    return () => {
      document.removeEventListener("mousedown", onOutside);
      document.removeEventListener("keydown", onEscape);
    };
  }, [mobileOpen]);

  // One breakpoint for everyone. It used to be 2xl (1536px) when signed in and
  // lg (1024px) when not, because auth piled on three dropdowns plus loose
  // links — so a member on a 1280px laptop got a hamburger while an anonymous
  // visitor on the same screen got the full bar, and access made navigation
  // worse. Task grouping keeps the signed-in bar to a handful of items, so both
  // states now collapse at the same width.
  const inlineWrapperClass = "hidden xl:flex items-center gap-1";
  const collapsedHiddenClass = "xl:hidden";

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
    <nav ref={navRef} className="relative border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-black">
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

            {/* Inline navigation — one breakpoint regardless of auth */}
            <div className={inlineWrapperClass}>
              <Link href={HOME_LINK.href} className={navItemClass(pathname === HOME_LINK.href)}>
                {HOME_LINK.label}
                {featuredLinks.includes(HOME_LINK.href) && pathname !== HOME_LINK.href && <FeaturedDot />}
              </Link>

              {groups.map((group) => (
                <NavDropdown
                  key={group.label}
                  label={group.label}
                  links={group.items}
                  pathname={pathname}
                  featured={featuredGroup === group.label}
                  featuredLinks={featuredLinks}
                  locked={isLocked(group)}
                />
              ))}

              <a
                href={SOFA_LEAGUE_LINK.href}
                target="_blank"
                rel="noopener noreferrer"
                className={navItemClass(false)}
              >
                {SOFA_LEAGUE_LINK.label}
                <ExternalLink size={14} />
              </a>
            </div>
          </div>
          <div className="flex items-center gap-2 sm:gap-4">
            <GlobalPlayerSearch activeSinceSeason={activeSinceSeason} />
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

      {/* Collapsed menu — a compact floating panel anchored under the hamburger,
          rather than a full-width section. Width tracks the viewport on phones
          but caps at a tidy menu size on larger collapsed screens. */}
      {mobileOpen && (
        <div
          id="mobile-nav"
          className={`${collapsedHiddenClass} absolute left-2 sm:left-4 top-full mt-1 z-50 w-72 max-w-[calc(100vw-1rem)] rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-xl py-1.5 px-1.5 space-y-0.5 max-h-[calc(100vh-4rem)] overflow-y-auto`}
        >
          <Link
            href={HOME_LINK.href}
            onClick={() => setMobileOpen(false)}
            className={mobileItemClass(pathname === HOME_LINK.href)}
          >
            {HOME_LINK.label}
          </Link>

          {/* Task groups, expanded as labelled sections */}
          {groups.map((group) => (
            <div key={group.label} className="pt-2">
              <div className="flex items-center gap-1.5 px-3 pb-1 text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
                {isLocked(group) && <Lock size={11} aria-hidden="true" />}
                {group.label}
              </div>
              {group.items.map((item) => (
                <Link
                  key={`${group.label}-${item.href}`}
                  href={item.href}
                  onClick={() => setMobileOpen(false)}
                  className={mobileItemClass(pathname === item.href)}
                >
                  {item.label}
                  {featuredLinks.includes(item.href) && pathname !== item.href && <FeaturedDot />}
                </Link>
              ))}
            </div>
          ))}

          <a
            href={SOFA_LEAGUE_LINK.href}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => setMobileOpen(false)}
            className={`mt-2 ${mobileItemClass(false)}`}
          >
            {SOFA_LEAGUE_LINK.label}
            <ExternalLink size={14} aria-hidden="true" />
          </a>
        </div>
      )}
    </nav>
  );
}
