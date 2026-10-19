"""Keeper outlooks for the trade seasons: the published table, or an in-memory fit.

By default the fit reads ``keeper_outlook`` (out-of-fold snapshots per as-of
week, written by ``just keeper-publish``). ``build_outlooks`` instead reruns the
publisher's fit (``scripts.keeper_value.publish.build``) in memory and caches
it under ``.cache/trade_exchange/``. That is for trying a keeper-model change
before it is published; it never writes to the database. Both are keyed by our
``players.id``, and they agree row for row on the published model.
"""

from __future__ import annotations

from pathlib import Path

import numpy as np
import pandas as pd

from scripts.config import fetch_all_rows, get_supabase_client
from scripts.keeper_value import dataset, publish

_repo_root = Path(__file__).resolve().parents[2]
CACHE = _repo_root / ".cache" / "trade_exchange" / "outlooks.parquet"
COLUMNS = ["player_id", "season", "as_of_week", "value_quantiles", "own_weight"]


def build_outlooks(seasons: list[int], current: int) -> pd.DataFrame:
    """Fit and match outlooks for ``seasons``; cache and return them."""
    data = dataset.load(current)
    out = publish.build(data, seasons)
    supabase = get_supabase_client()
    by_pos, by_name = publish.player_index(supabase)
    out["db_id"] = [publish.match(n, p, by_pos, by_name) for n, p in zip(out["name"], out["position"])]
    out = out.dropna(subset=["db_id"]).drop_duplicates(["db_id", "season", "as_of_week"])
    frame = pd.DataFrame({
        "player_id": out["db_id"].astype(str),
        "season": out["season"].astype(int),
        "as_of_week": out["as_of_week"].astype(int),
        "value_quantiles": [list(map(float, q)) for q in out["value_quantiles"]],
        "own_weight": out["own_weight"].astype(float),
    })
    CACHE.parent.mkdir(parents=True, exist_ok=True)
    frame.to_parquet(CACHE)
    return frame


def _from_db() -> pd.DataFrame:
    rows = fetch_all_rows(get_supabase_client(), "keeper_outlook", ", ".join(COLUMNS))
    return pd.DataFrame(rows, columns=COLUMNS)


def load_outlooks(source: str = "db") -> pd.DataFrame:
    if source == "db":
        return _from_db()
    if not CACHE.exists():
        raise FileNotFoundError(f"{CACHE} missing — run `just trade-exchange --rebuild-outlooks` first")
    return pd.read_parquet(CACHE)


class OutlookBook:
    """The newest snapshot no later than an as-of week — ``outlookAsOf`` in TS."""

    def __init__(self, frame: pd.DataFrame):
        self._by: dict[tuple[str, int], list[tuple[int, np.ndarray]]] = {}
        for r in frame.itertuples(index=False):
            self._by.setdefault((r.player_id, int(r.season)), []).append(
                (int(r.as_of_week), np.asarray(r.value_quantiles, dtype=float)))
        for snaps in self._by.values():
            snaps.sort(key=lambda s: s[0])

    def as_of(self, player_id: str | None, season: int, week: int) -> np.ndarray | None:
        if not player_id:
            return None
        best = None
        for w, q in self._by.get((player_id, season), []):
            if w <= week:
                best = q
        return best


def option_value(quantiles: np.ndarray, salary: float) -> float:
    """E[max(0, V − S)] over the equal-probability grid — ``optionValue`` in TS."""
    return float(np.maximum(0.0, quantiles - salary).mean())


def prob_keepable(quantiles: np.ndarray, salary: float) -> float:
    return float((quantiles > salary).mean())
