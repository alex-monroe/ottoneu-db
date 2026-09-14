"use client";

import { useRouter } from "next/navigation";

export default function WeekPicker({ week, weeks }: { week: number; weeks: number[] }) {
  const router = useRouter();
  return (
    <div>
      <label
        htmlFor="pickem-week"
        className="block text-xs font-medium uppercase tracking-wide text-ink-subtle"
      >
        Week
      </label>
      <select
        id="pickem-week"
        value={week}
        onChange={(e) => router.push(`/pickem?week=${e.target.value}`)}
        className="mt-1 rounded border border-line-strong bg-raised px-2 py-1.5 text-sm text-ink"
      >
        {weeks.map((w) => (
          <option key={w} value={w}>
            Week {w}
          </option>
        ))}
      </select>
    </div>
  );
}
