"use client";

import { useState, useRef, useEffect, useId, useLayoutEffect } from "react";
import { createPortal } from "react-dom";
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
 *
 * The panel renders in a **portal**, not inline. Its primary home is a
 * `DataTable` column header, and `DataTable` wraps its table in
 * `overflow-x-auto` — which per spec computes the other axis to `auto` as well,
 * so an absolutely-positioned panel was clipped on both axes by its own scroll
 * container. On a right-hand column, `left-0` also pushed 256px of panel off the
 * edge of the viewport. Portalling to the body escapes the clip; the flip logic
 * below keeps it on screen.
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
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const panelId = useId();

  // Place the panel under the trigger, nudged back on screen if it would
  // overflow either edge.
  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return;
    const PANEL = 256; // w-64
    const MARGIN = 8;
    const r = triggerRef.current.getBoundingClientRect();
    const left = Math.max(
      MARGIN,
      Math.min(r.left, window.innerWidth - PANEL - MARGIN),
    );
    setPos({ top: r.bottom + 6, left });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onOutside(e: MouseEvent) {
      const t = e.target as Node;
      if (triggerRef.current?.contains(t) || panelRef.current?.contains(t)) return;
      setOpen(false);
    }
    function onEscape(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    }
    // The panel is anchored to viewport coordinates, so it has to follow or
    // close when anything underneath it moves.
    function onReflow() {
      setOpen(false);
    }
    document.addEventListener("mousedown", onOutside);
    document.addEventListener("keydown", onEscape);
    window.addEventListener("resize", onReflow);
    window.addEventListener("scroll", onReflow, true);
    return () => {
      document.removeEventListener("mousedown", onOutside);
      document.removeEventListener("keydown", onEscape);
      window.removeEventListener("resize", onReflow);
      window.removeEventListener("scroll", onReflow, true);
    };
  }, [open]);

  const panel =
    open && pos
      ? createPortal(
          <div
            ref={panelRef}
            id={panelId}
            role="dialog"
            aria-label={entry.term}
            style={{ top: pos.top, left: pos.left }}
            className="fixed z-[100] w-64 rounded-md border border-line bg-raised p-3 text-left font-normal normal-case tracking-normal shadow-lg"
          >
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-subtle">
              {entry.term}
            </p>
            <p className="mt-1 text-sm text-ink-muted">{entry.definition}</p>
            {entry.href && (
              <Link
                href={entry.href}
                className="mt-2 block text-xs font-medium text-accent hover:underline"
                onClick={() => setOpen(false)}
              >
                Open the page that owns this number →
              </Link>
            )}
          </div>,
          document.body,
        )
      : null;

  return (
    <span className={`inline-flex align-middle ${className}`}>
      <button
        ref={triggerRef}
        type="button"
        onClick={(e) => {
          // Column headers are sort buttons; don't sort while asking what a
          // column means.
          e.stopPropagation();
          setOpen((o) => !o);
        }}
        // Click alone was not enough: the header's own `onKeyDown` sort handler
        // still saw Enter/Space bubbling up from this button, so a keyboard user
        // reading a definition also re-sorted the table.
        onKeyDown={(e) => e.stopPropagation()}
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        aria-label={`What is ${entry.term}?`}
        // 24x24 hit area — WCAG 2.2 target-size minimum — around a 16px ring.
        // The old trigger was 16px square inside a sortable header.
        className="ml-1 inline-flex h-6 w-6 items-center justify-center rounded-full text-ink-subtle transition-colors hover:text-accent"
      >
        <span className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-current text-[10px] font-semibold leading-none">
          ?
        </span>
      </button>
      {panel}
    </span>
  );
}
