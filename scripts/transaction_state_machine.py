"""The roster-status state machine, and the log contradictions it exposes.

A player's status in a league is a tiny state machine. Ottoneu only lets it move
one way at a time::

              add(T)                 cut(T)
      FA  ─────────────────▶  OWNED(T)  ─────────────────▶  FA
                                 │  ▲
                    move(T→U)    │  │  increase(T)   (salary changes,
                                 ▼  │                 ownership does not)
                             OWNED(U)

Every legal edge is listed above; anything else is impossible in the real league
and therefore a data bug. A player who is already on a roster cannot be *added*
to it — he has to be cut first. That single rule is what caught this module's
founding case: Jonathon Brooks, added by Tinseltown Little Gold Men on
2025-08-24, carried a second ``add`` by the same team on 2026-07-31 while he had
never left the roster.

**Why the log drifts.** Two jobs write ``transactions`` and only one of them
watched the move happen. ``scrape_player_cards.py`` reads Ottoneu's own
Transaction History, so its rows are testimony. ``reconcile_roster.py
--infer-transactions`` has no history at all: it diffs the ``/csv/rosters``
export against ``league_prices`` and *guesses* what must have happened, dated the
run day. When ``league_prices`` is stale or empty, that guess describes a move
nobody made — a roster the reconciler had never seen looks exactly like a roster
everybody just signed. The 2026-07-31 backfill inferred 80 such moves in one run.

So the rule this module enforces is one-directional, mirroring
``scripts.transaction_dedupe``: an **inferred** row that contradicts the state
the real card rows imply is deleted, and a **card** row that violates the machine
is only ever reported. Testimony outranks inference; we never delete the only
witness.

The same replay serves three callers:

* ``find_violations`` — the audit (``just check-transactions``), over all history.
* ``purge_inferred_violations`` — the repair, dry-run by default.
* ``ownership_from_log`` — the *write-time* guard. ``reconcile_roster`` asks what
  the card log says a player's status is before filing an inference about him,
  which is how a phantom add stops being written in the first place. Detecting
  the bug and preventing it are then the same code, and cannot disagree.

Usage::

    python -m scripts.transaction_state_machine                 # dry-run audit
    python -m scripts.transaction_state_machine --apply         # delete inferred bad rows
    python -m scripts.transaction_state_machine --since 2026-07-01 --verbose
"""

from __future__ import annotations

import argparse
import re
import sys
from collections import defaultdict
from dataclasses import dataclass
from datetime import date

from dotenv import load_dotenv

from scripts.config import LEAGUE_ID, fetch_all_rows, get_supabase_client
from scripts.transaction_dedupe import is_inferred

# The two non-team states. ``UNKNOWN`` is not "no team" — it is "no evidence yet",
# the state every player starts in because the card history we hold may begin
# mid-stream (a card lists recent moves, not the league's whole past). Nothing is
# a violation out of ``UNKNOWN``: the first event we see establishes the state
# rather than being judged against it, so a truncated history never manufactures
# a bug report.
UNKNOWN = None
FA = "FA"

# Team labels that mean "nobody owns him". `league_prices` stores a free agent as
# team_name="FA"; a blank cell means the same thing.
_FA_LABELS = {"", "FA", "Free Agent"}

# `move (from The Witchcraft)` — the scraper encodes a trade's origin in the type
# string rather than the (always-null) `from_team` column. Mirrors
# `splitMoveType` in web/lib/mcp/transactions.ts.
_MOVE_FROM = re.compile(r"^move\s*\(from\s+(.+?)\)\s*$", re.I)

# Leading "Aug 22, 2026 9:26 PM" on a card row. `transaction_date` is a DATE, so
# every move on a busy day ties; the card's wall clock is what orders them, and
# order is the whole game when you are replaying a state machine. Mirrors
# `parseCardClock` in web/lib/mcp/transactions.ts.
_CARD_CLOCK = re.compile(
    r"^[A-Z][a-z]{2} \d{1,2}, \d{4}\s+(\d{1,2}):(\d{2})\s*(AM|PM)", re.I)

_SELECT = ("id, player_id, transaction_type, team_name, salary, "
           "transaction_date, raw_description")

# Supabase rejects very long `in` filters; delete ids in batches.
_DELETE_BATCH = 100

# One line per rule, printed in the report. Keyed by the `rule` on a Violation.
RULE_EXPLANATIONS = {
    "add_while_owned":
        "a rostered player cannot be added again — he has to be cut first",
    "cut_while_free_agent":
        "nobody can cut a free agent",
    "cut_by_wrong_team":
        "only the owning team can cut a player",
    "move_from_wrong_team":
        "a trade must originate from the team that actually owns the player",
    "increase_while_free_agent":
        "a free agent has no salary to raise",
    "increase_by_wrong_team":
        "only the owning team can raise a player's salary",
}


@dataclass(frozen=True)
class Move:
    """One transaction row, normalised into a state-machine event."""

    row_id: str
    player_id: str
    day: str                 # ISO date
    clock: str | None        # "HH:MM" recovered from the card text, else None
    kind: str                # "add" | "cut" | "move" | "increase"
    team: str                # destination / acting team
    from_team: str | None    # trade origin, for kind == "move"
    salary: int | None
    inferred: bool
    raw: str


@dataclass(frozen=True)
class Violation:
    """A move the state machine refuses, plus the context needed to judge it."""

    row_id: str
    player_id: str
    day: str
    rule: str
    state_before: str | None
    detail: str
    inferred: bool
    kind: str
    team: str
    salary: int | None

    @property
    def repairable(self) -> bool:
        """True when this row may be deleted: an inference contradicting testimony."""
        return self.inferred


def is_free_agent(team: str | None) -> bool:
    return (team or "").strip() in _FA_LABELS


def parse_clock(raw_description: str | None) -> str | None:
    """Recover ``"HH:MM"`` (24h) from a card row's leading timestamp, else None."""
    m = _CARD_CLOCK.match((raw_description or "").strip())
    if not m:
        return None
    hour = int(m.group(1)) % 12
    if m.group(3).upper() == "PM":
        hour += 12
    return f"{hour:02d}:{m.group(2)}"


def parse_move(row: dict) -> Move | None:
    """Normalise a ``transactions`` row into a ``Move``, or None if unusable.

    Rows with no ``transaction_date`` are dropped rather than guessed at: an
    event with no position in the sequence cannot be replayed, and inserting it
    anywhere would fabricate violations on either side of it.
    """
    day = row.get("transaction_date")
    if not day:
        return None
    ttype = (row.get("transaction_type") or "").strip()
    m = _MOVE_FROM.match(ttype)
    kind = "move" if m else ttype
    if kind not in ("add", "cut", "move", "increase"):
        return None
    return Move(
        row_id=row["id"],
        player_id=row["player_id"],
        day=day,
        clock=parse_clock(row.get("raw_description")),
        kind=kind,
        team=(row.get("team_name") or "").strip(),
        from_team=m.group(1).strip() if m else None,
        salary=row.get("salary"),
        inferred=is_inferred(row),
        raw=row.get("raw_description") or "",
    )


def move_order(move: Move) -> tuple:
    """Chronological sort key: day, then clock, then testimony before inference.

    Two rows on the same day with no clock still have to be ordered, and the
    order decides who is at fault. A card row is testimony about a real moment;
    an inference is dated the *reconciliation run*, so it describes something
    that had already happened by then. Putting card rows first is therefore not a
    tiebreak convenience — it is the actual chronology, and it is what makes a
    phantom ``add`` land after the real ``increase`` it contradicts instead of
    before it.
    """
    return (move.day, move.clock or "99:99", move.inferred, move.row_id)


def would_violate(state: str | None, move: Move) -> tuple[str, str] | None:
    """The ``(rule, detail)`` a move breaks from ``state``, or None if it is legal.

    The machine's one and only rulebook. ``replay`` uses it to audit rows already
    written; ``reconcile_roster`` uses it to decide whether to write one at all.
    Sharing it is deliberate — a guard that disagreed with the auditor would
    quietly write rows the audit then flags forever.

    ``state is UNKNOWN`` always returns None: with no evidence there is nothing
    to contradict.
    """
    if state is UNKNOWN:
        return None

    if move.kind == "add":
        if not is_free_agent(state):
            return ("add_while_owned",
                    f"added by {move.team!r} while already owned by {state!r}")
    elif move.kind == "cut":
        if is_free_agent(state):
            return ("cut_while_free_agent",
                    f"cut by {move.team!r} while already a free agent")
        if state != move.team:
            return ("cut_by_wrong_team",
                    f"cut by {move.team!r} but owned by {state!r}")
    elif move.kind == "move":
        if state != move.from_team:
            return ("move_from_wrong_team",
                    f"traded from {move.from_team!r} but owned by {state!r}")
    elif move.kind == "increase":
        if is_free_agent(state):
            return ("increase_while_free_agent",
                    f"salary raised by {move.team!r} while a free agent")
        if state != move.team:
            return ("increase_by_wrong_team",
                    f"salary raised by {move.team!r} but owned by {state!r}")
    return None


def advance(state: str | None, move: Move) -> str | None:
    """The state after ``move``. Salary-only events leave ownership unmoved."""
    if move.kind == "add":
        return move.team
    if move.kind == "cut":
        return FA
    if move.kind == "move":
        return move.team
    return state


def replay(moves: list[Move]) -> tuple[str | None, list[Violation]]:
    """Run one player's moves through the machine. Returns (final state, violations).

    ``moves`` is sorted here, so callers may pass them in any order. A violating
    move still applies its transition: the log is the only account we have, and
    refusing to advance would cascade one bad row into a violation on every row
    after it. We report the contradiction and keep following the log.
    """
    state: str | None = UNKNOWN
    violations: list[Violation] = []

    for mv in sorted(moves, key=move_order):
        broken = would_violate(state, mv)
        if broken:
            rule, detail = broken
            violations.append(Violation(
                row_id=mv.row_id, player_id=mv.player_id, day=mv.day, rule=rule,
                state_before=state, detail=detail, inferred=mv.inferred,
                kind=mv.kind, team=mv.team, salary=mv.salary,
            ))
        state = advance(state, mv)  # regardless — see the docstring.

    return state, violations


def group_by_player(rows: list[dict]) -> dict[str, list[Move]]:
    """Parse rows into moves, bucketed per player."""
    by_player: dict[str, list[Move]] = defaultdict(list)
    for row in rows:
        mv = parse_move(row)
        if mv is not None:
            by_player[mv.player_id].append(mv)
    return by_player


def find_violations(rows: list[dict]) -> list[Violation]:
    """Every state-machine contradiction in ``rows``, oldest first."""
    violations: list[Violation] = []
    for moves in group_by_player(rows).values():
        violations.extend(replay(moves)[1])
    return sorted(violations, key=lambda v: (v.day, v.player_id, v.row_id))


def ownership_from_log(rows: list[dict], testimony_only: bool = True) -> dict[str, str]:
    """Each player's status as the transaction log tells it: ``player_id -> team``.

    This is the write-time guard's view of the world, and the reason it defaults
    to ``testimony_only`` is the whole point: the state must be derived from
    player-card rows alone. Folding inferences back in would let one bad guess
    justify the next one, and the reconciler would ratify its own errors forever.

    Players whose state is still ``UNKNOWN`` (no usable history) are omitted —
    the caller must be able to tell "the log says he is a free agent" from "the
    log does not know", and only the first is grounds for suppressing a move.
    """
    considered = rows if not testimony_only else [r for r in rows if not is_inferred(r)]
    state_by_player: dict[str, str] = {}
    for player_id, moves in group_by_player(considered).items():
        state = replay(moves)[0]
        if state is not UNKNOWN:
            state_by_player[player_id] = state
    return state_by_player


def fetch_transactions(sb, league_id: int, since: str | None = None) -> list[dict]:
    """All league transactions (optionally from ``since``), paginated.

    Note that ``since`` narrows the *replay*, not just the report: cutting the
    history short leaves the early moves in ``UNKNOWN`` and hides violations that
    only a full replay can see. Use it to re-check a recent window quickly, not
    to audit the league.
    """
    filters = [("eq", "league_id", league_id)]
    if since:
        filters.append(("gte", "transaction_date", since))
    return fetch_all_rows(sb, "transactions", _SELECT, filters=filters)


# Ceiling on repair passes. Each pass strictly shrinks the log, so convergence is
# guaranteed; the bound exists so a future rule that could somehow oscillate fails
# loudly instead of spinning.
_MAX_PASSES = 10


def resolve(rows: list[dict]) -> tuple[list[Violation], list[Violation]]:
    """Repair to a fixpoint, in memory. Returns (rows to delete, rows to report).

    One pass is not enough, because a bad row can *hide* the next one. D'Andre
    Swift is the worked example: a phantom trade on 2026-07-31 put him back on a
    roster he had already been cut from, which made the phantom cut filed the next
    day look perfectly legal. Only once the trade is removed does the second cut
    stand exposed as cutting a free agent.

    So each pass drops the inferred rows that break the machine and replays what
    is left, until a pass finds nothing new. Every pass strictly shrinks the log,
    so this terminates. Doing it here rather than by re-querying means the whole
    fixpoint costs one read.
    """
    remaining = rows
    to_delete: list[Violation] = []
    for _ in range(_MAX_PASSES):
        violations = find_violations(remaining)
        repairable = [v for v in violations if v.repairable]
        if not repairable:
            return to_delete, violations
        to_delete.extend(repairable)
        doomed = {v.row_id for v in repairable}
        remaining = [r for r in remaining if r["id"] not in doomed]
    raise RuntimeError(
        f"state-machine repair did not converge in {_MAX_PASSES} passes — the rules "
        "may be contradictory; investigate before deleting anything.")


def audit(sb, league_id: int, since: str | None = None, apply: bool = False) -> dict:
    """Replay the league's log, optionally deleting the inferred rows that break it.

    Repairs to a fixpoint (see ``resolve``), so ``unrepairable`` is what genuinely
    survives the cleanup rather than what the first pass happened to see.
    """
    rows = fetch_transactions(sb, league_id, since)
    repairable, unrepairable = resolve(rows)

    if apply and repairable:
        ids = [v.row_id for v in repairable]
        for i in range(0, len(ids), _DELETE_BATCH):
            sb.table("transactions").delete().in_("id", ids[i:i + _DELETE_BATCH]).execute()

    return {
        "scanned": len(rows),
        "players": len(group_by_player(rows)),
        "violations": repairable + unrepairable,
        "repairable": repairable,
        "unrepairable": unrepairable,
        "deleted": len(repairable) if apply else 0,
    }


def purge_inferred_violations(sb, league_id: int, since: str | None = None) -> dict:
    """Delete inferred rows that contradict the card history. For pipeline use."""
    return audit(sb, league_id, since=since, apply=True)


def _player_names(sb, player_ids: set[str]) -> dict[str, str]:
    if not player_ids:
        return {}
    rows = fetch_all_rows(sb, "players", "id, name")
    return {r["id"]: r["name"] for r in rows if r["id"] in player_ids}


def _print_report(summary: dict, apply: bool, names: dict[str, str], verbose: bool) -> None:
    mode = "APPLY" if apply else "DRY RUN"
    v, rep, unrep = summary["violations"], summary["repairable"], summary["unrepairable"]
    print(f"\n=== Transaction state machine: {mode} ===")
    print(f"  scanned:        {summary['scanned']} rows across {summary['players']} players")
    print(f"  violations:     {len(v)}")
    print(f"  inferred (repairable): {len(rep)} "
          f"({'deleted' if apply else 'would delete'})")
    print(f"  card rows (report only): {len(unrep)}")

    if v:
        print("\n  by rule:")
        counts: dict[str, int] = defaultdict(int)
        for x in v:
            counts[x.rule] += 1
        for rule, n in sorted(counts.items(), key=lambda kv: -kv[1]):
            print(f"    {n:4}  {rule:26} — {RULE_EXPLANATIONS.get(rule, '')}")

    if unrep:
        # A card row cannot be dismissed as a bad guess: Ottoneu itself said this
        # happened. Either the scrape misread the card or our model of the league
        # is wrong, and both need a human.
        print("\n  !! card-scraped rows violate the machine — NOT auto-repaired:")
        for x in unrep:
            print(f"    {x.day}  {names.get(x.player_id, x.player_id):24} "
                  f"{x.kind:8} ${x.salary}  {x.detail}")

    if verbose and rep:
        print("\n  inferred rows:")
        for x in rep:
            print(f"    {x.day}  {names.get(x.player_id, x.player_id):24} "
                  f"{x.kind:8} ${x.salary}  {x.detail}")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Replay the roster state machine over `transactions` and report "
                    "(or repair) contradictions.")
    parser.add_argument("--apply", action="store_true",
                        help="Delete the inferred rows that violate the machine (default: dry run).")
    parser.add_argument("--since", help="Only replay rows on/after this date (YYYY-MM-DD). "
                                        "Narrows the replay, so prefer a full audit.")
    parser.add_argument("--league-id", type=int, default=LEAGUE_ID)
    parser.add_argument("--verbose", action="store_true", help="List every affected row.")
    args = parser.parse_args(argv)

    load_dotenv()
    sb = get_supabase_client()
    summary = audit(sb, args.league_id, since=args.since, apply=args.apply)
    names = _player_names(sb, {v.player_id for v in summary["violations"]})
    _print_report(summary, args.apply, names, args.verbose)

    if not args.apply and summary["repairable"]:
        print("\n  Re-run with --apply to delete the inferred rows.")
    # A surviving card-row violation is a real, unexplained defect: fail loudly so
    # a CI step or a `just` chain stops on it.
    return 1 if summary["unrepairable"] else 0


if __name__ == "__main__":
    sys.exit(main())
