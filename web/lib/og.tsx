/**
 * Shared frame for `opengraph-image.tsx` link-preview cards (the image chat
 * apps show when someone pastes a site link). `next/og` renders a flexbox-only
 * subset of CSS with inline styles — no Tailwind, no CSS variables — so the
 * palette is repeated here as literals, matching the site's dark theme.
 */
import type { ReactNode } from "react";

export const OG_SIZE = { width: 1200, height: 630 };

export const OG_COLORS = {
  bg: "#0b1120",
  ink: "#f1f5f9",
  muted: "#94a3b8",
  accent: "#3b82f6",
  up: "#22c55e",
  down: "#ef4444",
};

export function OgFrame({
  eyebrow,
  title,
  children,
}: {
  eyebrow: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        width: "100%",
        height: "100%",
        padding: "56px 72px",
        background: OG_COLORS.bg,
        fontFamily: "sans-serif",
      }}
    >
      <div
        style={{
          display: "flex",
          fontSize: 26,
          fontWeight: 600,
          letterSpacing: 2,
          textTransform: "uppercase",
          color: OG_COLORS.accent,
        }}
      >
        {eyebrow}
      </div>
      <div style={{ display: "flex", marginTop: 8, fontSize: 60, fontWeight: 800, color: OG_COLORS.ink }}>
        {title}
      </div>
      <div style={{ display: "flex", flex: 1, flexDirection: "column", justifyContent: "center" }}>
        {children}
      </div>
      <div style={{ display: "flex", justifyContent: "flex-end", fontSize: 26, color: OG_COLORS.muted }}>
        SOFA DB
      </div>
    </div>
  );
}
