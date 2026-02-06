"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV_LINKS = [
  { href: "/", label: "Player Efficiency" },
  { href: "/projected-salary", label: "Projected Salary" },
  { href: "/vorp", label: "VORP" },
  { href: "/surplus-value", label: "Surplus Value" },
  { href: "/arbitration", label: "Arbitration" },
];

export default function Navigation() {
  const pathname = usePathname();

  return (
    <nav className="border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-black">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center gap-1 h-14 overflow-x-auto">
          {NAV_LINKS.map((link) => {
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
      </div>
    </nav>
  );
}
