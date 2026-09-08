/**
 * In-product glossary — `web/lib/glossary.ts`.
 *
 * The site printed VORP, PPS, surplus and "Adjusted" as bare headers with the
 * definitions living in a developer doc. These tests guard the two things that
 * would quietly break the feature: a column pointing at a term that does not
 * exist, and a definition too long to read in a popover.
 */

import { GLOSSARY, lookup, type GlossaryTerm } from "@/lib/glossary";
import * as staticColumns from "@/lib/columns";
import type { Column } from "@/lib/types";

const terms = Object.keys(GLOSSARY) as GlossaryTerm[];

describe("entries", () => {
  test("every term has a name and a definition", () => {
    for (const t of terms) {
      expect(lookup(t).term.length).toBeGreaterThan(0);
      expect(lookup(t).definition.length).toBeGreaterThan(20);
    }
  });

  test("definitions stay short enough for a hover", () => {
    for (const t of terms) {
      expect(lookup(t).definition.length).toBeLessThan(320);
    }
  });

  test("linked terms point at in-app paths", () => {
    for (const t of terms) {
      const href = lookup(t).href;
      if (href) expect(href.startsWith("/")).toBe(true);
    }
  });

  test("the two projection kinds are defined separately", () => {
    // projected_ppg is our season-long model; projected_points is a third
    // party's single game. Conflating them is the exact confusion to avoid.
    expect(lookup("projected_ppg").definition).toMatch(/season-long/i);
    expect(lookup("projected_points").definition).toMatch(/ONE specific game/);
  });
});

describe("column wiring", () => {
  test("every explain key on a static column resolves to a real term", () => {
    const cols = Object.values(staticColumns).flat() as Column[];
    const tagged = cols.filter(
      (c): c is Column => typeof c === "object" && c !== null && "explain" in c && !!c.explain,
    );
    // Guard against the tagging silently disappearing in a refactor.
    expect(tagged.length).toBeGreaterThan(0);
    for (const col of tagged) {
      expect(terms).toContain(col.explain as GlossaryTerm);
    }
  });
});
