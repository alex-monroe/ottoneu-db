"use client";

import { useRouter } from "next/navigation";

interface Props {
  week: number;
  /** Weeks this viewer may open; `preview` marks one that is not public yet. */
  weeks: { week: number; preview: boolean }[];
}

export default function WeekPicker({ week, weeks }: Props) {
  const router = useRouter();
  return (
    <div>
      <label
        htmlFor="community-week"
        className="block text-xs font-medium uppercase tracking-wide text-ink-subtle"
      >
        Week
      </label>
      <select
        id="community-week"
        value={week}
        onChange={(e) => router.push(`/power-rankings?week=${e.target.value}`)}
        className="mt-1 rounded border border-line-strong bg-raised px-2 py-1.5 text-sm text-ink"
      >
        {weeks.map((w) => (
          <option key={w.week} value={w.week}>
            Week {w.week}
            {w.preview ? " (preview)" : ""}
          </option>
        ))}
      </select>
    </div>
  );
}
