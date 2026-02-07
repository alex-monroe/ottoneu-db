"use client";

import { useState } from "react";

export interface Column {
  key: string;
  label: string;
  format?: "currency" | "number" | "decimal";
}

export interface HighlightRule {
  key: string;
  op: "lt" | "gt" | "gte" | "lte" | "eq";
  value: number | string;
  className: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = any;

interface DataTableProps {
  columns: Column[];
  data: Row[];
  highlightRow?: (row: Row) => string | undefined;
  highlightRules?: HighlightRule[];
}

function applyRules(row: Row, rules: HighlightRule[]): string | undefined {
  for (const rule of rules) {
    const val = row[rule.key];
    if (val == null) continue;
    const num = Number(val);
    const ruleNum = Number(rule.value);
    let match = false;
    if (!isNaN(num) && !isNaN(ruleNum)) {
      if (rule.op === "lt") match = num < ruleNum;
      else if (rule.op === "gt") match = num > ruleNum;
      else if (rule.op === "gte") match = num >= ruleNum;
      else if (rule.op === "lte") match = num <= ruleNum;
      else if (rule.op === "eq") match = num === ruleNum;
    } else if (rule.op === "eq") {
      match = String(val) === String(rule.value);
    }
    if (match) return rule.className;
  }
  return undefined;
}

export default function DataTable({
  columns,
  data,
  highlightRow,
  highlightRules,
}: DataTableProps) {
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortAsc, setSortAsc] = useState(true);

  const handleSort = (key: string) => {
    if (sortKey === key) {
      setSortAsc(!sortAsc);
    } else {
      setSortKey(key);
      setSortAsc(true);
    }
  };

  const sorted = sortKey
    ? [...data].sort((a, b) => {
        const av = a[sortKey];
        const bv = b[sortKey];
        if (av == null && bv == null) return 0;
        if (av == null) return 1;
        if (bv == null) return -1;
        if (typeof av === "number" && typeof bv === "number") {
          return sortAsc ? av - bv : bv - av;
        }
        const as = String(av);
        const bs = String(bv);
        return sortAsc ? as.localeCompare(bs) : bs.localeCompare(as);
      })
    : data;

  const formatCell = (value: unknown, format?: Column["format"]): string => {
    if (value == null) return "—";
    const num = Number(value);
    if (format === "currency") return isNaN(num) ? String(value) : `$${num}`;
    if (format === "number") return isNaN(num) ? String(value) : String(num);
    if (format === "decimal")
      return isNaN(num) ? String(value) : num.toFixed(2);
    return String(value);
  };

  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800">
      <table className="min-w-full text-sm">
        <thead>
          <tr className="bg-slate-100 dark:bg-slate-800">
            {columns.map((col) => (
              <th
                key={col.key}
                onClick={() => handleSort(col.key)}
                className="px-3 py-2 text-left font-semibold text-slate-700 dark:text-slate-300 cursor-pointer select-none whitespace-nowrap hover:bg-slate-200 dark:hover:bg-slate-700"
              >
                {col.label}
                {sortKey === col.key && (
                  <span className="ml-1">{sortAsc ? "▲" : "▼"}</span>
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((row, i) => {
            const highlight =
              highlightRow?.(row) ??
              (highlightRules ? applyRules(row, highlightRules) : undefined);
            return (
              <tr
                key={i}
                className={`border-t border-slate-100 dark:border-slate-800 ${
                  highlight ??
                  (i % 2 === 0
                    ? "bg-white dark:bg-slate-950"
                    : "bg-slate-50 dark:bg-slate-900")
                }`}
              >
                {columns.map((col) => (
                  <td
                    key={col.key}
                    className="px-3 py-2 text-slate-800 dark:text-slate-200 whitespace-nowrap"
                  >
                    {formatCell(row[col.key], col.format)}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
