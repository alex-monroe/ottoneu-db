import Link from "next/link";

/**
 * The page frame — one place that owns the outer `<main>`.
 *
 * `min-h-screen bg-white dark:bg-black p-8` was copy-pasted into roughly
 * twenty-five files. Three consequences, all of them visible:
 *
 * 1. **Phones got desktop gutters.** `p-8` is 32px a side at *every* width, so a
 *    375px screen had 311px of usable room, most of it holding a table with a
 *    `min-w-[420px]` horizontal scroller. Exactly one page (`/projections`)
 *    had thought to write `p-4 sm:p-8`.
 * 2. **Every page scrolled.** `min-h-screen` plus a `mt-16` footer guarantees
 *    overflow even when the content fits on screen.
 * 3. **The content column jumped.** Widths ranged over `max-w-7xl`, `6xl`,
 *    `5xl`, `4xl` and `2xl`, so moving between pages resized the measure.
 *
 * Three named widths now cover every case. `wide` is for dense boards that earn
 * the room; `default` is the norm; `narrow` is for prose and single forms.
 */

const MEASURE = {
  narrow: "max-w-3xl",
  default: "max-w-6xl",
  wide: "max-w-7xl",
} as const;

export type PageWidth = keyof typeof MEASURE;

export default function PageShell({
  width = "default",
  gap = "normal",
  children,
}: {
  width?: PageWidth;
  /** Vertical rhythm between top-level sections. */
  gap?: "normal" | "loose" | "none";
  children: React.ReactNode;
}) {
  const space =
    gap === "none" ? "" : gap === "loose" ? "space-y-10" : "space-y-6";
  return (
    <main
      id="main-content"
      className="bg-page px-4 py-6 sm:px-6 sm:py-8 lg:px-8"
    >
      <div className={`mx-auto ${MEASURE[width]} ${space}`}>{children}</div>
    </main>
  );
}

/**
 * The standard page heading: optional eyebrow, an h1, optional description, and
 * a row of related links.
 *
 * Page headers had drifted into four treatments — a gradient hero card on `/`
 * and `/teams/[name]`, a bare `<header>` on most pages, an eyebrow-plus-title on
 * `/projections`, and `text-2xl` instead of `text-3xl` on `/projected-salary`.
 * Heroes are still available via `hero`, but they are now the same component
 * rather than a second thing that happens to look similar.
 */
export function PageHeader({
  eyebrow,
  title,
  badge,
  description,
  links,
  hero = false,
  children,
}: {
  eyebrow?: string;
  title: React.ReactNode;
  /** A chip beside the title (season phase, "Your team"). */
  badge?: React.ReactNode;
  description?: React.ReactNode;
  /** Related destinations, rendered as a single row of accent links. */
  links?: { href: string; label: string; external?: boolean }[];
  hero?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <header
      className={
        hero
          ? "rounded-xl border border-line bg-raised p-6 sm:p-8"
          : undefined
      }
    >
      {eyebrow && (
        <p className="text-xs font-semibold uppercase tracking-wide text-accent">
          {eyebrow}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <h1
          className={`${eyebrow ? "mt-1 " : ""}text-3xl font-bold tracking-tight text-ink`}
        >
          {title}
        </h1>
        {badge}
      </div>
      {description && (
        <div className="mt-2 max-w-prose text-ink-muted">{description}</div>
      )}
      {links && links.length > 0 && (
        <p className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
          {links.map((l) =>
            l.external ? (
              <a
                key={l.href}
                href={l.href}
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-accent hover:underline"
              >
                {l.label} ↗
              </a>
            ) : (
              <Link
                key={l.href}
                href={l.href}
                className="font-medium text-accent hover:underline"
              >
                {l.label} →
              </Link>
            ),
          )}
        </p>
      )}
      {children}
    </header>
  );
}
