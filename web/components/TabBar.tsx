"use client";

import { useSearchParams, usePathname, useRouter } from "next/navigation";

interface TabBarProps {
  tabs: { id: string; label: string }[];
  activeId: string;
  paramKey?: string;
}

/**
 * Client tab buttons. Switching a tab updates the `?tab=` query param (soft
 * navigation), which re-renders the server parent with the new active panel.
 * Other query params (e.g. `?mode=`) are preserved.
 */
export default function TabBar({ tabs, activeId, paramKey = "tab" }: TabBarProps) {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();

  const selectTab = (id: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set(paramKey, id);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  };

  return (
    <div
      role="tablist"
      aria-label="Section tabs"
      className="flex flex-wrap gap-1 border-b border-slate-200 dark:border-slate-800 mb-6"
    >
      {tabs.map((tab) => {
        const isActive = tab.id === activeId;
        return (
          <button
            key={tab.id}
            role="tab"
            type="button"
            aria-selected={isActive}
            onClick={() => selectTab(tab.id)}
            className={`-mb-px px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              isActive
                ? "border-blue-600 text-blue-600 dark:text-blue-400"
                : "border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 hover:border-slate-300 dark:hover:border-slate-700"
            }`}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
