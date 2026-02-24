"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, useRef, useEffect } from "react";
import { Lock, ExternalLink, ChevronDown, Menu, X } from "lucide-react";
import { ThemeToggle } from "./ThemeToggle";

const PUBLIC_LINKS = [
  { href: "/", label: "Player Efficiency" },
  { href: "/players", label: "Players" },
  { href: "/rosters", label: "Rosters" },
];

const SOFA_LEAGUE_LINK = {
  href: "https://ottoneu.fangraphs.com/football/309/",
  label: "SOFA League",
  isExternal: true,
};

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
        className={`inline-flex items-center gap-1 px-3 py-2 text-sm font-medium rounded-md whitespace-nowrap transition-colors ${hasActiveChild
            ? "bg-blue-600 text-white"
            : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-900"
          }`}
      >
        <Lock size={12} className={hasActiveChild ? "opacity-80" : "opacity-60"} />
        {label}
        <ChevronDown
          size={14}
          className={`transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open && (
        <div className="absolute left-0 top-full mt-1 z-50 min-w-[180px] rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-lg py-1">
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
}

export default function Navigation({ isAuthenticated }: NavigationProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const handleLogout = async () => {
    setIsLoggingOut(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      router.push("/");
      router.refresh();
    } catch (error) {
      console.error("Logout error:", error);
      setIsLoggingOut(false);
    }
  };

  const linkClass = (isActive: boolean) => `block px-3 py-2 text-sm font-medium rounded-md whitespace-nowrap transition-colors ${isActive
      ? "bg-blue-600 text-white"
      : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-900"
    }`;

  return (
    <nav className="border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-black sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-14">
          {/* Desktop Navigation */}
          <div className="hidden md:flex items-center gap-1">
            {/* Public links */}
            {PUBLIC_LINKS.map((link) => {
              const isActive = pathname === link.href;
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={linkClass(isActive)}
                >
                  {link.label}
                </Link>
              );
            })}

            {/* SOFA League external link */}
            <a
              href={SOFA_LEAGUE_LINK.href}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 px-3 py-2 text-sm font-medium rounded-md whitespace-nowrap transition-colors text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-900"
            >
              {SOFA_LEAGUE_LINK.label}
              <ExternalLink size={14} />
            </a>

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
          </div>

          {/* Mobile Menu Button & Brand */}
          <div className="md:hidden flex items-center gap-2">
            <button
              onClick={() => setIsMenuOpen(!isMenuOpen)}
              className="p-2 -ml-2 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-md"
              aria-label="Toggle menu"
            >
              {isMenuOpen ? <X size={24} /> : <Menu size={24} />}
            </button>
            <span className="font-bold text-lg text-slate-900 dark:text-white">Ottoneu Analytics</span>
          </div>

          <div className="flex items-center gap-2 ml-4">
            <ThemeToggle />
            {/* Desktop Auth Button */}
            <div className="hidden md:block">
              {isAuthenticated ? (
                <button
                  onClick={handleLogout}
                  disabled={isLoggingOut}
                  className="px-3 py-1.5 text-sm font-medium rounded-md text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-900 transition-colors disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
                >
                  {isLoggingOut ? "Signing out..." : "Sign Out"}
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
      </div>

      {/* Mobile Menu Content */}
      {isMenuOpen && (
        <div className="md:hidden border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-black overflow-y-auto max-h-[calc(100vh-3.5rem)]">
          <div className="px-2 pt-2 pb-3 space-y-1">
            {PUBLIC_LINKS.map((link) => {
              const isActive = pathname === link.href;
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={() => setIsMenuOpen(false)}
                  className={linkClass(isActive)}
                >
                  {link.label}
                </Link>
              );
            })}

            <a
              href={SOFA_LEAGUE_LINK.href}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 px-3 py-2 text-sm font-medium rounded-md whitespace-nowrap transition-colors text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-900"
            >
              {SOFA_LEAGUE_LINK.label}
              <ExternalLink size={14} />
            </a>

            {isAuthenticated &&
              PRIVATE_GROUPS.map((group) => (
                <div key={group.label} className="pt-2">
                  <div className="px-3 pb-1 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    {group.label}
                  </div>
                  {group.links.map((link) => {
                    const isActive = pathname === link.href;
                    return (
                      <Link
                        key={link.href}
                        href={link.href}
                        onClick={() => setIsMenuOpen(false)}
                        className={`block px-3 py-2 text-sm font-medium rounded-md transition-colors ml-2 ${isActive
                            ? "bg-blue-600 text-white"
                            : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-900"
                          }`}
                      >
                        {link.label}
                      </Link>
                    );
                  })}
                </div>
              ))}

            <div className="pt-4 border-t border-slate-200 dark:border-slate-800 mt-2">
              {isAuthenticated ? (
                <button
                  onClick={() => {
                    handleLogout();
                    setIsMenuOpen(false);
                  }}
                  disabled={isLoggingOut}
                  className="w-full text-left px-3 py-2 text-sm font-medium rounded-md text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-900 transition-colors"
                >
                  {isLoggingOut ? "Signing out..." : "Sign Out"}
                </button>
              ) : (
                <Link
                  href="/login"
                  onClick={() => setIsMenuOpen(false)}
                  className="block w-full px-3 py-2 text-sm font-medium rounded-md text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-900 transition-colors"
                >
                  Sign In
                </Link>
              )}
            </div>
          </div>
        </div>
      )}
    </nav>
  );
}
