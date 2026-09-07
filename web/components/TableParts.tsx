import Explain from "./Explain";
import type { GlossaryTerm } from "@/lib/glossary";

/**
 * The header cell for the hand-rolled tables.
 *
 * This function existed twice, character for character, in
 * `components/StandingsTable.tsx` and `app/teams/[name]/page.tsx` — two files
 * from the same batch of work. It also had no way to carry an `Explain`, which
 * is why five glossary terms shipped unreachable: `surplus_after_arb` was
 * written for the team page's "Surplus after raise" column, and that column is
 * not a `DataTable`, so nothing could render it.
 */
export function Th({
  children,
  right,
  explain,
}: {
  children: React.ReactNode;
  right?: boolean;
  /** Glossary term to hang a "?" off, same contract as `Column.explain`. */
  explain?: GlossaryTerm;
}) {
  return (
    <th
      className={`px-3 py-2 text-xs font-semibold uppercase tracking-wide text-ink-subtle ${
        right ? "text-right" : "text-left"
      }`}
    >
      <span className={`inline-flex items-center ${right ? "flex-row-reverse" : ""}`}>
        {children}
        {explain && <Explain term={explain} />}
      </span>
    </th>
  );
}
