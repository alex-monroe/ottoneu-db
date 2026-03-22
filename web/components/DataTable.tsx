"use client";

import { useState } from "react";
import type { Column, HighlightRule, PlayerHoverData, TableRow } from "@/lib/types";
import PlayerHoverCard from "./PlayerHoverCard";

// Re-export types for backward compatibility with existing imports
export type { Column, HighlightRule, TableRow };

interface DataTableProps<T extends TableRow = TableRow> {
  columns: Column[];
  data: T[];
  highlightRow?: (row: T) => string | undefined;
  highlightRules?: HighlightRule[];
  renderExpandedRow?: (row: T) => React.ReactNode;
  hoverDataMap?: Record<string, PlayerHoverData> | null;
}

function applyRules<T extends TableRow>(row: T, rules: HighlightRule[]): string | undefined {
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

export default function DataTable<T extends TableRow = TableRow>({
  columns,
  data,
  highlightRow,
  highlightRules,
  renderExpandedRow,
  hoverDataMap,
}: DataTableProps<T>) {
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortAsc, setSortAsc] = useState(true);
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set());

  const toggleExpanded = (i: number) => {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  };

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
    if (format === "percent")
      return isNaN(num) ? String(value) : `${(num * 100).toFixed(0)}%`;
    return String(value);
  };

  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800">
      <table className="min-w-full text-sm">
        <thead>
          <tr className="bg-slate-100 dark:bg-slate-800">
            {renderExpandedRow && (
              <th className="px-2 py-2 w-6" aria-label="expand" />
            )}
            {columns.map((col) => (
              <th
                key={col.key}
                onClick={() => handleSort(col.key)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    handleSort(col.key);
                  }
                }}
                tabIndex={0}
                aria-sort={sortKey === col.key ? (sortAsc ? "ascending" : "descending") : undefined}
                className="px-3 py-2 text-left font-semibold text-slate-700 dark:text-slate-300 cursor-pointer select-none whitespace-nowrap hover:bg-slate-200 dark:hover:bg-slate-700 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-blue-500 rounded-sm"
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
          {sorted.length === 0 && (
            <tr>
              <td
                colSpan={columns.length}
                className="px-3 py-6 text-center text-slate-500 dark:text-slate-400"
              >
                No data
              </td>
            </tr>
          )}
          {sorted.map((row, i) => {
            const highlight =
              highlightRow?.(row) ??
              (highlightRules ? applyRules(row, highlightRules) : undefined);
            const isExpanded = expandedRows.has(i);
            const rowBg =
              highlight ??
              (i % 2 === 0
                ? "bg-white dark:bg-slate-950"
                : "bg-slate-50 dark:bg-slate-900");
            return (
              <>
                <tr
                  key={i}
                  className={`border-t border-slate-100 dark:border-slate-800 ${rowBg} ${
                    renderExpandedRow ? "cursor-pointer hover:brightness-95" : ""
                  }`}
                  onClick={renderExpandedRow ? () => toggleExpanded(i) : undefined}
                >
                  {renderExpandedRow && (
                    <td className="px-2 py-2 text-slate-400 dark:text-slate-500 text-xs select-none">
                      {isExpanded ? "▼" : "▶"}
                    </td>
                  )}
                  {columns.map((col) => {
                    let cellContent;
                    if (col.renderCell) {
                      cellContent = col.renderCell(row[col.key], row);
                    } else if (
                      col.key === "name" &&
                      hoverDataMap &&
                      row.player_id &&
                      row.ottoneu_id
                    ) {
                      cellContent = (
                        <PlayerHoverCard
                          name={String(row[col.key] ?? "—")}
                          ottoneuId={row.ottoneu_id as number}
                          hoverData={hoverDataMap[row.player_id as string]}
                        />
                      );
                    } else {
                      cellContent = formatCell(row[col.key], col.format);
                    }
                    return (
                      <td
                        key={col.key}
                        className="px-3 py-2 text-slate-800 dark:text-slate-200 whitespace-nowrap"
                      >
                        {cellContent}
                      </td>
                    );
                  })}
                </tr>
                {renderExpandedRow && isExpanded && (
                  <tr key={`${i}-expanded`} className={rowBg}>
                    <td colSpan={columns.length + 1} className="p-0">
                      {renderExpandedRow(row)}
                    </td>
                  </tr>
                )}
              </>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
