"use client";

import { useRouter } from "next/navigation";

interface Props {
  week: number;
  /** Weeks with something in them; `partial` marks one still being played. */
  weeks: { week: number; partial: boolean }[];
}

export default function WeekPicker({ week, weeks }: Props) {
  const router = useRouter();
  return (
    <div>
      <label
        htmlFor="recap-week"
        className="block text-xs font-medium uppercase tracking-wide text-ink-subtle"
      >
        Recap week
      </label>
      <select
        id="recap-week"
        value={week}
        onChange={(e) => router.push(`/podcast/recap?week=${e.target.value}`)}
        className="mt-1 rounded border border-line-strong bg-raised px-2 py-1.5 text-sm text-ink"
      >
        {weeks.map((w) => (
          <option key={w.week} value={w.week}>
            Week {w.week}
            {w.partial ? " (in progress)" : ""}
          </option>
        ))}
      </select>
    </div>
  );
}
