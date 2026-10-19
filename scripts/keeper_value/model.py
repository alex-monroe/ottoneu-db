"""The keeper outlook model: a population prior, mixed with the player, shrunk.

**Prior.** For a cell (position × years in league × draft round), the
empirical distribution of next season's latent dollars among past players in
that cell. Thin cells borrow from their neighbours (one bucket away in years or
round, then two, then the whole position), but only as much as they need to
reach ``POOL_TARGET`` effective rows. A well-populated cell is left alone, and
a twelve-player cell is not a coin flip.

**Individual distribution.** A per-position ridge regression of next season's
latent dollars on the player's own signals: this season's pace, last season's
value, snap share, opportunity share (targets; carries + targets for backs;
pass attempts for QBs, each as a share of the team's), availability, age and
years. Its predictive distribution is the prediction m plus the empirical
residuals of training players whose prediction was at a similar level
(``RESIDUAL_BINS`` bins of m). A $90 prediction has a different downside from a
$5 one, so residuals are binned rather than shared.

**Mixing, shrunk by sample size.** The two are combined by quantile averaging:

    q_j = (1 − w) · Q_cell,j + w · (m + R_j(m)),     w = n / (n + k)

with n the player's career games. The weight on his own data grows with the
games behind it: a rookie in week 3 sits near the prior, and a six-year
starter near his own distribution. The mean is the familiar shrinkage
estimate μ_cell + w(m − μ_cell). The prior's upside tail survives for young
players, which is where a keeper's option value lives. k is chosen per
position on the training seasons' last two years (an inner time split), so
nothing is tuned on the season being scored.

Everything is in *latent* dollars (``market.latent_dollars``, which may be
< $1) and is floored to $1 at the end, the price of an empty roster spot.
"""

from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np
import pandas as pd

from scripts.config import MIN_PLAYER_SALARY
from scripts.keeper_value.dataset import DRAFT_BUCKETS, EXPERIENCE_BUCKETS, LATENT_FLOOR

# Quantile grid: J equal-probability midpoints, so a mean over the grid is an
# expectation (option value) and the grid's pinball loss averages to CRPS.
GRID = (np.arange(40) + 0.5) / 40
POOL_TARGET = 40
K_GRID = (1, 2, 5, 10, 20, 40, 80, 160, 320)
RIDGE = 1.0

FEATURES = (
    "pace_now", "pace_now_rel", "has_now", "avail_now", "snap_now", "opp_now",
    "value_prev", "value_prev_rel", "has_prev", "games_prev", "snap_prev", "opp_prev",
    "age", "age_sq", "years", "prior_mean",
)


def weighted_quantiles(values: np.ndarray, weights: np.ndarray, probs: np.ndarray) -> np.ndarray:
    order = np.argsort(values)
    v, w = values[order], weights[order]
    cum = (np.cumsum(w) - 0.5 * w) / w.sum()
    return np.interp(probs, cum, v)


@dataclass
class Prior:
    """Pooled cell distributions of next season's latent dollars."""

    quantiles: dict[tuple[str, str, str], np.ndarray] = field(default_factory=dict)
    mean: dict[tuple[str, str, str], float] = field(default_factory=dict)
    n_eff: dict[tuple[str, str, str], float] = field(default_factory=dict)

    @classmethod
    def fit(cls, train: pd.DataFrame) -> Prior:
        prior = cls()
        e_idx = {b: i for i, b in enumerate(EXPERIENCE_BUCKETS)}
        d_idx = {b: i for i, b in enumerate(DRAFT_BUCKETS)}
        for pos, rows in train.groupby("position"):
            y = rows["latent_next"].to_numpy(float)
            ei = rows["exp_bucket"].map(e_idx).to_numpy()
            di = rows["draft_bucket"].map(d_idx).to_numpy()
            for e, eb in enumerate(EXPERIENCE_BUCKETS):
                for d, db in enumerate(DRAFT_BUCKETS):
                    dist = np.abs(ei - e) + np.abs(di - d)
                    w = np.zeros(len(y))
                    w[dist == 0] = 1.0
                    n = w.sum()
                    # Borrow from rings 1 and 2, then the whole position, only up
                    # to what the cell is short of POOL_TARGET.
                    for ring, cap in ((dist == 1, 0.5), (dist == 2, 0.25), (dist >= 3, 1.0)):
                        short = POOL_TARGET - n
                        if short <= 0 or not ring.any():
                            continue
                        alpha = min(cap, short / ring.sum())
                        w[ring] = alpha
                        n += alpha * ring.sum()
                    key = (pos, eb, db)
                    prior.quantiles[key] = weighted_quantiles(y, w, GRID)
                    prior.mean[key] = float(np.average(y, weights=w))
                    prior.n_eff[key] = float(w.sum())
        return prior

    def lookup(self, rows: pd.DataFrame) -> tuple[np.ndarray, np.ndarray]:
        keys = list(zip(rows["position"], rows["exp_bucket"], rows["draft_bucket"]))
        fallback = np.full(len(GRID), LATENT_FLOOR)
        q = np.vstack([self.quantiles.get(k, fallback) for k in keys])
        mu = np.array([self.mean.get(k, LATENT_FLOOR) for k in keys])
        return q, mu


def design(rows: pd.DataFrame, prior_mean: np.ndarray, age_fill: float = 26.0) -> np.ndarray:
    """The individual-signal matrix (no intercept), in a fixed column order.

    ``prior_mean`` (the cell's μ) lets the regression learn how much draft
    capital and years in league still matter once the player has a stat line.
    """
    games_now = rows["games_now"].to_numpy(float)
    has_now = (games_now > 0).astype(float)
    has_prev = rows["latent_prev"].notna().to_numpy(float)
    pace = rows["latent_now"].fillna(0).to_numpy(float)
    prev = rows["latent_prev"].fillna(0).to_numpy(float)
    team_games = rows["team_games_now"].to_numpy(float)
    age = rows["age"].fillna(age_fill).to_numpy(float)
    cols = {
        "pace_now": pace,
        "pace_now_rel": pace * games_now / (games_now + 4),
        "has_now": has_now,
        "avail_now": np.where(team_games > 0, games_now / np.maximum(team_games, 1), 0),
        "snap_now": rows["snap_now"].fillna(0).to_numpy(float),
        "opp_now": rows["opp_now"].fillna(0).to_numpy(float),
        "value_prev": prev,
        "value_prev_rel": prev * rows["games_prev"].to_numpy(float) / 17,
        "has_prev": has_prev,
        "games_prev": rows["games_prev"].to_numpy(float) / 17,
        "snap_prev": rows["snap_prev"].fillna(0).to_numpy(float),
        "opp_prev": rows["opp_prev"].fillna(0).to_numpy(float),
        "age": age - 26,
        "age_sq": (age - 26) ** 2,
        "years": np.minimum(rows["years"].to_numpy(float), 12),
        "prior_mean": prior_mean,
    }
    return np.column_stack([cols[f] for f in FEATURES])


@dataclass
class PositionFit:
    beta: np.ndarray
    x_mean: np.ndarray
    x_std: np.ndarray
    k: float
    # Residual quantiles (on GRID) per bin of the prediction, and the bin edges.
    bin_edges: np.ndarray
    residuals: np.ndarray

    def regress(self, x: np.ndarray) -> np.ndarray:
        z = (x - self.x_mean) / self.x_std
        return self.beta[0] + z @ self.beta[1:]

    def individual_quantiles(self, x: np.ndarray) -> np.ndarray:
        m = self.regress(x)
        b = np.clip(np.searchsorted(self.bin_edges, m, side="right") - 1, 0, len(self.residuals) - 1)
        return np.maximum(LATENT_FLOOR, m[:, None] + self.residuals[b])


RESIDUAL_BINS = 8


def _fit_individual(rows: pd.DataFrame, prior: Prior, k: float) -> PositionFit:
    """Ridge on players with any NFL games; residual quantiles by prediction bin."""
    rows = rows[rows["career_games"] > 0]
    x = design(rows, prior.lookup(rows)[1])
    y = rows["latent_next"].to_numpy(float)
    x_mean = x.mean(axis=0)
    x_std = x.std(axis=0)
    x_std[x_std == 0] = 1
    z = np.column_stack([np.ones(len(x)), (x - x_mean) / x_std])
    a = z.T @ z + RIDGE * np.diag([0] + [1] * (z.shape[1] - 1))
    beta = np.linalg.solve(a, z.T @ y)
    m = z @ beta
    # Equal-count bins of the prediction; the outer edges are open.
    edges = np.quantile(m, np.linspace(0, 1, RESIDUAL_BINS + 1))
    edges[0], edges[-1] = -np.inf, np.inf
    edges = np.unique(edges)
    b = np.clip(np.searchsorted(edges, m, side="right") - 1, 0, len(edges) - 2)
    res = np.vstack([np.quantile(y[b == i] - m[b == i], GRID) if (b == i).any() else np.zeros(len(GRID))
                     for i in range(len(edges) - 1)])
    return PositionFit(beta, x_mean, x_std, k, edges, res)


def crps(quantiles: np.ndarray, y: np.ndarray) -> np.ndarray:
    """CRPS per row from a grid of equal-probability quantiles (pinball average)."""
    diff = y[:, None] - quantiles
    loss = np.maximum(GRID * diff, (GRID - 1) * diff)
    return 2 * loss.mean(axis=1)


def _mix(q_prior: np.ndarray, q_ind: np.ndarray, n: np.ndarray, k: float) -> np.ndarray:
    w = (n / (n + k))[:, None]
    return np.maximum(MIN_PLAYER_SALARY, (1 - w) * q_prior + w * q_ind)


@dataclass
class KeeperModel:
    """Prior + per-position individual distribution, mixed by w = n/(n+k)."""

    prior: Prior
    fits: dict[str, PositionFit]
    fit_through: int  # newest season N whose N+1 outcome trained the model

    @classmethod
    def fit(cls, train: pd.DataFrame, k_override: float | None = None) -> KeeperModel:
        seasons = sorted(train["season"].unique())
        # Validate k on the last two training seasons (one when training is short).
        inner_val = seasons[-2:] if len(seasons) >= 5 else seasons[-1:] if len(seasons) >= 3 else []
        inner_train = train[~train["season"].isin(inner_val)]
        val = train[train["season"].isin(inner_val)]
        prior_inner = Prior.fit(inner_train) if inner_val else None
        prior = Prior.fit(train)
        fits: dict[str, PositionFit] = {}
        for pos, rows in train.groupby("position"):
            k = k_override if k_override is not None else DEFAULT_K
            if k_override is None and prior_inner is not None:
                k = _select_k(prior_inner, inner_train[inner_train["position"] == pos],
                              val[val["position"] == pos])
            fits[pos] = _fit_individual(rows, prior, k)
        return cls(prior=prior, fits=fits, fit_through=int(max(seasons)))

    def predict_quantiles(self, rows: pd.DataFrame, shrink: bool = True) -> np.ndarray:
        """Next-season dollar value quantiles on ``GRID`` (floored at $1).

        ``shrink=False`` returns the prior alone.
        """
        q_prior, mu = self.prior.lookup(rows)
        if not shrink:
            return np.maximum(MIN_PLAYER_SALARY, q_prior)
        out = np.maximum(MIN_PLAYER_SALARY, q_prior)
        pos = rows["position"].to_numpy()
        x = design(rows, mu)
        n = rows["career_games"].to_numpy(float)
        for p, fit in self.fits.items():
            sel = pos == p
            if sel.any():
                out[sel] = _mix(q_prior[sel], fit.individual_quantiles(x[sel]), n[sel], fit.k)
        return out

    def weights(self, rows: pd.DataFrame) -> np.ndarray:
        """w = n/(n+k): the weight on the player's own data, per row."""
        k = rows["position"].map({p: f.k for p, f in self.fits.items()}).fillna(np.inf).to_numpy(float)
        n = rows["career_games"].to_numpy(float)
        return n / (n + k)


DEFAULT_K = 20.0


def _select_k(prior: Prior, train: pd.DataFrame, val: pd.DataFrame) -> float:
    """Pick k minimising validation CRPS."""
    if train.empty or val.empty:
        return DEFAULT_K
    fit = _fit_individual(train, prior, DEFAULT_K)
    q_prior, mu = prior.lookup(val)
    q_ind = fit.individual_quantiles(design(val, mu))
    y = val["value_next"].to_numpy(float)
    n = val["career_games"].to_numpy(float)
    scores = {k: crps(_mix(q_prior, q_ind, n, k), y).mean() for k in K_GRID}
    return float(min(scores, key=scores.get))


# ---------------------------------------------------------------------------
# Reading a distribution
# ---------------------------------------------------------------------------

def option_value(quantiles: np.ndarray, strike: np.ndarray | float) -> np.ndarray:
    """E[max(0, V − strike)] per row."""
    s = np.broadcast_to(np.asarray(strike, float), (quantiles.shape[0],))
    return np.maximum(0.0, quantiles - s[:, None]).mean(axis=1)


def prob_above(quantiles: np.ndarray, strike: np.ndarray | float) -> np.ndarray:
    """P(V > strike) per row: the share of the equal-probability grid above it.

    Resolution is 1/len(GRID) (2.5%), plenty for a keepable/not call, and it
    stays exact on the $1 floor, where many grid points tie.
    """
    s = np.broadcast_to(np.asarray(strike, float), (quantiles.shape[0],))
    return (quantiles > s[:, None]).mean(axis=1)


def summary_quantiles(quantiles: np.ndarray, probs=(0.1, 0.5, 0.9)) -> np.ndarray:
    return np.vstack([[np.interp(p, GRID, q) for p in probs] for q in quantiles])
