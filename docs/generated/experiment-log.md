# Projection Experiment Log

_Tracks every model iteration attempt to prevent re-trying failed approaches._

> ⚠️ **The historical table at the bottom is in-sample for the learned models
> (`v20`–`v31`) — they were trained on the seasons they're scored on; do not read
> those deltas as real gains.** The [methodology audit](../exec-plans/projection-methodology-audit.md)
> (2026-06-10) re-ranked everything out-of-sample. At that point the additive
> `v14_qb_starter` was the honest best (the `v20`→`v31` in-sample "progression"
> was a leakage artifact). **That reversed after the #599 coverage backfill**
> (PRs #607/#608): on the corrected population the learned **`v31_depth_chart`**
> is the honest held-out #1 and *significantly* beats `v14_qb_starter`
> (Δ−0.091, CI [−0.163, −0.020], rolling-origin), so `v31_depth_chart` was
> promoted to active (#609), then displaced by **`v33_tuned_base`** (#589/#618 —
> v31 with inner-fold-tuned base recency weights, a significant held-out win).
> The current comparator/gate is the active model
> (`projection_models.is_active` = `v33_tuned_base`), **not** `v14_qb_starter`.

## Held-out experiments (post-audit protocol — #594+)

New experiments are logged here with **leakage-free held-out** numbers, the gate
being a *significant* win over the active model. Generate the row with
`/experiment`: `just holdout-eval --protocol rolling …` for the MAE/CI and
`just significance NEW <active-model> --protocol rolling …` for the verdict. Δ
and CI are for `MAE(model) − MAE(comparator)` — the comparator is named in the
row (the active model at the time of the experiment; negative ⇒ model better).
Iterate on the rolling folds; the final window is confirmation-only (one look).

**Rank Δ is a required column** (#598 made ranking quality first-class): the
projections feed VORP, auction values, and keeper calls, which consume
within-position *ordering*, not PPG level — a model can win MAE while losing the
ordering that downstream decisions actually use. Fill it from the "Ranking
quality" section of the holdout-eval report: per-position Spearman ρ delta and
top-N hit delta vs the comparator (QB/TE top-12, RB/WR top-24). Use "≈" for
within-noise (±0.01 ρ), and call out any position where ordering moves against
the MAE verdict. "—" only for rows predating the column.

| Date | Model | Change | Held-out ALL MAE | Δ vs comparator | 95% CI | Significant? | Rank Δ (ρ / top-N vs comparator) | Protocol | PR |
|------|-------|--------|------------------|----------|--------|--------------|----------------------------------|----------|-----|
| 2026-06-14 | v41_coaching_residual | #651 spike acquisition #1: two-stage residual on v33 + `coaching_change_raw` (offseason head-coach change, new `team_coaching` table from nflverse `games.csv`) + `coaching_change_raw*position`; coach-stable players byte-identical to v33 | 2.229 | +0.0014 vs **v33** | [−0.0003, +0.0033] | **N** (p=0.106) — **NEGATIVE / TIE**; the *new-information* acquisition the wave's modeling NEGATIVEs called for, but the small coach-changed cohort (~5–10 teams/yr) carries too little signal. Residual α=100 shrinks coefs ≈0. QB hypothesis a dead tie (MAE 3.698 vs 3.697). Per spike plan → next is source #3 (FA/contract). See #651 section below | QB ρ 0.671→0.670, WR ρ 0.780→0.780, TE 0.760→0.759 (all ≈); top-N unchanged | rolling 2023–2025 (full window; tie, nothing to confirm) | #651 |
| 2026-06-14 | v40_huber_e110 / e135 / e200 | #645 robust loss: Huber instead of Ridge squared loss (epsilon 1.10/1.35/2.00), v33 features. Best = e200 | 2.225 (e200) | −0.008 vs **v33** | [−0.020, +0.005] | **N** (p=0.23) — **NEGATIVE, tie at best**; only e200 (≈Ridge) ties, robust e110/e135 *regress* (+0.018/+0.007). Robustness is the wrong direction. See #645 section below | e200: WR ρ +0.002, QB +0.004, TE −0.002 (≈); top-N ≈ | rolling 2023–24 (iteration look; confirmation window not burned) | #645 |
| 2026-06-14 | v39_relevance_step / v39b / v39c | #643 rank-aware training: Ridge fit weighted by prior-season relevance (topn_step k=1/k=2; ppg_within_pos). 3 schemes, best = v39c | 2.259 (v39c) | **+0.026** vs **v33** | [+0.005, +0.047] | **SIGNIFICANT REGRESSION** (p=0.015) — **NEGATIVE, all 3 schemes worse**; ranking *not* improved where it matters (WR/TE ρ down). See #643 section below | WR ρ 0.762→0.758, TE ρ 0.748→0.724–0.738 (worse); QB ρ +0.009 / top-12 0.417→0.500 (99 samples, unresolvable) | rolling 2023–24 (iteration look; confirmation window not burned) | #643 |
| 2026-06-14 | v38_qb_ecosystem | #642 pass-catcher ecosystem: v33 + team_qb_quality_raw (projected QB1's centered prior PPG) + team_qb_changed_raw (QB1 changed YoY), WR/TE-only from depth charts | 2.247 | +0.001 vs **v33** | [−0.011, +0.013] | **N** (p=0.86) — **NEGATIVE, stopped on tie**; WR +0.010 (p=0.52), TE −0.010 (p=0.37) — both noise. Signal subsumed by implied_team_total + own target_share/wopr; team_qb_changed has a big in-sample coef that doesn't generalize. See #642 section below | TE ρ +0.004 (0.747→0.751), WR ρ −0.002; top-N unchanged | rolling 2023–24 (iteration look; confirmation window not burned) | #642 |
| 2026-06-12 | v37_qb_volume | #640 QB volume signal: v33 + qb_rush_volume_raw + qb_pass_volume_raw (recency-weighted attempts/game from nfl_stats, QB-only) | 2.239 | +0.003 vs **v33** | [−0.030, +0.035] | **N** (p=0.83) — **NEGATIVE, bounded bet stopped on tie**; QB-only Δ −0.027 (CI [−0.245, +0.186], p=0.82 — right direction, unresolvable at 62 QB clusters); in-sample coefficients ≈0. See #640 section below | QB ρ **+0.011** (0.629→0.640), top-12 hit unchanged; others ≈ | rolling 2023–24 (iteration look; confirmation window not burned) | #640 |
| 2026-06-12 | v36_pos_regression | #639 per-position regression strength: v33 + regression_to_mean*position interaction (learned per-position mean-reversion) | 2.251 | +0.021 vs **v33** | [−0.009, +0.053] | **N** (p=0.18) — **NEGATIVE, stopped on iteration look**; the extra interaction columns add variance, not signal. See #639 section below | ρ ≈ (QB −0.015, RB +0.002, WR −0.005, TE −0.001); top-N unchanged | rolling 2023–24 (iteration look; confirmation window not burned) | #639 |
| 2026-06-12 | v35_pos_tuned_base | #639 per-position base recency weights: inner-fold sweep changed only RB ([0.65,0.20,0.15]→[0.70,0.20,0.10]); QB/WR/TE kept the #589 tune | 2.245 | +0.015 vs **v33** | [−0.001, +0.032] | **N** (p=0.066, trending *worse*) — **NEGATIVE, stopped on iteration look**; RB-only Δ −0.005 (CI [−0.018, +0.008], p=0.46) — the swept RB gain is noise OOS while full-refit coefficient drift hurts elsewhere. See #639 section below | ρ ≈ (TE +0.001, RB +0.001, QB −0.003, WR −0.003); WR top-24 hit 0.458→0.417 | rolling 2023–24 (iteration look; confirmation window not burned) | #639 |
| 2026-06-11 | v34_qb_residual | #592 QB-only residual on v33 (depth_chart, qb_backup_penalty, implied_team_total; non-QB byte-identical to v33 by construction) | QB 3.846 (ALL 2.239) | QB **+0.015** vs **v33** | [−0.016, +0.049] | **N** (p=0.36) — **NEGATIVE, bounded bet stopped on tie**; residual coefficients ≈0. See #592 section below | ≈ (non-QB identical by construction; QB ρ within noise) | rolling 2023–24 (iteration look; confirmation window not burned) | #592 |
| 2026-06-11 | v33_tuned_base | #589 base tuning: recency weights [0.55,0.25,0.20]→[0.65,0.20,0.15] (inner-fold sweep; exponent grid confirmed 1.0); v31 otherwise unchanged | **2.241** | **−0.011** vs **v31** | [−0.022, −0.001] | **Y** (p=0.038; iteration look 2023–24: −0.016, CI [−0.027, −0.004], p=0.007) — **clears the promotion gate**. See #589 section below | ρ ≈ everywhere except QB −0.003; WR top-24 0.250→0.292, TE top-12 0.500→0.583 | rolling 2023–2025 | #589 |
| 2026-06-11 | v32_pruned | #588 ablation: v31 minus age_curve, usage_share, draft_capital, vegas, qb_backup_penalty (13→8 features) | 2.252 | +0.020 vs **v31** | [−0.027, +0.065] | N (p=0.40) — no worse, not better; **v31 stays active**. See #588 section below | ρ ≈ (QB +0.003 … TE −0.010); WR top-24 0.333→0.250 — top-tier loss drove the no-promote call | rolling 2023–2025 | #588 |
| 2026-06-10 | v31_depth_chart | #599 backfill of 2021–2023 player_stats (coverage 29–40%→82–84%); all models re-projected/retrained on the corrected population | 2.232 | **−0.091** vs v14 | [−0.163, −0.020] | **Y** (p=0.014, 617 clusters) | — (predates column; see #598 tables in holdout report) | rolling 2023–2025 | #599 backfill |
| 2026-06-10 | v31_depth_chart | same — fixed window (3-season train handicap) | 2.269 | −0.020 vs v14 | [−0.113, +0.078] | N (p=0.68) | — | fixed 2021–23→24–25 | #599 backfill |
| 2026-06-10 | v20_learned_usage | same backfill — over-projection bias check | 2.325 | — | bias −1.060→**−0.032** | bias artifact removed | — | fixed | #599 backfill |

### Availability / expected-games (#587) — measured on `availability-backtest`, not rate MAE

#587 targets the *availability budget* (avail-MAE − rate-MAE), a different metric
from the rate-MAE held-out table above. Stage (a) is a leakage-free eval-time
expected-games haircut on the rate projection
(`pred_avail = pred × min(E[games], 17)/17`, E[games] from seasons strictly before
the target), exposed as `just availability-backtest --expected-games {none,constant,history}`.
The rate projection — and its `significance` gate — are untouched, so this isolates
the availability question. Seasons 2022–2025, model `v14_qb_starter` (DoD names its
+0.589 budget):

| Mode | Avail MAE | Availability budget | Avail bias | Note |
|------|-----------|---------------------|------------|------|
| none (raw rate) | 2.986 | +0.589 | −1.946 | baseline — no availability modeling |
| constant (per-position mean games) | 2.630 | +0.232 | +1.020 | overcorrects — flat haircut over-penalises durable players |
| **history (player recency-weighted games)** | **2.268** | **−0.130** | **−0.236** | **bar-setter: −0.718 avail MAE (−24%), budget turns negative, bias collapses** |

The per-player **history** haircut clears the DoD decisively — v14's availability
budget +0.589 → −0.130 (below even FantasyPros's −0.124) and the −1.95
over-projection bias collapses to −0.24, with the rate projection unchanged. The
same effect holds on `v8_age_regression` (budget +0.625 → −0.138), so it is not a
v14 quirk. **Guardrail:** the haircut *hurts* already-availability-aware projections
(FantasyPros budget −0.124 → +0.084) — apply it to pure-rate models only.

**Stage (b) — structural expected-games model: NEGATIVE.** Age/position/depth-role
features (linear) tie plain history on games-MAE (3.59→3.58); a nonlinear GBM gets
a fragile ~4% that is hyperparameter-sensitive and burns confirmation looks. Plain
history is the robust production estimator; no trained model. (Matches the issue's
own staging — injury/structural features only if (b) leaves budget; it doesn't.)

**Stage (c) — productionised** as the `projected_games` column (PR #613) and
availability-inclusive value in VORP/surplus/arbitration (PR #614).

**Thin-history guard (c2 review).** The before/after review showed plain history
over-penalises *ascending young players* (thin/partial history reflects a rising
role, not injury — e.g. Penix, Skattebo, Daniels). Empirically, any guard that
lifts them costs games-MAE because the thin-history cohort genuinely under-plays on
average (a blunt "young ⇒ full 17 games" gate worsens games-MAE 3.59→4.74). The
chosen guard floors only players with <3 prior played seasons at 12 games
(`YOUNG_PLAYER_GAMES_FLOOR`): vets keep the full discount, young players aren't
read as injury risks. Cost: v14 availability budget −0.130 → **−0.042** (still well
below the +0.589 no-modeling baseline; avail MAE 2.986 → 2.356, −21%; bias −1.95 →
−0.46) — a deliberate accuracy-for-fairness trade on the young cohort.

| Mode | Avail MAE | Budget | Avail bias |
|------|-----------|--------|------------|
| none (raw rate) | 2.986 | +0.589 | −1.946 |
| history (unguarded) | 2.268 | −0.130 | −0.236 |
| **history + thin-history guard (production)** | **2.356** | **−0.042** | **−0.464** |

### Honest feature ablation of v31_depth_chart (#588) — rolling held-out, 2026-06-11

One signal group removed at a time from `v31_depth_chart` (retrained per fold);
paired player-clustered bootstrap vs the full model. Δ = MAE(ablated) − MAE(v31),
so **positive Δ ⇒ the feature is load-bearing**. Rolling 2023–2025,
min-train 2021, 1216 paired player-seasons / 617 clusters. The no-depth-chart
ablation is `v27_vegas_full_refit` (identical feature set).

| Feature group removed | Held-out ALL MAE | Δ | 95% CI | p | Verdict |
|---|---|---|---|---|---|
| regression_to_mean | 2.307 | **+0.075** | [+0.038, +0.111] | 0.0006 | **KEEP — load-bearing** |
| depth_chart (2 feats + 1 int ≡ v27) | 2.298 | **+0.066** | [+0.023, +0.110] | 0.0026 | **KEEP — load-bearing** |
| advanced receiving (4 feats + 3 int) | 2.255 | +0.023 | [−0.004, +0.050] | 0.093 | **KEEP — WR-load-bearing**: WR-only Δ **+0.072**, CI [+0.007, +0.137], p=0.031 |
| qb_backup_penalty | 2.253 | +0.021 | [−0.007, +0.047] | 0.13 | prune candidate (QB-only Δ +0.085 but CI [−0.115, +0.282], p=0.40) |
| vegas implied_team_total (+1 int) | 2.238 | +0.006 | [−0.014, +0.025] | 0.55 | prune candidate |
| age_curve | 2.229 | −0.003 | [−0.023, +0.017] | 0.76 | prune candidate |
| usage_share_raw (+3 int) | 2.231 | −0.001 | [−0.005, +0.004] | 0.78 | prune candidate |
| draft_capital_raw (+1 int) | 2.232 | −0.000 | [−0.030, +0.029] | 0.99 | prune candidate¹ |

¹ The held-out population is non-rookie qualifiers, so this says nothing about
draft capital's value in the **rookie fallback** path (`rookie-backtest`), which
is unaffected.

**Rank-quality lens (#598/Finding D):** no prune candidate is rescued by
ordering — every ablation's per-position Spearman ρ is within ±0.01 of the full
model (e.g. RB 0.784–0.791 vs v31 0.787), and the load-bearing features also
have the worst rank-quality losses when removed (TE ρ 0.760 → 0.743 without
regression_to_mean).

**Combined pruned candidate `v32_pruned`** (base + regression_to_mean +
advanced receiving + depth_chart; 13→8 features, 9→4 interactions — drops all
five prune candidates jointly): ALL MAE 2.252, Δ +0.020, CI [−0.027, +0.065],
p=0.40 (QB-only Δ −0.008, p=0.96) — statistically **no worse** than v31, with
~tied ordering (QB ρ +0.003, RB −0.001, WR −0.002, TE −0.010) but a worse WR
top-24 hit (0.333 → 0.250). **Decision: v31 stays active** — v32 is not a
significant win (the promotion gate) and slightly degrades the WR top tier; it
is kept in `model_config.py` as the documented leaner fallback. Practical
takeaways: (a) age_curve / usage_share / draft_capital / vegas / qb_backup_penalty
carry no measurable OOS weight inside v31 — don't defend them in future
experiments (#589 base tuning can ignore them); (b) regression_to_mean,
depth_chart, and advanced receiving are the features that earn the learned
stack its win; (c) the original #588 premise ("most features will be pruned as
worthless") was half-right — five of eight groups are deadweight, but the
remaining three are strongly load-bearing, so wholesale pruning is wrong.

### Base weighted_ppg tuning (#589) — honest inner-fold sweep, 2026-06-11

Grid search over recency weights × games-reliability exponent on the **inner
tuning folds** (2022–2024, GH #595 protocol; the extended
`sweep_recency_weights.py` scores the isolated `weighted_ppg_no_qb_trajectory`
base against next-season actuals, fetching data once for the whole grid).

- **Exponent: linear (1.0) confirmed optimal** — 1.25/1.5/2.0 are monotonically
  worse at *every* weight setting (e.g. current weights: 2.310 → 2.321 → 2.333
  → 2.355). v28's exponent-1.5 idea, judged on leaked data, is dead.
- **Recency weights: heavier on the most recent season wins.** Coarse + fine
  grids put the plateau at 0.65–0.70 recent-season weight. **[0.65, 0.20, 0.15]**
  chosen — best coarse-grid cell (2.2993 vs current 2.3101) and the only
  fine-grid leader that never loses an inner fold (2022 −0.008, 2023 −0.025,
  2024 +0.0003); [0.70, 0.15, 0.15] scored 2.2958 but trades a 2024 loss for a
  bigger 2023 win (grid-overfit risk).

Wired as `weighted_ppg_tuned_no_qb` + `v33_tuned_base` (v31 with the base
swapped, all else identical). **Iteration look** (rolling folds 2023–24,
confirmation window unburned): Δ −0.016, CI [−0.027, −0.004], p=0.007.
**Confirmation look** (one look, rolling 2023–25): ALL MAE **2.241** vs v31
2.252, Δ **−0.0113**, CI [−0.0221, −0.0006], **p=0.038 — significant**, bias
−0.130 vs −0.151. Per-position: RB −0.024, WR −0.031 MAE; QB +0.020, TE +0.007
(noise); rank quality equal-or-better everywhere except QB ρ −0.003 (WR top-24
hit 0.250→0.292, TE top-12 hit 0.500→0.583). **Clears the promotion gate**
(significant held-out win over the active model).

Caveat for future base work: the win is small and concentrated at RB/WR; the
isolated-base sweep still over-projects (bias −0.57 at the chosen cell) — the
learned intercept absorbs level, so isolated-base bias is not a gate. The
3-season window length and per-position weights were not swept (follow-ups).

### Coaching-change acquisition (#651, spike source #1) — NEGATIVE / TIE, 2026-06-14

The first *new-information* acquisition from the [data-acquisition spike](../exec-plans/data-acquisition-spike-651.md),
addressing the wave conclusion that v33 is at the achievable frontier on the
current feature set — the residual gap to FantasyPros is an **information gap**,
not a modeling gap. A new head coach changes scheme/pace/pass-rate (the classic
QB/WR breakout-or-bust driver a player's own stale PPG can't see), and hires
complete by Jan–Feb so the signal is leakage-free for the offseason run.

**Acquisition:** new `team_coaching` table (`scripts/backfill_team_coaching.py`),
derived purely from nflverse `games.csv` `home_coach`/`away_coach` — the season-
opening coach per (team, season), a `head_coach_changed` flag vs the prior
season, and `coach_tenure_years`. No allowlist change needed (GitHub-hosted, as
the spike predicted). **Feature:** `coaching_change_raw` (1.0 only for players on
a team that changed its opening HC, exactly 0.0 otherwise → residual-safe) +
`coach_tenure_raw`. **Model:** `v41_coaching_residual`, a two-stage residual on
`v33_tuned_base` (fit_intercept=False), so the ~90% of coach-stable player-
seasons get byte-identical v33 predictions (mirrors draft_capital #376).

**Result (rolling held-out 2023–2025, full window):** TIE — ALL MAE 2.2292 vs
v33's 2.2278 (Δ+0.0014, 95% CI [−0.0003, +0.0033], p=0.106, player-clustered
bootstrap over 617 players). The QB hypothesis — the spike's primary target,
since QB ordering is FP's single largest edge — is a **dead tie** (MAE 3.698 vs
3.697; Spearman ρ 0.670 vs 0.671; top-12 hit unchanged). The residual Ridge
chose α=100 (max of the grid), shrinking every coefficient to ≈0 (coaching_change
−0.03; *QB −0.09, *WR +0.11, *RB/*TE ≈0) and the LOSO residual MAE barely moved
across the alpha grid (2.0935→2.0924).

**Read:** exactly the outcome the spike anticipated — the coach-changed cohort is
small (~5–10 teams/season, so only a minority of player-seasons fire) and what
signal it carries is already proxied by the depth-chart / Vegas / usage features
v33 refits on. A new HC's *effect* shows up in those downstream signals (new
depth chart, shifted team total) faster than the binary "coach changed" flag can
add. Not promoted; v33 stays active. Per the spike's branch plan ("if #1 ties,
proceed to source #3"), the next acquisition is **FA/contract movement** — the
cheapest genuinely-new, non-market information, now unblocked by the
OverTheCap/Spotrac allowlist entries merged with the spike.

### Robust loss / Huber training (#645) — NEGATIVE, 2026-06-14

The second "objective, not features" probe, closing the axis after #643: swap
Ridge squared loss for a Huber loss so injury / role-collapse outlier seasons
pull the coefficients less. Three epsilon settings on v33's exact feature set
(only `regressor_spec` differs): 1.10 (most robust), 1.35 (sklearn default),
2.00 (≈squared loss, only >2σ residuals clipped).

**Result (iteration look, rolling 2023–24; confirmation window not burned):**
the only non-regressing variant is **e200**, which merely *ties* v33 — ALL MAE
2.225 vs 2.233, Δ −0.008, CI [−0.020, +0.005], p=0.23 (not significant), with
≈-tied rank quality (WR ρ 0.764 vs 0.762, QB 0.642 vs 0.638, TE 0.746 vs
0.748). The genuinely-robust settings **regress**: e135 +0.007, e110 +0.018.

**Why it fails (the useful finding):** the result is *monotone in the wrong
direction* — the closer Huber gets to squared loss (higher epsilon), the better
it does; the more it down-weights outliers, the worse. So squared loss is
already the right objective: the "outlier" seasons Huber discounts are real,
informative variance (a genuinely down year predicts a down year), not noise to
be robustified away. e200's −0.008 is the residual of a near-identical model,
not a robustness gain. Note e200 does de-bias nicely (−0.092 → −0.008) — if a
future model has a bias problem, a touch of Huber is a calibration lever, but
it is not an accuracy lever here.

This closes the training-objective axis: neither rank-aware weighting (#643,
significant regression) nor robust loss (#645, tie at best) beats Ridge squared
loss on the current features. Combined with #639/#640/#642, **v33_tuned_base is
confirmed at the achievable frontier** — see the wave conclusion in
[projection-accuracy-improvement.md](../exec-plans/projection-accuracy-improvement.md).
Same-data modeling is exhausted; the next lever is new early-offseason
information (spike #651).

### Rank-aware / relevance-weighted training (#643) — NEGATIVE, 2026-06-14

The "objective, not features" bet: weight the Ridge fit by each sample's
leakage-free prior-season relevance (base feature value) so capacity
concentrates on the rosterable tier whose *ordering* the projections feed,
directly attacking the FantasyPros ordering gap. Three schemes on v33's exact
feature set (only `sample_weight_spec` differs): `topn_step` k=1 (top-2N at
position weighted 2×), k=2 (3×), and `ppg_within_pos` (base_ppg / pos-season
mean, clipped). Co-primary gate: per-position Spearman ρ / top-N **and** MAE
non-inferiority.

**Result (iteration look, rolling 2023–24; confirmation window not burned):**
all three REGRESS. Best is `v39c_relevance_ppg`: ALL MAE 2.259 vs v33 2.233,
Δ **+0.026**, CI **[+0.005, +0.047]**, p=0.015 — a *significant regression*,
not a tie. And ranking quality, the entire point, **does not improve where it
matters**: WR ρ 0.758 vs v33 0.762, TE ρ 0.724–0.738 vs 0.748 (all worse).
The only positive is a trivial QB bump (ρ +0.009, top-12 hit 0.417→0.500) at
99 QB samples — unresolvable per the #640 lesson, and bought with worse MAE.

**Why it fails (the useful finding):** two compounding reasons. (1) The
bench/replacement-level samples aren't noise to discard — they *anchor the
regression slope* (the prior-PPG→next-PPG relationship is estimated across the
whole range); downweighting them biases the fit and costs MAE everywhere. (2)
Top-tier ordering is **signal-limited, not fit-capacity-limited** — the model
already orders the top as well as the features allow; reallocating loss weight
there adds no information. The corollary is the strategic headline: **the
FantasyPros ordering edge is an information gap, not an objective-function
gap.** FP has camp/beat-reporter/manual signal our feature set lacks; no loss
reweighting on the same features can close it.

This wave's four NEGATIVEs (#639 base tuning, #640 QB volume, #642 ecosystem,
#643 objective) now triangulate one conclusion: **on the current feature set,
v33_tuned_base sits at the achievable frontier for both MAE and ranking.**
Further gains require genuinely new *information* not derivable from
nflverse / depth charts / Vegas — which, given the no-market-inputs constraint
([[no-market-inputs-in-projections]]), is a data-acquisition question, not a
modeling one. (Update: #645 Huber loss subsequently ran — tie at best — and
#644 monotone GBM was closed not-pursued, both confirming this; see the #645
section above and the wave conclusion in the exec plan.)

### Pass-catcher ecosystem / "who is my QB?" (#642) — NEGATIVE, 2026-06-14

The role-change-shaped bet #640's postmortem pointed to: a WR/TE's projection
should depend on *who throws to them*. `v38_qb_ecosystem` added, WR/TE-only
from the opening-day depth chart, `team_qb_quality_raw` (the projected QB1's
centered prior weighted PPG) and `team_qb_changed_raw` (1 if the QB1 differs
from last season), as a full refit on v33's feature set. Built leakage-free:
QB1 identity from the target-season depth chart (set before games, like the
existing depth_chart feature), QB quality from seasons strictly prior.

**Result (iteration look, rolling 2023–24; confirmation window not burned):**
ALL Δ +0.001 (p=0.86, dead tie); WR Δ +0.010 (p=0.52), TE Δ −0.010 (p=0.37) —
both noise. TE rank ρ 0.747→0.751 (negligible). **Stopped on tie.**

**Why it's subsumed (the useful finding):** the QB-ecosystem signal is already
in the feature set twice over — `implied_team_total_raw` carries the offensive
environment (a good QB lifts the team total), and a WR/TE's own
`target_share_raw`/`wopr_raw` already reflect the quality of targets they get.
Adding QB identity on top is redundant. This is the *forward-looking* version
of the failed `team_context` (#391), built right — and it still doesn't help,
because the value it would add is already captured. Notably,
`team_qb_changed_raw` earns a large **in-sample** coefficient (~+5 PPG/WR-TE
in the full refit) that **completely fails to generalize** out-of-sample — a
clean, citable example of why the in-sample `accuracy-report` is not the gate.

Combined with #640, both QB-centric bets this wave are dead: stable QB
production is priced into PPG history (#640) and QB-ecosystem context is priced
into Vegas + own opportunity (#642). The remaining open axis is the *training
objective*, not new features — #643 (rank-aware/relevance-weighted training),
which attacks the ordering gap directly rather than adding subsumed signal.

### QB volume signal (#640) — NEGATIVE, 2026-06-12

The "genuinely new QB signal" the #592 postmortem asked for — pass/rush
volume composition — turns out to also be priced in. `v37_qb_volume` added
`qb_rush_volume_raw` and `qb_pass_volume_raw` (recency-weighted attempts per
game from `nfl_stats`, QB-only so the global coefficients are QB
coefficients) to v33's feature set as a full refit.

**Result (iteration look, rolling 2023–24; confirmation window not burned):**
ALL Δ +0.003 (p=0.83, dead tie); QB MAE 3.792 vs 3.820 (Δ −0.027 — right
direction, but CI [−0.245, +0.186] at 62 QB clusters); QB Spearman ρ
0.629→0.640. The in-sample fit assigns both features ≈0 coefficients.
Stopped on tie per the bounded-bet discipline — no rush-yards/attempt-share
variant fishing.

**Interpretation for future QB work:** weighted PPG history + depth-chart
tier + backup penalty already encode what stable volume levels add — a
Konami-code QB's rushing edge is *in his PPG*. What the stack cannot see is
*change*: a new starter's volume, a role redesign, a coordinator change.
With #592 (QB-specific fit) and #640 (volume levels) both dead, the
remaining QB hypotheses are about target-season role change, not history
composition — closest open bets are #642 (personnel identity) and #643
(rank-aware objective; QB top-12 ordering is where the FP gap is biggest).
The QB cluster count (~60–100 per look) also means only large effects
(≳0.2 MAE) are resolvable — micro-improvements at QB are untestable, so
don't spend looks on them.

### Per-position base tuning (#639) — NEGATIVE, 2026-06-12

The #589 follow-ups, swept honestly on the inner folds (2022–2024, exponent
fixed at 1.0 per #589) with the extended `sweep_recency_weights.py`
(`--per-position` fold-level rankings, `--windows` 2-/4-season vectors scored
on a fixed common qualifier population):

- **Per-position recency weights: the global tune is already right.** Picking
  with the #589 guardrail (never lose an inner fold to the tuned cell), QB and
  WR produced no dominating cell — QB's best-mean cell (the old prod default
  [0.55, 0.25, 0.20]) loses 2/3 folds; WR's 2-season cells are competitive but
  never dominate. Only RB ([0.70, 0.20, 0.10], −0.003) dominated, and that
  gain is noise out-of-sample (above). **Don't re-sweep per-position weights
  without new signal** — the position-decay hypothesis is answered: decay
  differences between positions are smaller than fold noise.
- **Window length: 3 seasons confirmed for QB/RB/WR.** 2-season windows lose
  decisively everywhere (recency weighting already down-weights old seasons
  smoothly; truncating loses information). **TE is the one open thread**: the
  4-season cell [0.60, 0.20, 0.12, 0.08] *never loses a fold* (1.4927 vs
  1.5006) — but adopting it requires plumbing `max_history` through
  runner/backtest/holdout (the pipeline fetches 3 seasons), so it was not
  wired into v35. Logged as the residual #639 follow-up; only worth the
  plumbing as part of a TE-focused experiment.
- **Per-position regression strength (v36): the global coefficient was
  already right.** Expressed as `regression_to_mean*position` (in a learned
  combiner a per-position factor ≡ a per-position coefficient); the 4 extra
  columns only added variance (ALL +0.021, QB ρ −0.015).

Both variants stopped on the iteration look (rolling 2023–24); the
confirmation window was not burned. `v33_tuned_base` stays active. Combined
with #589's exponent grid and #592, the base + global regression is now a
well-defended local optimum: further base tuning is not the path — new signal
(#640–#642) or a different objective (#643) is.

### QB-specific bounded bet (#592) — NEGATIVE, 2026-06-11

The re-framed #592 hypothesis: a dedicated QB fit can beat the global learned
model at QB (the largest additive-vs-learned gap, and `depth_chart×QB` the
largest learned interaction). Design: `v34_qb_residual` — the active
`v33_tuned_base` frozen as base + a tiny QB-only residual Ridge
(depth_chart_position_raw, qb_backup_penalty, implied_team_total_raw,
+ depth_chart^2; `training_filter={"positions": ["QB"]}`,
fit_intercept=False). `predict_residual` gates application by the same
filter, so **non-QB predictions are byte-identical to v33 by construction**
("neutral elsewhere" guaranteed, unit-tested). The positions filter +
predict-time gating are new, reusable residual-combiner capabilities.

**Result (iteration look, rolling 2023–24; confirmation window not burned):**
QB MAE 3.846 vs v33's 3.830 — Δ **+0.015**, CI [−0.016, +0.049], p=0.36.
ALL Δ +0.004 (p=0.48). The fitted residual coefficients are ≈0
(implied_team_total −0.001, qb_backup_penalty +0.01, depth_chart −0.08/+0.24
on ~100–150 QB training samples) — the residual finds nothing the global
model's QB interactions haven't already captured. Per the bounded-bet
discipline: **stopped on tie**, no feature-combo fishing, no confirmation
look spent. Don't re-try QB-specific separation without a genuinely new QB
signal (e.g. pass-volume/attempt-share features, which don't exist in the
stack today).

## Historical (in-sample) log — pre-audit, deltas not reliable

These rows predate the held-out harness; their `ALL MAE`/`R²` are in-sample for
the learned models (see the warning above). Kept to prevent re-trying failed
approaches, **not** as a ranking.

| Date | Model | Change | ALL MAE | ALL R² | ALL Bias | Verdict | PR |
|------|-------|--------|---------|--------|----------|---------|-----|
| 2026-01-15 | v2 | + age_curve | 2.584 | 0.499 | -0.120 | IMPROVEMENT | — |
| 2026-01-20 | v3 | + stat_efficiency (v1) | 2.950+ | degrades | — | REGRESSION | — |
| 2026-01-20 | v4 | + games_played | 2.950+ | degrades | — | REGRESSION | — |
| 2026-01-20 | v5 | + team_context (v1) | 3.290+ | degrades | — | REGRESSION | — |
| 2026-01-20 | v6 | + usage_share (v1) | 4.323+ | degrades | — | REGRESSION | — |
| 2026-02-01 | v8 | optimal sweep: base + age + regression | 2.530 | 0.522 | +0.075 | IMPROVEMENT | — |
| 2026-02-05 | v9 | per-position configs (confirmed uniform) | 2.530 | 0.522 | +0.075 | EQUIVALENT | — |
| 2026-02-10 | v10 | + stat_efficiency v2 (rate-based) | 2.535 | 0.520 | — | NEUTRAL | — |
| 2026-02-10 | v11 | + team_context v2 (K excl, pos scaling) | 2.535 | 0.520 | — | NEUTRAL | — |
| 2026-02-15 | v12 | disable QB/K snap trajectory | 2.525 | 0.526 | +0.103 | IMPROVEMENT | — |
| 2026-02-20 | v13 | + QB starter volume trend | 2.530 | — | — | REGRESSION | — |
| 2026-02-25 | v14 | v12 + backup QB penalty (15%) | 2.515 | 0.542 | +0.170 | IMPROVEMENT | — |
| 2026-03-01 | v15 | v2 + snap trend | 2.584 | 0.499 | — | NEUTRAL | — |
| 2026-03-01 | v16 | v14 + snap trend | 2.515 | 0.542 | — | NEUTRAL | — |
| 2026-03-05 | v17 | v14 + rookie growth curves | 2.516 | 0.541 | — | NEUTRAL | — |
| 2026-03-10 | v18 | v2 + usage_share v2 (level) | 2.584 | — | — | NEUTRAL | — |
| 2026-03-10 | v19 | v14 + usage_share v2 (level) | 2.510 | 0.545 | — | NEUTRAL | — |
| 2026-03-29 | v20 | Ridge regression + interactions | 2.412 | 0.577 | -0.026 | BEST | #370 |
| 2026-03-29 | v21 | v14 + tiered regression | 2.515 | 0.542 | — | NEUTRAL (bench bias improved) | #373 |
| 2026-05-05 | v22 | v20 + advanced receiving (target_share, air_yards_share, wopr, racr) for WR/TE; learned ridge with target_share*position, wopr*base_ppg, wopr^2 interactions | 2.380 | 0.572 | -0.167 | IMPROVEMENT (vs v20 all-seasons: −0.032 MAE; WR −0.151, TE −0.053. K regresses 1.228→1.287 from full-refit leakage.) | #375 |
| 2026-05-06 | v23 | v22 + draft_capital_raw (log overall pick, returns 0 after 3rd NFL season) with draft_capital_raw*position interaction; **full ridge refit** | 2.379 | 0.585 | -0.026 | NEUTRAL aggregate (ALL MAE essentially flat vs v22; R²/bias improve). LOSO CV regressed (v22 2.406 → v23 2.428) and full refit shifts unrelated coefficients (weighted_ppg 4.76→4.07, regression_to_mean 1.09→0.74) — vet predictions drift even though feature is 0 for vets. Motivated v25. | #376 |
| 2026-05-06 | v24 | v23 + per-feature standardization opt-out for draft_capital_raw | n/a | n/a | n/a | NULL RESULT (verified that scaler perturbation was not the source of v23 vet regression — coefficients essentially unchanged from v23) | (not shipped) |
| 2026-05-06 | v25 | Two-stage residual: v22 frozen as base + tiny ridge on draft_capital_raw + draft_capital_raw*position fit on (actual − v22_pred) for seasons_since_draft ≤ 3 only, fit_intercept=False (best α=100) | 2.370 | 0.575 | -0.191 | BEST (vs v22 all-seasons: −0.010 MAE; TE −0.014, WR −0.031. Vets receive byte-identical v22 predictions by construction — residual features all 0 → residual = 0.) | #376 fu |
| 2026-05-07 | v26 | Stacked residual on v25: tiny ridge on `implied_team_total_raw` (centered Vegas team-total vs season league mean) + `implied_team_total_raw*position` fit to v25 residuals across all players (no draft filter). Required nested-residual support in `predict_residual` and `train_ridge_residual`. Backfill via nflverse `games.csv` (PFR is now Cloudflare-walled). | 2.530 | 0.537 | -0.647 | NEUTRAL (vs current v25 backtest 2.551 / 0.534 / -0.627: −0.021 MAE, R² +0.003, bias unchanged). Coefficients tiny across the board (≤+0.005 PPG/pt) — Vegas signal is real but largely absorbed by v22's existing usage/receiving features once draft capital is in. Confirms Vegas-residual-on-residual is a mild win at best. | #378 |
| 2026-05-07 | v27 | Full Ridge refit: v22 features + draft_capital_raw + implied_team_total_raw with `implied_team_total_raw*position` interaction. Same risk profile as v23 (joint refit may drift unrelated coefficients). | 2.458 | 0.582 | -0.041 | BEST (vs v25 all-seasons: −0.093 MAE, R² +0.048, bias −0.627→−0.041 — six-fold reduction). Wins every position vs v25 (QB −0.084, RB −0.105, WR −0.171, K −0.117; TE flat). Position-conditional Vegas coefficients largest for WR (+0.20) and RB/QB (~+0.09), TE near zero. Unlike v23, no vet regression in the position breakdown — WR (vet-heavy) is the biggest winner — suggesting the joint refit is *finding* signal v25's frozen base couldn't. | #378 |
| 2026-06-08 | v28 | v22 with base feature swapped to `weighted_ppg_reliability_no_qb`: per-season games-played reliability factor uses exponent 1.5 instead of linear 1.0, so `(games/17)**1.5` down-weights low-games seasons more aggressively when blending the recency-weighted average. Full-season players are byte-identical (1.0**1.5 == 1.0). Learned ridge refit. | 2.533 | 0.584 | -0.373 | IMPROVEMENT (vs v22 all-seasons: −0.068 MAE, R² +0.051, bias −0.725→−0.373; beats active v25 on MAE 2.542→2.533, R² 0.566→0.584, RMSE 3.393→3.323. Wins every position vs v22: QB 3.789→3.741, RB 3.095→3.029, WR 2.585→2.449, TE 1.811→1.798. Addresses the concern that a recent 3-game season carries less signal than a prior 17-game season — e.g. 3g@6/17g@15 projection moves 12.48→13.74.) | #TBD |
| 2026-06-08 | v29 | v25's residual stack rebuilt on the reliability base: v28_reliability_weighting frozen as base + draft_capital_raw residual (seasons_since_draft ≤ 3, fit_intercept=False). | 2.521 | 0.586 | -0.469 | IMPROVEMENT over v25 (active): −0.022 MAE, R² +0.021. Reliability base lifts the active architecture, but still trails plain v27 (2.483). | #553 |
| 2026-06-08 | v30 | v27's full Ridge refit (advanced receiving + draft_capital + Vegas) with base feature swapped to `weighted_ppg_reliability_no_qb` (reliability exponent 1.5). | 2.507 | 0.590 | -0.376 | REGRESSION vs v27 (2.483→2.507). On the identical 601-player intersection: v27 2.486 vs v30 2.556. Folding the steeper small-sample down-weighting into the best model HURTS — v27 already proxies full-time role via usage/Vegas/draft features, so a distorted base removes signal. Confirms reliability helps thin-feature models only. | #553 |
| 2026-06-08 | v31 | Full Ridge refit on v27's feature set (usage + advanced receiving + draft_capital + Vegas) plus two opening-day depth-chart signals: `depth_chart_position_raw` (starter score 2 − depth_team) and `role_change_raw` (year-over-year depth-tier change), with a `depth_chart_position_raw*position` interaction. New `depth_charts` table backfilled from nflverse (`import_depth_charts`); pre-2025 per-slot `depth_team` and 2025+ snapshot `pos_rank` schemas both normalized to a 1/2/3 tier. Finally replaces the failed historical `team_context` feature with forward-looking role info. GH #391. | 2.439 | 0.620 | -0.356 | BEST (vs v27 all-seasons: −0.044 MAE, R² +0.020, RMSE 3.248→3.183). Wins exactly where role matters most: QB −0.126 MAE (R² 0.404→0.461) and RB −0.203 MAE (R² 0.427→0.494). WR flat (+0.013), TE slight regression (+0.108), K incidental −0.039. Largest learned interaction is `depth_chart_position_raw*QB` (+0.93 PPG/tier) — a starting QB is worth ~a full tier more than the model otherwise sees. Confirms the #391 hypothesis that depth-chart role is most impactful for QB. Not promoted (left to operator). | #554 |
| 2026-06-08 | v31 (retrain) | Same v31 feature set, expanded training data: backfilled `player_stats` 2018–2020 (history window for 2021) and added **2021 + 2025** as training seasons (`just train` default now `2021,2022,2023,2024,2025`). Training set 613 → 1203 samples. No model/feature change — pure data expansion. GH #380. | 2.358 | 0.645 | -0.155 | IMPROVEMENT (same 2022–2025 backtest, N=989: vs prior v31 −0.069 MAE, R² +0.021, RMSE 3.155→3.053, bias −0.438→−0.155). Promoted (remains active). | #TBD |
