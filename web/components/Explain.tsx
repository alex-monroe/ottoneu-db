"use client";

import { useState, useRef, useEffect, useId } from "react";
import Link from "next/link";
import { GLOSSARY, type GlossaryTerm } from "@/lib/glossary";

/**
 * A small "?" affordance that explains one term in place.
 *
 * The site's numbers were printed as bare headers — VORP, PPS, surplus,
 * "Adjusted" — with the glossary living in a developer doc. This puts the
 * definition where the number is.
 *
 * Opens on click rather than hover so it works on touch and can be reached from
 * the keyboard; Escape and an outside click close it.
 */
export default function Explain({
  term,
  className = "",
}: {
  term: GlossaryTerm;
  className?: string;
}) {
  const entry = GLOSSARY[term];
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  const panelId = useId();

  useEffect(() => {
    if (!open) return;
    function onOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onEscape(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onOutside);
    document.addEventListener("keydown", onEscape);
    return () => {
      document.removeEventListener("mousedown", onOutside);
      document.removeEventListener("keydown", onEscape);
    };
  }, [open]);

  return (
    <span ref={ref} className={`relative inline-block ${className}`}>
      <button
        type="button"
        onClick={(e) => {
          // Column headers are sort buttons; don't sort while asking what a
          // column means.
          e.stopPropagation();
          setOpen((o) => !o);
        }}
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={`What is ${entry.term}?`}
        className="ml-1 inline-flex h-4 w-4 items-center justify-center rounded-full border border-slate-300 dark:border-slate-600 text-[10px] font-semibold leading-none text-slate-500 dark:text-slate-400 align-middle hover:border-blue-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
      >
        ?
      </button>
      {open && (
        <span
          id={panelId}
          role="tooltip"
          className="absolute left-0 top-full z-50 mt-1 block w-64 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-3 text-left shadow-lg"
          onClick={(e) => e.stopPropagation()}
        >
          <span className="block text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            {entry.term}
          </span>
          <span className="mt-1 block text-sm font-normal normal-case tracking-normal text-slate-700 dark:text-slate-300">
            {entry.definition}
          </span>
          {entry.href && (
            <Link
              href={entry.href}
              className="mt-2 block text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline"
              onClick={() => setOpen(false)}
            >
              Open the page that owns this number →
            </Link>
          )}
        </span>
      )}
    </span>
  );
}
