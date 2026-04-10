"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, useRef, useEffect } from "react";
import { Lock, ExternalLink, ChevronDown, Shield, Menu, X } from "lucide-react";
import GlobalPlayerSearch from "./GlobalPlayerSearch";

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
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Close mobile menu on route change
  useEffect(() => {
    setMobileMenuOpen(false);
  }, [pathname]);

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

  const navLinkClass = (isActive: boolean) =>
    `px-3 py-2 text-sm font-medium rounded-md whitespace-nowrap transition-colors ${
      isActive
        ? "bg-blue-600 text-white"
        : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-900"
    }`;

  return (
    <nav className="border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-black">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-14">
          {/* Left: hamburger (mobile) + nav links (desktop) */}
          <div className="flex items-center gap-1">
            {/* Hamburger button — mobile only */}
            <button
              onClick={() => setMobileMenuOpen((v) => !v)}
              aria-label={mobileMenuOpen ? "Close menu" : "Open menu"}
              aria-expanded={mobileMenuOpen}
              className="md:hidden p-2 rounded-md text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-900 transition-colors"
            >
              {mobileMenuOpen ? <X size={20} aria-hidden="true" /> : <Menu size={20} aria-hidden="true" />}
            </button>

            {/* Desktop nav links */}
            <div className="hidden md:flex items-center gap-1">
              {PUBLIC_LINKS.map((link) => (
                <Link key={link.href} href={link.href} className={navLinkClass(pathname === link.href)}>
                  {link.label}
                </Link>
              ))}

              <a
                href={SOFA_LEAGUE_LINK.href}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 px-3 py-2 text-sm font-medium rounded-md whitespace-nowrap transition-colors text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-900"
              >
                {SOFA_LEAGUE_LINK.label}
                <ExternalLink size={14} />
              </a>

              {isAuthenticated &&
                AUTHENTICATED_LINKS.map((link) => (
                  <Link key={link.href} href={link.href} className={navLinkClass(pathname === link.href)}>
                    {link.label}
                  </Link>
                ))}

              {isAuthenticated &&
                PRIVATE_GROUPS.map((group) => (
                  <NavDropdown key={group.label} label={group.label} links={group.links} pathname={pathname} />
                ))}

              {isAdmin && (
                <Link
                  href="/admin"
                  className={`inline-flex items-center gap-1 ${navLinkClass(pathname === "/admin")}`}
                >
                  <Shield size={12} className={pathname === "/admin" ? "opacity-80" : "opacity-60"} aria-hidden="true" />
                  Admin
                </Link>
              )}
            </div>
          </div>

          {/* Right: search + auth — always visible */}
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

      {/* Mobile menu dropdown */}
      {mobileMenuOpen && (
        <div className="md:hidden border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-black">
          <div className="max-w-7xl mx-auto px-4 py-2 flex flex-col gap-1">
            {PUBLIC_LINKS.map((link) => (
              <Link key={link.href} href={link.href} className={navLinkClass(pathname === link.href)}>
                {link.label}
              </Link>
            ))}

            <a
              href={SOFA_LEAGUE_LINK.href}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 px-3 py-2 text-sm font-medium rounded-md whitespace-nowrap transition-colors text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-900"
            >
              {SOFA_LEAGUE_LINK.label}
              <ExternalLink size={14} />
            </a>

            {isAuthenticated &&
              AUTHENTICATED_LINKS.map((link) => (
                <Link key={link.href} href={link.href} className={navLinkClass(pathname === link.href)}>
                  {link.label}
                </Link>
              ))}

            {isAuthenticated &&
              PRIVATE_GROUPS.map((group) => (
                <NavDropdown key={group.label} label={group.label} links={group.links} pathname={pathname} />
              ))}

            {isAdmin && (
              <Link
                href="/admin"
                className={`inline-flex items-center gap-1 ${navLinkClass(pathname === "/admin")}`}
              >
                <Shield size={12} className={pathname === "/admin" ? "opacity-80" : "opacity-60"} aria-hidden="true" />
                Admin
              </Link>
            )}
          </div>
        </div>
      )}
    </nav>
  );
}
