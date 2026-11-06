# Own stability study: reliability, shrinkage and lag weights per stat

Date: 2026-11-06. Status: research complete. This doc sets the Stage A (Marcel-plus) parameters.
It closes the "own stability study" item in [00-synthesis.md](00-synthesis.md) §7.

Data: `nfl_weekly_stats`, `nfl_stats`, `nfl_team_volume`, `nfl_team_weekly_volume`, regular
season 2010–2025 (2026 is partial and excluded), QB/RB/WR/TE. Snapshotted to parquet on
2026-11-06 (104,888 weekly rows). Four parallel analyses; their full reports, scripts and CSVs
are local in `.cache/stat-proj-research/stability/` (not committed):

| Report | Question |
|---|---|
| `01-yoy.md` | Season-to-season persistence, filter bias, Marcel lag weights, team changers |
| `02-split-half.md` | Odd/even-week reliability, stabilization points, true-talent drift |
| `03-eb-pseudocounts.md` + `eb_params.csv` | Fitted EB pseudo-counts k, out-of-sample test, era stability |
| `04-team-and-shares.md` | Team-volume stability, share stability, team-changer carry-over |

## 1. Headline findings

1. **Volume is the stable layer, efficiency the noisy one, as the literature claims, now with our numbers.**
   Per-game pass attempts, carries and WR/TE targets: YoY r .76–.86, split-half reliability .88–.96.
   RB ypc, TD rates and EPA/play: YoY r .10–.24.
2. **Two independent methods agree on the pseudo-counts.** Split-half stabilization points and
   marginal-likelihood EB fits land within about 1.3x of each other for almost every rate (table §2).
   Interception rate is the exception: both say it needs a lot of shrinkage, but the size disagrees.
3. **Fitted k does not repeat v45's mistake.** At one season of QB volume, fitted k keeps
   50–75% of the player's own comp%, sack rate and EPA/dropback. Fully pooling to the mean
   is *worse than no shrinkage* for QB comp%, QB ypc and QB rush EPA. v45 failed because it pooled fully.
4. **Recency weights must differ by layer.** For volume and ppg, free OLS lag weights average
   .66/.23/.11; [.65,.20,.15] is out-of-sample best (rel. MSE .410 vs Marcel .428, last-year .444).
   For rates, weights flatten to .44/.32/.25 and Marcel 5/4/3 ties or beats ours (.856 vs .862).
5. **Year-to-year drift is real for volume.** Within-season reliability far exceeds YoY r, so true
   role volume drifts ~18–27%/yr for RB/WR/TE (QB attempts ~7–12%). The per-game volume k that
   is OOS-best is 2–8x the within-season k for that reason (see §3).
6. **Team volume barely persists; player shares do.** Team pass att/g YoY r .43, pass rate .41,
   neutral pass rate .42, but split-half .75–.79: real change, not noise. A new starting QB drops team
   pass-att/g YoY r from .59 to .08. Target share YoY: WR .70, TE .62, RB .49; carry share .60.
   Share change explains ~90%+ of per-game volume change; team volume only 11–17%.
7. **The team × share decomposition adds structure, not accuracy.** Share and per-game volume
   predict equally well (RB carries/g .62 and QB dropbacks/g .55 beat their shares). Keep the
   decomposition for coherence and scenarios (QB change), not for a point-accuracy win.
8. **Team changers: carry-over depends on position.** Slope of next share on prior share,
   changers vs stayers: WR .58 vs .71, TE .28 vs .63, RB targets .07 vs .52, RB carries .26 vs .65.
   "Vacated share at the new team" adds nothing (coef 0.00–0.07), but that measure ignores incoming players.

## 2. Pseudo-counts for Stage A

Shrinkage weight on the player's own rate = n / (n + k), n in the stated opportunity unit.
EB k = beta-binomial / normal-normal marginal-likelihood fit (`eb_params.csv`, `recommended`
rows); SH k = split-half stabilization point (reliability 0.5). "OOS gain" = MSE reduction vs
raw last-season rate, established players, 2021–2025 targets.

| Stat | Pos | Unit | Prior mean | EB k (90% CI) | SH k | OOS gain |
|---|---|---|---|---|---|---|
| comp_pct | QB | att | .625 | 170 (139–203) | ~180 | 12% |
| ypa | QB | att | 7.03 | 259 (225–302) | ~275 | 31% (OOS best 4x k) |
| pass_td_rate | QB | att | .043 | 494 (381–584) | ~380 | 34% (OOS best 2x k) |
| int_rate | QB | att | .025 | 845 (668–1275) | 1,500+ | 29% |
| sack_rate | QB | dropbacks | .067 | 176 (149–215) | ~235 | 21% |
| pass_epa_per_db | QB | dropbacks | .003 | 186 (149–213) | ~240 | 21% |
| ypc | RB | carries | 4.20 | 195 (173–265) | 150–215 | 37% |
| rush_td_rate | RB | carries | .029 | 434 (335–599) | 200–350 | 44% |
| catch_rate | RB / WR / TE | targets | .75 / .60 / .67 | 105 / 53 / 90 | 135–170 / 55–60 / ~80 | 36 / 22 / 28% |
| rec_td_rate | RB / WR / TE | targets | .028 / .047 / .055 | 193 / 266 / 204 | 150–280 | 37 / 43 / 37% |
| yds_per_target | RB / WR / TE | targets | 5.9 / 7.7 / 7.2 | 147 / 128 / 106 | — | 41 / 29 / 32% |
| adot | RB / WR / TE | targets | 0.7 / 11.0 / 7.0 | 14 / 15 / 19 | 14–20 | 21 / 12 / 21% |
| yac_per_rec | RB / WR / TE | receptions | 7.7 / 4.3 / 4.8 | 70 / 46 / 40 | ~42 (WR/TE) | 35 / 25 / 30% |
| rec_epa_per_target | RB / WR / TE | targets | .01 / .20 / .19 | 196 / 177 / 135 | — | 41 / 32 / 37% |
| fumbles_lost_per_touch | RB / WR / TE | touches | .006–.010 | unidentified | unidentified | use league mean |

Volume (normal-normal, k in games): within-season fits give k ≈ 0.5–2.2 games (e.g. WR
targets/g 0.9, RB rush att/g 0.7, QB ppg 1.5). Out of sample the best k is 2–8x larger because of
year-to-year drift. QB ppg's best k is about 6 games (prior weight .27 at 16 games). Gains are
modest: 5–20% single-season, 1–5% once three seasons are pooled. This matches v44's
k≈0.5 in season units.

Covariate prior mean: a volume-tier-dependent prior mean (not a flat position mean) helps QB comp%,
int rate, ypc, EPA and per-game volume, and is neutral elsewhere. Use it ("EB with covariates").

Era stability: k is stable within ~1.5x across 2010–15 / 2016–20 / 2021–25 except RB catch rate,
QB int rate, QB rush TD rate, fumbles, RB adot, WR YAC and QB ypc (>2x). Refit those inside each fold.

## 3. Stage A design decisions this settles

1. **Fit k per stat and position inside each fold** by beta-binomial (binary rates) or normal-normal
   with weekly per-play variance (continuous rates). Do not use gamma-Poisson for per-game volume. It
   is misspecified here: k ≈ 0.05–0.9 games, i.e. almost no shrinkage.
2. **Two recency schemes:** volume and ppg use [.65,.20,.15] (keep); rates use opportunity-weighted
   multi-season pooling with Marcel-like flat weights (~.45/.32/.23), then EB shrinkage on the pooled n.
3. **Volume k must include drift.** Either inflate the within-season k by a tuned multiplier (start 3x,
   tune 2–8x by inner CV) or model drift explicitly (local-level / AR(1) with innovation variance
   from the split-half vs YoY gap). The second is the principled one; the first is the Stage A shortcut.
4. **Effectively full pooling** (use position or covariate prior mean) for fumbles lost per touch; near-full
   for int rate and RB/WR TD rates at typical volumes. **Light shrinkage** for adot, WR catch rate
   and YAC/rec. **Partial** (prior weight .25–.5 at one season) for QB efficiency.
5. **Team changers:** scale the share carry-over by position (WR ~.8 of stayer slope, TE and RB
   carries ~.4, RB targets ~0), i.e. shrink a changer's share much harder toward the position-role
   mean. Starting-QB change is a strong signal for team pass volume; head-coach change is not yet in the data.
6. **Team volume:** project team pass att/g with heavy regression to league mean (YoY r ~.4), harder
   still on a starting-QB change. Don't use `neutral_plays_pg` (YoY r .05).

## 4. Caveats

- Minimum-volume filters raise YoY r by .13 on average (up to +.46 for rates); unfiltered QB comp%
  YoY is .07, recovered to .46 by opportunity weighting. The k fits use all players; the r tables
  quote the filtered versions.
- Split-half k for TD and EPA rates moves ±30% with the per-half minimum-opportunity threshold.
- EB treats a player's seasons as exchangeable, so the between-player variance includes drift; this is why
  fitted k < OOS-best k for volume. Bootstrap CIs use only 30 player-cluster reps.
- Changer labels use end-of-season team. RB-target and TE changer samples are small (n=52, 75).
- No route data (YPRR, TPRR) and no head-coach changes. `pass_epa_per_db` is EPA/dropbacks as a proxy.
- Multi-lag regressions are survivor-only (players with three prior seasons).
