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
  /** Older than this and the stamp turns `--warning`. */
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
      className={`text-xs ${stale ? "font-medium text-warning" : "text-ink-subtle"} ${className}`}
    >
      {sourceLabel(source)} updated{" "}
      {/* The exact timestamp used to live only in a `title` attribute, which is
          invisible to touch and to the keyboard — on the one component whose
          whole job is to let a reader decide whether to trust the numbers. */}
      <time dateTime={stamp}>{describeAge(stamp)}</time>
      {stale ? " — the scrape may be behind" : ""}
    </p>
  );
}
