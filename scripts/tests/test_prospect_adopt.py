"""Tests for scripts/prospect_adopt.choose_prospect_to_adopt.

(Relocated from the deleted test_scrape_roster.py when the Playwright roster scrape
was replaced by the CSV reconciliation + player-card HTTP scrape.)
"""

from __future__ import annotations

from scripts.prospect_adopt import choose_prospect_to_adopt


def test_adopts_prospect_with_draft_capital():
    candidates = [
        {"id": "real-uuid", "ottoneu_id": 12345, "has_draft_capital": False},
        {"id": "prospect-uuid", "ottoneu_id": 67890, "has_draft_capital": True},
    ]
    assert choose_prospect_to_adopt(candidates) == "prospect-uuid"


def test_adopts_synthetic_negative_id():
    candidates = [
        {"id": "synthetic-uuid", "ottoneu_id": -216196354, "has_draft_capital": False},
    ]
    assert choose_prospect_to_adopt(candidates) == "synthetic-uuid"


def test_no_adoption_for_unrelated_real_players():
    candidates = [
        {"id": "other-real", "ottoneu_id": 99999, "has_draft_capital": False},
    ]
    assert choose_prospect_to_adopt(candidates) is None


def test_empty_candidates():
    assert choose_prospect_to_adopt([]) is None


def test_prefers_first_eligible_prospect():
    candidates = [
        {"id": "prospect", "ottoneu_id": -1, "has_draft_capital": False},
        {"id": "another", "ottoneu_id": -2, "has_draft_capital": True},
    ]
    assert choose_prospect_to_adopt(candidates) == "prospect"
