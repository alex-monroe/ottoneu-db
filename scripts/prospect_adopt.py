"""Shared prospect-adoption heuristic for roster ingestion.

Extracted from ``scripts.tasks.scrape_roster`` so both the Playwright roster
scrape and the lighter-weight CSV reconciliation (``scripts.reconcile_roster``)
share one implementation without the CSV path importing pandas/Playwright.

Stdlib-only, leaf module: import it from ingestion code; never import ingestion
code from here.
"""

from __future__ import annotations


def choose_prospect_to_adopt(candidates: list[dict]) -> "str | None":
    """Pick a prospect/backfill player row to adopt a real roster identity into.

    When a college prospect is drafted and rostered, Ottoneu assigns a new real
    ``ottoneu_id``. Rather than insert a duplicate ``players`` row, ingestion
    adopts the existing prospect record (updating its id). ``candidates`` are
    the same ``(name, position)`` rows that do *not* already own the incoming
    real id; each is a dict with ``id``, ``ottoneu_id``, and ``has_draft_capital``.

    A prospect is a synthetic backfill row (``ottoneu_id < 0``) **or** one
    carrying draft capital (the positive placeholder id the draft backfill /
    draft-sharks scraper minted). Matching on position guards against unrelated
    same-name players. Returns the row id to adopt, or None to insert fresh.
    Generalizes the old negative-id-only check that missed drafted prospects
    with positive placeholder ids (GH #483 stranded-projection bug).
    """
    for c in candidates:
        if (c.get("ottoneu_id") or 0) < 0 or c.get("has_draft_capital"):
            return c["id"]
    return None
