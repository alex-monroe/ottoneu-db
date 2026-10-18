import type { DeadlineSignal } from "@/lib/types";

/**
 * Buyer / seller / hold pill for the trade-deadline read from
 * lib/playoff-odds.ts. Buyer is the positive hue (improve now), seller the
 * negative one (cash out), hold neutral.
 */

const STYLES: Record<DeadlineSignal, string> = {
  buyer: "bg-positive-soft text-positive",
  seller: "bg-negative-soft text-negative",
  hold: "bg-sunken text-ink-subtle",
};

export default function DeadlineSignalBadge({ signal }: { signal: DeadlineSignal }) {
  return (
    <span
      className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase ${STYLES[signal]}`}
    >
      {signal}
    </span>
  );
}
