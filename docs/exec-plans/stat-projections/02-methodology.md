# 02 - Methodology for multi-output season-level stat projection

Scope: general DS/statistical methodology for projecting season-level NFL stats (attempts, yards, TDs, INTs, carries, targets, receptions, games, kicker makes) and deriving fantasy points. Evidence tags: **[V]** = read/verified this session; **[M]** = from background knowledge, URL given but not re-fetched this session (treat as unverified detail); **[Opinion]** = my synthesis.

---
## 1. Lessons from mature sports projection systems

**Marcel [V]** (Tango, 2004; https://www.tangotiger.net/archives/stud0346.shtml). The "minimum-competence benchmark": 3 seasons weighted 5/4/3; regress to league mean by adding ~1200 PA of league-average performance (pitchers: 3/2/1 weights); playing time = 0.5*PA(t-1) + 0.1*PA(t-2) + 200; age adjustment (29 - age)*0.003 above 29, *0.006 below; rebaseline to league average. Lessons: (a) a fixed-recipe baseline is hard to beat by much, and every candidate model should be reported as a delta vs. a Marcel-style baseline; (b) *playing time is projected separately from rate*; (c) regression strength is expressed as "pseudo-sample size" of league-average — this is exactly the empirical-Bayes shrinkage form.

**Steamer / ZiPS / PECOTA / THE BAT / Davenport [M]**
- Steamer (FanGraphs library: https://library.fangraphs.com/steamer-projections/ — fetch redirected, not read): regression weights fit per-stat; component-level projections (K%, BB%, BABIP, HR/FB etc.) not raw ERA/AVG; separate playing-time. Key transferable idea: **fit a different regression-to-mean constant per stat** (estimated by reliability — stat stabilization points).
- ZiPS (Dan Szymborski): weighted 4 seasons, aging curves from comparable-player ("nearest neighbor") analysis, outputs a percentile distribution (10/25/50/75/90) not just a mean. https://www.fangraphs.com/ (articles) [M].
- PECOTA (Baseball Prospectus): similarity-score nearest neighbours -> empirical distribution of comparable players' careers; produces percentile bands. Transferable: **comparable-player cohorts give distributions for free** and capture aging/role-change heterogeneity (RB cliff).
- THE BAT (Derek Carty): Bayesian/ regression with explicit park/ weather/ opponent context; shows that context features matter at game level; at season level the gain is smaller.
- Davenport (Clay Davenport): translation/ equivalency of minor-league to MLB stats — analogue: college -> NFL rookie translation (draft capital as prior).
- General finding in baseball: ensembles (e.g., "Marcel + Steamer + ZiPS" averages) beat any single system; the system accuracy gaps are small (~1-3% RMSE) and the dominant source of error is irreducible noise. [M]

**Basketball [M]**: RAPTOR (FiveThirtyEight), DARKO (Kostya Medvedovsky; Kalman-filter-style daily talent estimates with Bayesian priors from age/ draft/ prior seasons), BPM/VORP (Basketball-Reference). DARKO is the clearest production example of **state-space latent talent + age-curve prior + per-stat reliability**: https://apanalytics.shinyapps.io/DARKO/ [M]. Lesson: model each box-score component's rate with its own noise/ persistence parameters, project minutes separately, then compose.

**Hockey [M]**: Evolving-Hockey / Dom Luszczyszyn's GSVA/Model: project shot-rate, shooting% (heavy regression), TOI separately; shooting% regresses ~hard. Same decomposition: volume (opportunity) persistent, efficiency (conversion) noisy.

**What transfers to football (17 games) [Opinion]**
1. Decompose into **opportunity (volume, role) vs. efficiency (rates)**; volume is far more persistent year-to-year than TD rate, INT rate, yards/carry. Regress efficiency hard, volume lightly.
2. Per-stat regression strength (reliability-based) rather than one global shrinkage. Football stabilizes slowly in games: TD rate and INT rate have near-zero year-to-year signal beyond position/team context; yards/target and catch rate moderately; targets/carries share is high.
3. Games played/availability is its own sub-model (football injury hazard is high; haircut by age/position/history).
4. Team context (offense total plays, pass rate, Vegas implied totals, QB change, OL, coaching) matters far more than in baseball because opportunities are zero-sum within a team.
5. Rookie priors by draft capital play the role of Davenport translations/ ZiPS comps.
6. Always include a Marcel-like baseline (e.g., weighted 3-year per-game rate with position pseudo-count shrinkage + age adj) in the evaluation harness.

---
## 2. Hierarchical Bayes, empirical Bayes, state-space, GPs

**Partial pooling / empirical Bayes.** Efron & Morris (1977) "Stein's Paradox in Statistics" (Scientific American) [M]; Gelman & Hill (2007) *Data Analysis Using Regression and Multilevel/Hierarchical Models* [M]; Gelman et al. *BDA3* (http://www.stat.columbia.edu/~gelman/book/) [M]. For rate stats the beta-binomial (catch rate, completion%, TD per attempt) or gamma-Poisson (counts) conjugate EB gives closed-form shrinkage: posterior mean = (x + a)/(n + a + b), where a+b is the pseudo-sample-size fitted by marginal-likelihood across players. David Robinson's *Introduction to Empirical Bayes* (http://varianceexplained.org/r/empirical_bayes_book/) [M] is a clean primer. Regression to the mean by reliability: shrink weight = n/(n + k) where k = (var_within / var_between) i.e., split-half/ ICC-based. **Estimate k per stat, per position, ideally conditional on covariates** (e.g., a regression-based prior mean rather than a league mean — "EB with covariates", then pooling is toward role/team-adjusted expectation, not grand mean).

**Multilevel structure for this data:** observation (player-season) nested in player nested in position; crossed with team-season (and QB/coach). Random effects: player intercept (latent talent), player-age slope or player-specific age curve deviations, team-season effect (offense environment), season effect (league-wide drift, rule changes). Weakly informative priors (half-normal/ half-student-t on SDs; Gelman 2006 "Prior distributions for variance parameters in hierarchical models") [M].

**State-space / Kalman.** Latent talent theta_{i,t} = theta_{i,t-1} + age_drift(age) + eps, observed y_{i,t} = f(theta) + noise whose variance scales with opportunity (games / attempts). Local-level or local-linear-trend model; the exponentially weighted history in Marcel is the steady-state Kalman filter of a local-level model — i.e., 5/4/3 weights are an approximation of Kalman gain. Practical form: AR(1)/random-walk-with-drift on player talent in PyMC/Stan, or `statsmodels.tsa.statespace` for per-stat univariate cases (poor fit with irregular panels). DARKO is the production example [M]. Football: 10–15 observations per career at best, so keep the state model simple (random walk + age mean function, estimate innovation SD per position/stat).

**Gaussian processes for aging.** Smooth, nonparametric position- and stat-specific age curves as GP over age (e.g., Matern-3/2) with player-level offsets: see Vehtari-style hierarchical GP age curves; baseball example: Bayesian aging curves via GP / "delta method" (Lichtman) [M]. At football scale use a HSGP (Hilbert-space GP approximation, Riutort-Mayol et al. 2020, arXiv:2004.11408) [M] or just B-splines/ penalized splines with hierarchical shrinkage across positions. Delta method + survivor-bias caveat: only players who keep playing are observed -> aging curves estimated from survivors are too flat (esp. RBs); model participation/ selection (games played / retirement as outcome) or include the exit as a censoring mechanism. [Opinion]

---
## 3. Joint modeling of the stat chain

**Structural/compositional chain [Opinion, with literature analogues]:**
team plays -> pass rate -> team pass attempts -> target share -> targets -> catch rate -> receptions -> yards/reception -> TD per target/ per yard. Rushing: team rush attempts x carry share -> yards/carry -> TD per carry. Passing: team pass attempts x QB share (usually ~1) -> completion%, yards/att, TD%, INT%, sack%. Model each link with its own likelihood and its own shrinkage; multiply through by simulation. Benefit: each link has an appropriate reliability and appropriate covariates; downstream errors become explicit. Cost: error compounding if links are mis-specified; in my experience direct modeling of totals can match or beat structural chains at point prediction, while structural wins for coherence, scenario analysis (QB change -> targets), and distributions. [Opinion; test both.]

**Likelihoods**
- Counts with exposure (targets, carries, attempts, receptions, TDs, INTs, FG made): Poisson / negative binomial with log(exposure) offset (games or team plays); NB for overdispersion (targets are overdispersed due to role changes). Zero-inflation needed for players with occasional roles (e.g., TE/RB3 TDs) — hurdle models; but with games and role modeled, plain NB often suffices.
- Conditional on a count n: receptions ~ Binomial(targets, catch_rate), completions ~ Binomial(attempts, comp%), FG made ~ Binomial(FGA, p) (with distance as covariate - kicker success is a function of distance; use logistic in distance + kicker random effect), with beta-binomial for overdispersion.
- Yards given receptions/carries: yards per event is heavy-tailed positive -> Gamma/ lognormal on season total ypc (season totals aggregate many plays; CLT makes yards/attempt near-normal for QBs but skewed for RBs/WRs with big plays). Consider Gamma-with-log-link GLM on yards with offset or Normal on yards/target with variance inversely proportional to n.
- Total fantasy points directly: Tweedie (compound Poisson-Gamma) has point mass at zero and a continuous positive part, which fits weekly fantasy points / yards with zeros (Jorgensen 1987; `statsmodels`/`sklearn` TweedieRegressor, LightGBM `objective='tweedie'`) [M]. For season-level stats among regulars, zero mass is mostly games-missed, which is better handled by the games model.
- Games played: Binomial(17, p_avail) or beta-binomial; or ordinal. Project per-game production and games separately, then multiply (this is what the existing repo does with `projected_games`).

**Multivariate / correlated outcomes**
- Stat correlations are strong and structural (targets <-> receptions <-> yards; attempts <-> yards). Chain structure captures most of it. Residual correlation across players on same team is negative for shares (zero-sum) and positive for volumes (offense quality).
- Multi-output methods: multivariate normal on transformed (log/ sqrt) per-game stats with LKJ prior on correlation (PyMC `LKJCholeskyCov`); copulas for non-Gaussian marginals (Gaussian copula fit on PIT residuals); multi-task NN/ GBM (shared representation) — evidence for gains on small data is weak [Opinion].
- For fantasy points, you don't need joint structure to get the mean (linear in stats), but you do for the variance (covariance of stats drives fantasy-point SD) and for TD-vs-yardage tradeoffs. Simulation from the joint posterior handles it.

**Team-level coherence**
- Share models: player shares within team via Dirichlet-multinomial / multinomial logit (softmax) over team's target pool: targets_i ~ Multinomial(team_targets, pi), pi = softmax(eta_i) with eta from player talent + role + age + depth-chart. Dirichlet-multinomial gives overdispersion. Ensures sum of players = team total by construction. A Latent-share/ "Plackett-Luce-style" alternative.
- Forecast reconciliation: Hyndman & Athanasopoulos *FPP3* ch.11 (https://otexts.com/fpp3/hierarchical.html) [M]; MinT: Wickramasuriya, Athanasopoulos & Hyndman (2019), JASA 114(526):804-819 [V via search; secondary sources only] — reconcile base forecasts at all levels (team total, player) by minimizing trace of reconciled error covariance: y_tilde = S (S' W^{-1} S)^{-1} S' W^{-1} y_hat. Practical for ~32 teams x ~10 players: use "shrink" covariance estimator (diagonal-ish, `mint_shrink`) given short samples; very short hierarchies are noted as problematic (Steinmeister & Pauly, arXiv:2409.18550) [V via search snippet]. Non-negative variant: Wickramasuriya, Turlach, Hyndman (Stat. Comput. 2020) [V snippet]. Python: `hierarchicalforecast` (Nixtla, https://github.com/Nixtla/hierarchicalforecast) [M]. Simpler alternative: proportional scaling (scale player projections so they sum to the team-level forecast, bottom-up with a team ceiling) — cheap, a strong baseline.
- Important caveat: the "other/ unmodeled" bucket (long-tail players, rookies, trades) must be an explicit node, else sums are forced into modeled players. [Opinion]

---
## 4. Probabilistic forecasting

- Predict the distribution: it matters for auction/keeper value because value is a *convex* function of production (replacement threshold, roster slots, injury/bust risk, weekly start/sit). Expected value of max(points - replacement, 0) > max(E[points] - replacement, 0) (Jensen), so uncertainty has option value for bench/keeper decisions; and for contract surplus the downside is capped by cut/ contract rules (Ottoneu salary cuts cost). [Opinion]
- Proper scoring: CRPS (Gneiting & Raftery 2007, "Strictly Proper Scoring Rules, Prediction, and Estimation", JASA 102:359-378, https://sites.stat.washington.edu/raftery/Research/PDF/Gneiting2007jasa.pdf) [M]; log score (sensitive to tails — penalizes overconfident Poisson); pinball/quantile loss for quantiles; interval score. Calibration: PIT histograms, reliability diagrams, coverage of 50/80/90% intervals (Gneiting, Balabdaoui, Raftery 2007 "Probabilistic forecasts, calibration and sharpness", JRSS-B) [M]. Maximize sharpness subject to calibration.
- Conformal prediction for distribution-free intervals around any point model (GBM): split/ CV+ / "conformalized quantile regression" (Romano, Patterson, Candes 2019, arXiv:1905.03222) [M]; MAPIE library. Needs exchangeability — rolling-origin with year shifts violates mildly; use recent-seasons calibration set; use position-specific, size-dependent (heteroscedastic) residual scales.
- Propagate to fantasy points: draw stats from the joint predictive (posterior predictive of chain), compute points via league scoring (Half-PPR, Superflex: passing TD 4? -- use league's actual scoring table), take percentiles. Never combine marginal stat quantiles linearly (ignores correlation). For marginal-only systems: Gaussian copula with empirical correlation.
- Evaluate points-level CRPS and stat-level CRPS/ log score; also evaluate downstream: value-over-replacement ranking and auction price error.
- Heteroscedasticity: variance depends on position, age, role certainty, rookie status, games history. Model scale parameter (distributional regression: `brms`-style sigma ~ ..., or LightGBM/NGBoost/ `lightgbmlss`, Quantile regression forests) [M].

---
## 5. GBM vs GLM vs Bayesian vs NN at this scale

- Grinsztajn, Oyallon, Varoquaux (NeurIPS 2022), https://arxiv.org/abs/2207.08815 [V via search]: on ~10K-row medium tabular data, tree ensembles still beat tuned deep nets; reasons: robustness to uninformative features, irregular targets, rotation non-invariance.
- TabPFN v2: Hollmann et al., Nature 637:319-326 (Jan 2025), "Accurate predictions on small data with a tabular foundation model" [V via search]: pretrained in-context transformer outperforms tuned GBDTs on datasets up to ~10K samples (classification and regression) with minutes of compute. Package `tabpfn` (https://github.com/PriorLabs/TabPFN) [M]; TabPFN-2.5 preprint arXiv:2511.08667 claims extension to larger data [V snippet only]. Caveats: i.i.d. assumption, no native panel/grouped structure, no native uncertainty beyond predictive quantiles (it does produce full predictive distributions for regression — [M]), license terms (non-commercial restrictions on some versions — check [unverified]). Our per-position, per-stat training sets are ~1-3K rows: squarely TabPFN's regime. Worth a cheap experiment as a challenger and as a stacking input.
- Gorishniy et al. 2021 "Revisiting Deep Learning Models for Tabular Data" (arXiv:2106.11959) [M] and McElfresh et al. 2023 "When do neural nets outperform boosted trees on tabular data?" (arXiv:2305.02997) [M]: GBDTs win on small, irregular datasets; differences among well-tuned methods often small; simple tuned linear/ GLM models are competitive when the signal is low and approximately additive.
- Signal-to-noise: season stats are low-SNR (year-over-year R^2 for TDs ~0.2-0.3). At low SNR, high-variance learners (deep GBMs) overfit; strong regularization, monotone constraints, and shrinkage toward simple structural baselines win. Expect gains from *structure and priors*, not from model class. [Opinion, consistent with baseball experience where Marcel is within a few % of top systems.]
- Practical ranking at this scale [Opinion]: (1) hierarchical GLM/ Bayesian with covariates (best calibrated, handles uncertainty, small-n players); (2) GBM (LightGBM) with strong regularization, monotone constraints, used on the *residual* of a structural/ EB baseline (boosting from a baseline = `init_score`/ offset), many-features interactions; (3) TabPFN as a challenger; (4) NNs last. Stacking EB-baseline + GBM residual is the common winner pattern.
- Ensemble: simple averaging of 2-4 diverse models (Bayesian + GBM + Marcel-like) is reliably beneficial (baseball: system consensus beats individual).
- Per-position separate models vs pooled with position effects: with ~100-300 players per position-season but 10+ years, pooled with position interactions and hierarchical shrinkage is usually better for thin positions (K, TE, QB) — test.

---
## 6. Validation design for panel time series

- **Rolling origin / forward chaining** (Hyndman FPP3 §5.10, https://otexts.com/fpp3/tscv.html [M]; Bergmeir & Benitez 2012; Cerqueira, Torgo, Mozetic 2020 "Evaluating time series forecasting models: an empirical study on performance estimation methods", Machine Learning 109 [M] — shows out-of-sample (rolling) estimation best for non-stationary series, K-fold can mislead). The repo's protocol (train <= t-1, predict t) matches. Keep the origin fixed per season; produce 10+ test seasons (e.g. 2014-2025) and report per-season results, not just pooled; **expanding window vs. sliding** is a hyperparameter to test (rule changes, passing era drift).
- **Leakage checklist:** (a) features computed using season t info (end-of-season depth chart, final-roster team, "recent_team" backfilled, full-year snaps, next-year ADP); (b) EB hyperparameters (pseudo-counts, priors) fit on all seasons — must be refit within each fold; (c) player-level target encoding using future seasons; (d) consensus/market projections timestamped after the draft; (e) rookie features set using post-season info; (f) hyperparameter tuning on the test seasons; (g) survivorship — evaluating only players who played in t (conditioning on outcome); evaluate players available at the projection time and handle zeros/ DNPs per the use case (also pass the "who did not play" case through the games model). (h) Duplicate-player identity across ids splitting history (noted in repo memory).
- **Forking paths / many experiments:** pre-register a primary metric and gating rule; hold a *final untouched season(s)* (the most recent complete season) that is scored once per release candidate-chain; use nested design: tune on seasons <= T-2 within the rolling loop, report on later; track the number of experiments and apply multiplicity control (Holm/ Benjamini-Hochberg across the pre-specified family) or a stricter threshold; "winner's curse": expected improvement of the best of K variants is overstated — shrink or confirm on fresh season. White's Reality Check / Hansen's SPA test for data-snooping across many models [M] (White 2000 Econometrica; Hansen 2005 JBES). Bailey & López de Prado "deflated Sharpe" idea is analogous (probability of backtest overfitting; Bailey et al. 2017, "The Probability of Backtest Overfitting") [M].
- **Significance testing:** player-clustered paired bootstrap (repo's choice) is right: resample players (clusters across seasons) and compute paired loss differences; also consider block structure by season (two-way clustering: players and seasons — cluster-robust Diebold–Mariano). Diebold-Mariano (1995) for loss differential [M]; Harvey-Leybourne-Newbold small-sample correction. Report effect size with CI, not only p; for position subgroup claims, treat as exploratory.
- **Ablations:** group features into blocks; drop-block and add-block ablations in rolling origin with the same seeds; report paired deltas with CI; guard against correlated features (permutation importance misleading — use group permutation/ ablation).
- **Bayesian model comparison:** PSIS-LOO (Vehtari, Gelman, Gabry 2017, https://arxiv.org/abs/1507.04544 [V]) is not appropriate for *forecast* comparison of time-structured data unless leave-future-out is used (Bürkner, Gabry, Vehtari 2020, "Approximate leave-future-out cross-validation for Bayesian time series models", arXiv:1902.06281 [M]). Use rolling-origin log score/ CRPS.
- Metrics: RMSE/MAE on points and on each stat; per-position; calibration; rank metrics (Spearman among top-N relevant to drafting); bias by projection bucket; value-over-replacement error. Avoid MAPE.

---
## 7. Python tooling trade-offs

| Tool | Use | Pros | Cons |
|---|---|---|---|
| PyMC (+ ArviZ) https://www.pymc.io | hierarchical / state-space / GP / LKJ models | most ergonomic Python API; NUTS; HSGP; posterior predictive simulation is natural; pm.sample_posterior_predictive | slower on large data; compile times; ~minutes per fit x 10+ rolling folds x positions x stats — need nutpie/ JAX backends (`pm.sample(nuts_sampler="nutpie")`) [M] |
| NumPyro (JAX) https://num.pyro.ai | same, faster | GPU/CPU JAX speed, vectorized folds with `vmap`, SVI fallback | steeper learning curve |
| Stan via cmdstanpy https://mc-stan.org/cmdstanpy | gold-standard NUTS, best diagnostics | Stan has the most mature hierarchical + GP ecosystem; reproducible; C++ speed; `brms` equivalent absent in Python | separate toolchain/compile; model code in Stan language; install friction on CI |
| bambi https://bambinos.github.io/bambi | formula-based multilevel GLMs over PyMC | fastest path to a v1 hierarchical NB/ Binomial/ Gamma model with random effects; family support incl. NB, Gamma, Beta-binomial-ish | limited for custom state-space/ structural chains; distributional (sigma) models supported but fiddly |
| statsmodels | GLMs (Poisson/NB/Gamma/Tweedie), MixedLM, state-space | quick frequentist baselines, offsets, robust SEs | MixedLM non-Gaussian limited (BinomialBayesMixedGLM is approximate) |
| LightGBM / XGBoost / CatBoost | non-linear GBM residual models | fast; Poisson/ gamma/ tweedie objectives; monotone constraints; `init_score` offsets for boosting from baseline; CatBoost has native ordered boosting good for small data and `MultiRMSE`/ uncertainty (virtual ensembles) [M] | point estimates; need quantile/ conformal/ NGBoost for distributions |
| scikit-learn | pipeline, `PoissonRegressor`, `GammaRegressor`, `TweedieRegressor`, HistGradientBoosting, `TimeSeriesSplit` (not panel-aware — write own rolling loop) | ubiquitous | no hierarchical |
| NGBoost / lightgbmlss / XGBoostLSS [M] | distributional boosting | direct predictive distributions | extra tuning; moderate maturity |
| TabPFN | challenger | strong small data; quantile output | not hierarchical; license; GPU preferred |
| MAPIE / crepes | conformal | model-agnostic intervals | exchangeability |
| hierarchicalforecast (Nixtla) | MinT, ERM reconciliation | ready implementations | designed for time series hierarchies; adapt |
| ArviZ / scoringrules (https://github.com/frazane/scoringrules) [M] / properscoring | CRPS & log score; PPC; LOO | | |

Run-time budgeting [Opinion]: rolling-origin Bayesian refits are expensive; use approximate inference (ADVI/ Pathfinder / Laplace) for iteration and full NUTS for final; or fit empirical-Bayes closed-form/ penalized-ML versions (fast) for the ~90% of experiments, and the full Bayesian only for finalists. Note the project's `.venv` is Python 3.12; PyMC/ NumPyro install OK there. Check wheel availability on sandbox.

---
## Recommended v1 stack [Opinion]

1. **Framing:** per player-season, project (a) games played, (b) per-game opportunity (team pass/ rush volume x shares; target share, carry share, attempts/game), (c) efficiency rates (catch rate, Y/T, Y/C, comp%, Y/A, TD rates, INT rate, FG%), then compose by Monte Carlo. Derive fantasy points via the league scoring formula.
2. **Baseline (Marcel-plus):** weighted last-3-seasons per-game (or per-opportunity) with *per-stat, per-position* pseudo-count shrinkage fit by marginal likelihood (empirical Bayes, refit each fold), age adjustment from position age curve, and rookie priors by draft round/pick. This is the benchmark every model must beat and the baseline for boosting.
3. **Core model:** hierarchical GLM(s) (bambi/PyMC or Stan): NB for counts with exposure offsets, Binomial/ beta-binomial for rates (with covariates: team, role, age, prior-year rate, Vegas, QB), Gamma/ Normal-on-transformed for yards-per-event; player random intercepts (+ optional random slope on age), team-season random effect, position hierarchy. Share structure via multinomial-logit on team pools or post-hoc reconciliation (proportional scaling first, MinT-shrink as a test).
4. **Residual GBM** (LightGBM, strong regularization, monotone constraints, `init_score` = hierarchical-model prediction) on a curated feature set; accept only if the rolling gate says paired-bootstrap-significant gain.
5. **Uncertainty:** posterior predictive draws -> joint stat simulation (correlation via the chain + residual copula) -> fantasy-point distribution; validate via PIT/ coverage and CRPS; conformal wrapper on GBM-only variants.
6. **Validation:** rolling-origin 2014-2025, expanding window, all fit steps (EB constants, priors, scalers) inside the fold; frozen primary metric (points-level RMSE + CRPS per position, with per-stat diagnostics); reserved latest season as a final holdout; pre-registered experiment list with Holm/BH correction across the family; ablate by feature block.
7. **Ensemble** the final: hierarchical core + GBM-residual + (optional) TabPFN; stack weights fit in rolling fashion.

## Ranked techniques to experiment with (expected value/ cost)

1. Per-stat, per-position empirical-Bayes shrinkage with covariate-informed prior mean (Marcel-plus) - cheap, high prior probability of large gain over naive rates.
2. Separate games-played/availability model (beta-binomial / logistic by position, age, history) multiplied by per-game projection.
3. Opportunity/efficiency decomposition: shrink efficiency hard (TD rate, INT rate to position/team mean), keep volume (targets/carries/attempts) lightly shrunk with role features.
4. Team-total coherence: proportional scaling to team pools, then multinomial-logit share model; compare to MinT-shrink.
5. LightGBM on residuals of the EB/GLM baseline (init_score) vs. LightGBM from scratch.
6. Hierarchical NB/Binomial/Gamma models in bambi/PyMC with player + team-season random effects and spline age curves.
7. Posterior-predictive simulation of fantasy points; CRPS/coverage evaluation; conformal on boosted point models.
8. TabPFN challenger per position/stat; include in ensemble if gain is significant.
9. Draft-capital rookie prior hierarchy (round, pick, college production, athletic) pooled with early-career vets.
10. Kalman/local-level talent state per stat (vs. fixed 3-year weights); GP/HSGP age curve; survivor-bias correction.
11. Copula/LKJ joint residual correlation for variance of fantasy points.
12. Comparable-player (PECOTA-style kNN) distributions as an additional ensemble member and for tail risk (RB cliffs).
13. Multi-task NNs - lowest priority.

## Sources
- [V] Tango, Marcel: https://www.tangotiger.net/archives/stud0346.shtml
- [V-search] Hollmann et al., TabPFN, Nature 2025: https://pubmed.ncbi.nlm.nih.gov/39780007/ ; TabPFN-2.5 preprint arXiv:2511.08667
- [V-search] Grinsztajn et al. 2022: https://arxiv.org/abs/2207.08815
- [V-search] Wickramasuriya, Athanasopoulos, Hyndman 2019 (MinT), JASA 114(526); Steinmeister & Pauly arXiv:2409.18550; Monash thesis https://bridges.monash.edu/articles/thesis/Optimal_forecasts_for_hierarchical_and_grouped_time_series/5032136
- [V-search] Vehtari, Gelman, Gabry 2017: https://arxiv.org/abs/1507.04544
- [M, unfetched] FanGraphs Steamer https://library.fangraphs.com/steamer-projections/ ; DARKO https://apanalytics.shinyapps.io/DARKO/ ; Gneiting & Raftery 2007 (URL above); Romano et al. arXiv:1905.03222; Riutort-Mayol et al. arXiv:2004.11408; Gorishniy arXiv:2106.11959; McElfresh arXiv:2305.02997; Bürkner et al. arXiv:1902.06281; FPP3 https://otexts.com/fpp3/ ; Robinson EB book http://varianceexplained.org/r/empirical_bayes_book/ ; Cerqueira et al. 2020 (Machine Learning 109); White 2000, Hansen 2005; Nixtla hierarchicalforecast; PyMC/bambi/cmdstanpy/NumPyro docs (URLs in table).
- Caveat: baseball/basketball/hockey system descriptions (ZiPS, PECOTA, THE BAT, RAPTOR, hockey models) are from background knowledge and were not re-verified this session; football-specific claims about reliability (TD rate near-zero persistence, etc.) are [Opinion] and should be checked against the repo's own data (year-over-year split-half correlations by stat).
