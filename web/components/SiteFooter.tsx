import Link from "next/link";
import { LEAGUE_ID } from "@/lib/config";

/**
 * A thin site footer.
 *
 * It exists mainly to give `/snake-draft` an entry point. That page is a
 * standalone practice tool for *other* redraft leagues — public, database-free,
 * built on a published static board — so it does not belong in a league-scoped
 * nav menu, where it read as part of The SOFA. Down here it is reachable and
 * plainly marked as separate.
 */
export default function SiteFooter() {
  return (
    <footer className="border-t border-line bg-page px-4 sm:px-6 lg:px-8 py-6">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 text-xs text-ink-subtle">
        <span>Ottoneu League {LEAGUE_ID}</span>
        <Link href="/access" className="hover:underline">
          Access
        </Link>
        <span className="ml-auto flex items-center gap-1.5">
          <Link href="/snake-draft" className="hover:underline">
            Snake Draft
          </Link>
          <span className="text-ink-subtle">
            — standalone practice tool, not part of this league
          </span>
        </span>
      </div>
    </footer>
  );
}
