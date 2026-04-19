/**
 * Consistent numeric stat formatter.
 *
 * Single source of truth for displaying numeric values (currency, decimal,
 * percent, integer) with null → "—" handling and monospace font for
 * tabular alignment.
 */

interface StatValueProps {
  value: unknown;
  format?: "currency" | "decimal" | "number" | "percent";
}

export default function StatValue({ value, format }: StatValueProps) {
  if (value == null) {
    return <span className="text-slate-400 dark:text-slate-500">—</span>;
  }

  const num = Number(value);

  if (format === "currency") {
    const display = isNaN(num) ? String(value) : `$${num}`;
    return <span className="font-mono">{display}</span>;
  }

  if (format === "decimal") {
    const display = isNaN(num) ? String(value) : num.toFixed(2);
    return <span className="font-mono">{display}</span>;
  }

  if (format === "percent") {
    const display = isNaN(num)
      ? String(value)
      : `${(num * 100).toFixed(0)}%`;
    return <span className="font-mono">{display}</span>;
  }

  if (format === "number") {
    const display = isNaN(num) ? String(value) : String(num);
    return <span className="font-mono">{display}</span>;
  }

  // No format specified — render as-is
  return <span>{String(value)}</span>;
}
