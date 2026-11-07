"""Stage A of the stat-level projection redesign: the Marcel-plus stat baseline.

Projects each player's next-season **stat line per game**, then scores it
through ``scripts/scoring.py`` into PPG. Design: docs/exec-plans/stat-projections/
00-synthesis.md §4 (Stage A); parameters: 08-stability-study.md.

For every (position, stat) the projection is a recency-weighted, sample-size-
shrunk estimate:

    num_w = Σ_i w_i · num_i      den_w = Σ_i w_i · den_i      (lags i = 1..3)
    rate  = (num_w + k · μ) / (den_w + k)

- ``num``/``den`` are season totals: e.g. passing yards / passing attempts for
  ``ypa``, or rushing attempts / games for the per-game volume ``rush_att_pg``.
- ``w`` are recency weights normalised so the most recent season is 1.0, so
  ``den_w`` is in "most-recent-season-equivalent" opportunities. In
  ``stat_a01_marcel`` volume and ppg use [.65, .20, .15] and per-opportunity
  rates use flatter Marcel-like [.45, .32, .23] (08 §3.2).
- ``μ`` is the position's opportunity-pooled rate over the same three seasons
  (tracks era drift: league-wide rates move, the prior moves with them).
- ``k`` is the pseudo-count, **fitted per (position, stat) inside each fold** by
  minimising the opportunity-weighted squared error of next-season rate on the
  training seasons only (every season strictly before the target). Fitting k by
  predictive loss rather than a within-season variance decomposition absorbs
  year-to-year drift, which the stability study found makes the within-season k
  2–8x too small for volume (08 §1.5).

Kickers are out of scope for the stat chain (00-synthesis §4 Stage B): they get
the same machinery on ppg directly.

Everything here is pure (DataFrames in, dicts out) so the runner, the per-stat
eval (``stat_eval.py``) and the tests share one implementation.

**Iterations are frozen configs** (naming and iteration protocol:
docs/exec-plans/stat-projections/09-stat-model-ledger.md). Every ``stat_*`` model
in ``model_config.py`` has a ``StatModelConfig`` in ``STAT_MODEL_CONFIGS``. A new
idea is a new config field whose default reproduces the old behaviour, so
earlier models keep projecting byte-for-byte (pinned by
``scripts/tests/test_stat_baseline.py``). Never change what an existing config
does; add a new ``stat_<stage><NN>_<slug>`` instead.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Iterable, Optional

import numpy as np
import pandas as pd

from scripts.scoring import score_stats

# First season of usable nfl_stats; earlier seasons are not loaded.
MIN_DATA_SEASON = 2010

# Candidate pseudo-counts for the in-fold grid search. Spans "no shrinkage" to
# "effectively the prior mean" for every opportunity unit used (games ≈ 1–17,
# attempts/targets up to several hundred per season).
K_GRID: np.ndarray = np.concatenate([[0.0], np.geomspace(0.05, 1e5, 90)])

# Season ages are measured on this date (month, day): roughly Week 1.
AGE_REFERENCE = (9, 1)
# Clip on the fitted age multiplier, against a wild quadratic at a thin edge.
AGE_MULT_CLIP = (0.5, 1.5)

# Minimum training pairs to fit k; below this the stat falls back to FALLBACK_K.
MIN_FIT_PAIRS = 30
FALLBACK_K = {"volume": 3.0, "rate": 200.0}


@dataclass(frozen=True)
class StatModelConfig:
    """Every tunable choice of one stat-model iteration.

    Recency weights are for lags 1..3, normalised to lag 1 = 1.0. Add new
    behaviour as a new field whose default reproduces the existing configs.
    """

    name: str
    volume_weights: tuple[float, ...] = (1.0, 0.20 / 0.65, 0.15 / 0.65)
    rate_weights: tuple[float, ...] = (1.0, 0.32 / 0.45, 0.23 / 0.45)
    history_seasons: int = 3
    k_grid: tuple[float, ...] = field(default_factory=lambda: tuple(K_GRID))
    # stat_a02+: multiply each shrunk stat by an age curve 1 + b1·x + b2·x²,
    # x = clip(age, age_clip) − age_center, with (b1, b2) fitted per (position,
    # stat) on the residuals of the shrunk prediction, seasons < target only.
    age_adjust: bool = False
    age_center: float = 27.0
    age_clip: tuple[float, float] = (21.0, 36.0)


STAT_MODEL_CONFIGS: dict[str, StatModelConfig] = {
    # Stage A, iteration 01: recency-weighted per-stat shrinkage, k fitted in-fold.
    "stat_a01_marcel": StatModelConfig(name="stat_a01_marcel"),
    # Stage A, iteration 02: a01 + in-fold quadratic age curve per (position, stat).
    "stat_a02_age": StatModelConfig(name="stat_a02_age", age_adjust=True),
}

# The config the module-level defaults below describe (tests, ad-hoc use).
DEFAULT_CONFIG = STAT_MODEL_CONFIGS["stat_a01_marcel"]
VOLUME_WEIGHTS = DEFAULT_CONFIG.volume_weights
RATE_WEIGHTS = DEFAULT_CONFIG.rate_weights
HISTORY_SEASONS = DEFAULT_CONFIG.history_seasons


def get_stat_config(model_name: str) -> StatModelConfig:
    """The frozen config for a ``stat_*`` model; KeyError names the known ones."""
    try:
        return STAT_MODEL_CONFIGS[model_name]
    except KeyError:
        raise KeyError(
            f"No StatModelConfig for {model_name!r}; known: {sorted(STAT_MODEL_CONFIGS)}"
        ) from None


@dataclass(frozen=True)
class StatSpec:
    """One link of a position's stat chain.

    ``num`` / ``den`` name derived season-total columns (see ``_derive``).
    ``den == "games"`` marks a per-game volume stat; otherwise ``den`` is the
    opportunity the rate is per, and its projected per-game value must come from
    an earlier link in the chain.
    """

    name: str
    num: str
    den: str

    @property
    def kind(self) -> str:
        return "volume" if self.den == "games" else "rate"


_RUSH = [
    StatSpec("rush_att_pg", "rushing_attempts", "games"),
    StatSpec("ypc", "rushing_yards", "rushing_attempts"),
    StatSpec("rush_td_rate", "rushing_tds", "rushing_attempts"),
]
_REC = [
    StatSpec("targets_pg", "targets", "games"),
    StatSpec("catch_rate", "receptions", "targets"),
    StatSpec("yds_per_target", "receiving_yards", "targets"),
    StatSpec("rec_td_rate", "receiving_tds", "targets"),
]
_SKILL = _RUSH + _REC + [
    StatSpec("fumbles_per_touch", "fumbles_lost", "touches"),
    StatSpec("two_pt_rr_pg", "two_point_rush_rec", "games"),
]

CHAINS: dict[str, list[StatSpec]] = {
    "QB": [
        StatSpec("pass_att_pg", "passing_attempts", "games"),
        StatSpec("ypa", "passing_yards", "passing_attempts"),
        StatSpec("pass_td_rate", "passing_tds", "passing_attempts"),
        StatSpec("int_rate", "interceptions", "passing_attempts"),
        *_RUSH,
        StatSpec("fumbles_pg", "fumbles_lost", "games"),
        StatSpec("two_pt_pass_pg", "two_point_pass", "games"),
        StatSpec("two_pt_rr_pg", "two_point_rush_rec", "games"),
    ],
    "RB": _SKILL,
    "WR": _SKILL,
    "TE": _SKILL,
    "K": [StatSpec("ppg", "total_points", "games")],
}

_RAW_COLS = [
    "games_played", "passing_attempts", "passing_yards", "passing_tds", "interceptions",
    "rushing_attempts", "rushing_yards", "rushing_tds", "targets", "receptions",
    "receiving_yards", "receiving_tds", "fumbles_lost", "two_point_pass",
    "two_point_rush_rec", "total_points",
]


def prepare_seasons(
    nfl_stats: pd.DataFrame,
    positions: dict[str, str],
    birth_dates: dict[str, object] | None = None,
) -> pd.DataFrame:
    """Season-total frame keyed by (player_id, season) with position and derived columns.

    ``nfl_stats`` is raw ``nfl_stats`` rows; ``positions`` maps player_id → position;
    ``birth_dates`` (optional) maps player_id → birth date, giving an ``age`` column
    (years on Sep 1 of the season; NaN when unknown). Rows with no games, or a
    position outside ``CHAINS``, are dropped.
    """
    df = nfl_stats.copy()
    df["player_id"] = df["player_id"].astype(str)
    df["position"] = df["player_id"].map(positions)
    df = df[df["position"].isin(CHAINS.keys())]
    for col in _RAW_COLS:
        df[col] = pd.to_numeric(df[col], errors="coerce").fillna(0.0) if col in df.columns else 0.0
    df["season"] = pd.to_numeric(df["season"], errors="coerce").astype("Int64")
    df["games"] = df["games_played"]
    df["touches"] = df["rushing_attempts"] + df["receptions"]
    df = df[df["games"] > 0].dropna(subset=["season"])
    df["season"] = df["season"].astype(int)
    df["age"] = np.nan
    if birth_dates:
        born = pd.to_datetime(df["player_id"].map(birth_dates), errors="coerce")
        ref = pd.to_datetime(
            {"year": df["season"], "month": AGE_REFERENCE[0], "day": AGE_REFERENCE[1]}
        )
        df["age"] = (ref - born).dt.days / 365.25
    return df[["player_id", "season", "position", "games", "touches", "age", *_RAW_COLS]].reset_index(drop=True)


def _weights(spec: StatSpec, cfg: StatModelConfig) -> tuple[float, ...]:
    return cfg.volume_weights if spec.kind == "volume" else cfg.rate_weights


def _history_totals(
    seasons: pd.DataFrame, spec: StatSpec, target: int, cfg: StatModelConfig = DEFAULT_CONFIG
) -> pd.DataFrame:
    """Per player: recency-weighted num/den over the lags before ``target``."""
    w = _weights(spec, cfg)
    window = seasons[(seasons["season"] < target) & (seasons["season"] >= target - cfg.history_seasons)]
    if window.empty:
        return pd.DataFrame(columns=["player_id", "num_w", "den_w"])
    lag_w = (target - window["season"]).map(lambda lag: w[lag - 1])
    out = pd.DataFrame({
        "player_id": window["player_id"].values,
        "num_w": (window[spec.num] * lag_w).values,
        "den_w": (window[spec.den] * lag_w).values,
    })
    return out.groupby("player_id", as_index=False)[["num_w", "den_w"]].sum()


def _prior_mean(
    seasons: pd.DataFrame, spec: StatSpec, target: int, cfg: StatModelConfig = DEFAULT_CONFIG
) -> Optional[float]:
    """Position's opportunity-pooled rate over the history window before ``target``."""
    window = seasons[(seasons["season"] < target) & (seasons["season"] >= target - cfg.history_seasons)]
    den = float(window[spec.den].sum())
    return float(window[spec.num].sum()) / den if den > 0 else None


def _shrunk(num_w: np.ndarray, den_w: np.ndarray, k: float, mu: float) -> np.ndarray:
    return (num_w + k * mu) / (den_w + k)


def _training_pairs(
    seasons: pd.DataFrame, spec: StatSpec, target: int, cfg: StatModelConfig
) -> Optional[dict[str, np.ndarray]]:
    """Leakage-free (history → next season) pairs for one stat, seasons < target only.

    For every season ``s`` with ``MIN_DATA_SEASON < s < target``: each player's
    recency-weighted history over ``s-3..s-1`` (``num``, ``den``), the prior mean
    ``mu``, the actual season-``s`` rate ``y``, its opportunity count ``wt`` and the
    player's ``age`` in season ``s``. ``None`` when there are too few pairs.
    """
    nums, dens, ys, wts, mus, ages = [], [], [], [], [], []
    for s in range(MIN_DATA_SEASON + 1, target):
        mu = _prior_mean(seasons, spec, s, cfg)
        if mu is None:
            continue
        hist = _history_totals(seasons, spec, s, cfg)
        hist = hist[hist["den_w"] > 0]
        actual = seasons[(seasons["season"] == s) & (seasons[spec.den] > 0)]
        pairs = hist.merge(actual[["player_id", spec.num, spec.den, "age"]], on="player_id")
        if pairs.empty:
            continue
        nums.append(pairs["num_w"].to_numpy(float))
        dens.append(pairs["den_w"].to_numpy(float))
        ys.append((pairs[spec.num] / pairs[spec.den]).to_numpy(float))
        wts.append(pairs[spec.den].to_numpy(float))
        mus.append(np.full(len(pairs), mu))
        ages.append(pairs["age"].to_numpy(float))
    if not nums or sum(len(a) for a in nums) < MIN_FIT_PAIRS:
        return None
    keys = ("num", "den", "y", "wt", "mu", "age")
    return {k: np.concatenate(a) for k, a in zip(keys, (nums, dens, ys, wts, mus, ages))}


def fit_k(
    seasons: pd.DataFrame, spec: StatSpec, target: int, cfg: StatModelConfig = DEFAULT_CONFIG
) -> float:
    """Pseudo-count minimising next-season weighted squared error, seasons < target only.

    Training pairs come from ``_training_pairs``. The loss is weighted by the
    season-``s`` opportunity count, the natural weight for a rate whose sampling
    variance shrinks as 1/n.
    """
    pairs = _training_pairs(seasons, spec, target, cfg)
    if pairs is None:
        return FALLBACK_K[spec.kind]
    return _best_k(pairs, cfg)


def _best_k(pairs: dict[str, np.ndarray], cfg: StatModelConfig) -> float:
    num, den, y, wt, mu = (pairs[k] for k in ("num", "den", "y", "wt", "mu"))
    losses = [float(np.sum(wt * (_shrunk(num, den, k, mu) - y) ** 2)) for k in cfg.k_grid]
    return float(cfg.k_grid[int(np.argmin(losses))])


def _age_x(age: np.ndarray, cfg: StatModelConfig) -> np.ndarray:
    return np.clip(age, *cfg.age_clip) - cfg.age_center


def age_multiplier(age: np.ndarray, coef: tuple[float, float], cfg: StatModelConfig) -> np.ndarray:
    """1 + b1·x + b2·x², clipped; 1.0 where age is unknown."""
    x = _age_x(np.asarray(age, dtype=float), cfg)
    m = np.clip(1.0 + coef[0] * x + coef[1] * x**2, *AGE_MULT_CLIP)
    return np.where(np.isnan(x), 1.0, m)


def fit_age_curve(
    pairs: dict[str, np.ndarray], k: float, cfg: StatModelConfig
) -> tuple[float, float]:
    """(b1, b2) for y ≈ pred·(1 + b1·x + b2·x²) by opportunity-weighted least squares.

    ``pred`` is the shrunk prediction with the fold's fitted ``k``; pairs with no
    known age are left out. Linear in (b1, b2): (y − pred) = pred·x·b1 + pred·x²·b2.
    Returns (0, 0) (no adjustment) when the system is degenerate.
    """
    pred = _shrunk(pairs["num"], pairs["den"], k, pairs["mu"])
    ok = ~np.isnan(pairs["age"]) & np.isfinite(pred)
    if ok.sum() < MIN_FIT_PAIRS:
        return (0.0, 0.0)
    x = _age_x(pairs["age"][ok], cfg)
    p, y, w = pred[ok], pairs["y"][ok], pairs["wt"][ok]
    design = np.column_stack([p * x, p * x**2])
    sw = np.sqrt(w)
    coef, *_ = np.linalg.lstsq(design * sw[:, None], (y - p) * sw, rcond=None)
    if not np.all(np.isfinite(coef)):
        return (0.0, 0.0)
    return (float(coef[0]), float(coef[1]))


@dataclass
class FoldParams:
    """Fitted Stage A parameters for one target season: (position, stat) → (k, μ)."""

    target_season: int
    k: dict[tuple[str, str], float]
    mu: dict[tuple[str, str], float]
    config: StatModelConfig = DEFAULT_CONFIG
    # (b1, b2) of the age curve per (position, stat); empty unless cfg.age_adjust.
    age: dict[tuple[str, str], tuple[float, float]] = field(default_factory=dict)


def fit_fold(
    seasons: pd.DataFrame, target: int, cfg: StatModelConfig = DEFAULT_CONFIG
) -> FoldParams:
    """Fit k and μ for every (position, stat), using only seasons before ``target``."""
    train = seasons[seasons["season"] < target]
    ks: dict[tuple[str, str], float] = {}
    mus: dict[tuple[str, str], float] = {}
    ages: dict[tuple[str, str], tuple[float, float]] = {}
    for position, chain in CHAINS.items():
        pos_rows = train[train["position"] == position]
        for spec in chain:
            mu = _prior_mean(pos_rows, spec, target, cfg)
            if mu is None:
                continue
            key = (position, spec.name)
            mus[key] = mu
            pairs = _training_pairs(pos_rows, spec, target, cfg)
            ks[key] = FALLBACK_K[spec.kind] if pairs is None else _best_k(pairs, cfg)
            if cfg.age_adjust and pairs is not None:
                ages[key] = fit_age_curve(pairs, ks[key], cfg)
    return FoldParams(target, ks, mus, cfg, ages)


def project_rates(
    seasons: pd.DataFrame, params: FoldParams, k_scale: float | None = 1.0
) -> pd.DataFrame:
    """Shrunk per-stat rates for every player with history before the target.

    Returns one row per (player_id, position) with a column per stat name.
    ``k_scale`` multiplies every fitted k (1.0 = the model; 0 = raw weighted rate;
    ``None`` = the prior mean itself), which the per-stat eval uses for its
    no-shrinkage and position-mean comparators. When the fold has an age curve
    (``cfg.age_adjust``), shrunk rates are multiplied by it at the player's age in
    the target season; the position-mean comparator is left unadjusted.
    """
    target = params.target_season
    cfg = params.config
    frames = []
    for position, chain in CHAINS.items():
        pos_rows = seasons[(seasons["position"] == position) & (seasons["season"] < target)]
        players = pos_rows[pos_rows["season"] >= target - cfg.history_seasons]["player_id"].unique()
        if len(players) == 0:
            continue
        out = pd.DataFrame({"player_id": players, "position": position})
        target_age = None
        if params.age:
            last = pos_rows.sort_values("season").groupby("player_id").tail(1).set_index("player_id")
            target_age = (last["age"] + (target - last["season"])).reindex(players).to_numpy(float)
        for spec in chain:
            key = (position, spec.name)
            if key not in params.mu:
                continue
            mu = params.mu[key]
            hist = _history_totals(pos_rows, spec, target, cfg).set_index("player_id")
            num_w = hist["num_w"].reindex(players).fillna(0.0).to_numpy(float)
            den_w = hist["den_w"].reindex(players).fillna(0.0).to_numpy(float)
            if k_scale is None:
                vals = np.full(len(players), mu)
            else:
                k = params.k[key] * k_scale
                with np.errstate(invalid="ignore", divide="ignore"):
                    vals = _shrunk(num_w, den_w, k, mu)
                vals = np.where(den_w + k > 0, vals, mu)
                if target_age is not None and key in params.age:
                    vals = vals * age_multiplier(target_age, params.age[key], cfg)
            out[spec.name] = vals
        frames.append(out)
    if not frames:
        return pd.DataFrame(columns=["player_id", "position"])
    return pd.concat(frames, ignore_index=True)


def stat_line_per_game(position: str, r: dict) -> dict[str, float]:
    """Compose a position's per-game stat line (scoring keys) from its shrunk rates."""
    g = lambda name: float(r.get(name) or 0.0)  # noqa: E731
    if position == "K":
        return {}
    line: dict[str, float] = {}
    rush = g("rush_att_pg")
    line["rushing_yards"] = rush * g("ypc")
    line["rushing_tds"] = rush * g("rush_td_rate")
    line["two_point_rush_rec"] = g("two_pt_rr_pg")
    if position == "QB":
        att = g("pass_att_pg")
        line["passing_yards"] = att * g("ypa")
        line["passing_tds"] = att * g("pass_td_rate")
        line["interceptions"] = att * g("int_rate")
        line["fumbles_lost"] = g("fumbles_pg")
        line["two_point_pass"] = g("two_pt_pass_pg")
        return line
    targets = g("targets_pg")
    line["receptions"] = targets * g("catch_rate")
    line["receiving_yards"] = targets * g("yds_per_target")
    line["receiving_tds"] = targets * g("rec_td_rate")
    line["fumbles_lost"] = (rush + line["receptions"]) * g("fumbles_per_touch")
    return line


def projected_ppg(position: str, r: dict) -> float:
    """Scored PPG for one player's shrunk rates (kickers: the shrunk ppg itself)."""
    if position == "K":
        return float(r.get("ppg") or 0.0)
    return float(score_stats(stat_line_per_game(position, r)))


def project_season(
    seasons: pd.DataFrame,
    target: int,
    params: FoldParams | None = None,
    cfg: StatModelConfig = DEFAULT_CONFIG,
) -> dict[str, float]:
    """player_id → projected PPG for ``target`` (fits the fold with ``cfg`` if not given)."""
    params = params or fit_fold(seasons, target, cfg)
    rates = project_rates(seasons, params)
    return {
        row["player_id"]: projected_ppg(row["position"], row)
        for row in rates.to_dict("records")
    }


def stat_names(positions: Iterable[str] | None = None) -> list[tuple[str, str]]:
    """(position, stat) pairs in chain order, for reports."""
    return [(p, s.name) for p in (positions or CHAINS) for s in CHAINS[p]]
