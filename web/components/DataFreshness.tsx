import { fetchFreshness, describeAge, isStale, sourceLabel, type DataSource } from "@/lib/freshness";

/**
 * "Rosters updated 3 hours ago" — a caption saying how old a page's data is.
 *
 * A stale dataset and a fresh one used to look identical, which matters here
 * more than in most apps: the Ottoneu scrape has been Cloudflare-blocked before
 * and simply stopped updating, with nothing on screen to say so.
 */
export default async function DataFreshness({
  source,
  /** Older than this and the stamp turns amber. */
  staleAfterHours = 36,
  className = "",
}: {
  source: DataSource;
  staleAfterHours?: number;
  className?: string;
}) {
  const stamp = await fetchFreshness(source);
  if (!stamp) return null;

  const stale = isStale(stamp, staleAfterHours);
  return (
    <p
      className={`text-xs ${
        stale
          ? "text-amber-700 dark:text-amber-400"
          : "text-slate-400 dark:text-slate-500"
      } ${className}`}
      title={new Date(stamp).toLocaleString()}
    >
      {sourceLabel(source)} updated {describeAge(stamp)}
      {stale ? " — the scrape may be behind" : ""}
    </p>
  );
}
