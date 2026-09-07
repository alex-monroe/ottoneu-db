import Link from "next/link";
import { teamHref } from "@/lib/teams";

/**
 * Canonical league-team renderer — the team counterpart to `PlayerName`.
 *
 * Team names appeared in a dozen tables and were never clickable anywhere, so
 * there was no way to get from a standings row, a roster header or a player's
 * card to the team itself. Route every team name through this so they all lead
 * to the same place and look the same doing it.
 */

interface TeamNameProps {
  name: string | null | undefined;
  /** Render as plain text (free agents, or a name with no team page). */
  plain?: boolean;
  /** Emphasize the viewer's own team. */
  mine?: boolean;
  className?: string;
}

export default function TeamName({
  name,
  plain = false,
  mine = false,
  className = "",
}: TeamNameProps) {
  const label = name?.trim();

  // Free agents and unrostered players have no team page to point at.
  if (!label || label === "FA") {
    return <span className={className}>{label || "FA"}</span>;
  }

  if (plain) {
    return (
      <span className={`${mine ? "font-semibold" : ""} ${className}`}>{label}</span>
    );
  }

  return (
    <Link
      href={teamHref(label)}
      // `mine` used to swap the link colour for near-black bold text, which
      // took the affordance off the one team the reader most wants to click —
      // in a component whose entire reason for existing was that team names
      // were never clickable. Emphasis is weight, not the loss of link colour.
      className={`text-accent hover:underline ${mine ? "font-semibold" : ""} ${className}`}
    >
      {label}
    </Link>
  );
}
