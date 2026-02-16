"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";

const PUBLIC_LINKS = [
  { href: "/", label: "Player Efficiency" },
  { href: "/players", label: "Players" },
];

const PRIVATE_LINKS = [
  { href: "/projected-salary", label: "Projected Salary" },
  { href: "/vorp", label: "VORP" },
  { href: "/surplus-value", label: "Surplus Value" },
  { href: "/arbitration", label: "Arbitration" },
  { href: "/arbitration-simulation", label: "Arb Simulation" },
];

interface NavigationProps {
  isAuthenticated: boolean;
}

export default function Navigation({ isAuthenticated }: NavigationProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  // Show all links if authenticated, only public links if not
  const visibleLinks = isAuthenticated
    ? [...PUBLIC_LINKS, ...PRIVATE_LINKS]
    : PUBLIC_LINKS;

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

  return (
    <nav className="border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-black">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-14">
          <div className="flex items-center gap-1 overflow-x-auto">
            {visibleLinks.map((link) => {
              const isActive = pathname === link.href;
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`px-3 py-2 text-sm font-medium rounded-md whitespace-nowrap transition-colors ${
                    isActive
                      ? "bg-blue-600 text-white"
                      : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-900"
                  }`}
                >
                  {link.label}
                </Link>
              );
            })}
          </div>
          {isAuthenticated ? (
            <button
              onClick={handleLogout}
              disabled={isLoggingOut}
              className="ml-4 px-3 py-1.5 text-sm font-medium rounded-md text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-900 transition-colors disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
            >
              {isLoggingOut ? "Signing out..." : "Sign Out"}
            </button>
          ) : (
            <Link
              href="/login"
              className="ml-4 px-3 py-1.5 text-sm font-medium rounded-md text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-900 transition-colors whitespace-nowrap"
            >
              Sign In
            </Link>
          )}
        </div>
      </div>
    </nav>
  );
}
