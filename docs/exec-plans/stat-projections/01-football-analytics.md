# Football-specific data science for season-level stat projection

Research date: 2026-11-05. Method: web search + page fetches. Every number below is tagged to its source. "[unverified]" means I found it only in a search snippet or secondary summary, or could not read the primary page. Most public work is blog-grade (4for4, Footballguys, Sumer, etc.), not peer reviewed. Treat coefficients as directional because sample windows, minimum-playing-time filters and per-game vs per-season definitions differ.

---------------------------------------------------------------------------
## 0. Executive summary (design implications)

1. **Team-down is the industry standard, and coherence comes from budgets.** Team plays -> pass rate -> dropbacks/attempts (via sack rate) -> target and carry shares -> per-opportunity efficiency -> TDs. Shares must sum to 100% (or to a position-group budget), so any shares-based model needs a normalisation or competition step. Summing independently projected players inflates the league (a FantasyPros-forum user found all 32 offenses "improved").
2. **Volume and role are the stable layer. Efficiency and TDs are the noisy layer and need heavy shrinkage.** Rough year-over-year (YoY) r: targets/game ~0.65-0.70, target share ~0.55-0.70, rush attempts/game (QB) 0.89, YPRR ~0.56-0.60+, catch rate ~0.47, yards/target ~0.22, WR/TE TD rate 0.11-0.19, QB INT rate 0.26, FG% ~0.05.
3. **Model TDs from opportunity, not past TD counts.** xTD (from field position, yardline, air yards) beats raw TDs for predicting next-year TDs, but only slightly in r-squared (0.283 vs 0.275 [unverified, snippet]). The big gain is that it is much stickier year to year. Practical: TD rate = league/position/role prior + shrunken individual deviation, driven by red-zone and goal-line opportunity counts.
4. **Aging should be position-by-stat.** Evidence suggests volume/role changes and "cliff" risk (mortality-table view) rather than smooth per-play decline. QB rushing and TD rate decline earliest. Avoid naive same-player year-pair averages because of survivorship bias, so use a delta method with a censoring correction, or model retirement and role loss explicitly.
5. **Games played is a separate, mostly low-signal model.** Use position and age baselines plus a mild injury-history effect. Never project 100% availability (Clay does not).
6. **Team/QB/coach changes are the main place where models break.** Treat as share-reallocation events with shrunken priors, wider uncertainty, and evidence from prior-year route/target data, not as a stat carry-over.

---------------------------------------------------------------------------
## 1. How serious public systems build stat-level projections

### 1.1 Mike Clay (ESPN)
- Process is explicitly "a lengthy process that involves statistical calculations and subjective inputs." For each team he reviews league, team, coach and player trends, then projects each player's dropback, carry and target shares (ESPN, "What I learned doing 2022 projections", partly paywalled). So: team totals first, shares second.
- Games: "I don't project any players to appear in 100% of regular-season games." Few players played all 17 games in 2021.
- Efficiency regression example: of 29 QBs since 2010 with YPA >= 8.2, 28 declined the next season; of 36 QBs with YPA <= 6.7, 28 improved. Clay uses this to adjust projections.
- ESPN's xFP (built on Clay's earlier PFF "opportunity-adjusted TD" work) "strip[s] away player talent and efficiency and focus[es] solely on opportunity." For QBs, attempts and rush attempts stay actual; expected completions, yards and INTs = attempts x rates tied to depth/location/target; pass and rush TDs use xTD; FORP = actual FP minus xFP. The article does not test next-season predictiveness of xFP, so I could not verify that.
- URLs: https://africa.espn.com/fantasy/football/insider/story/_/id/33621386/mike-clay-learned-doing-2022-fantasy-football-projections ; https://africa.espn.com/fantasy/football/story/_/id/46168860/2025-fantasy-football-expected-fantasy-points-xfp-qb ; Clay 2026 projection PDF https://g.espncdn.com/s/ffldraftkit/26/NFLDK2026_CS_ClayProjections2026.pdf (not read).

### 1.2 Draft Sharks "Anatomy of a projection" (a FantasyPros accuracy-award winner; clearest public walkthrough I could read)
1. Team offensive snaps: league recent average, adjusted for team history and coaching change (Browns example: 1,000 snaps).
2. Run/pass split: league pass rate adjusted for coach tendencies; sack rate on dropbacks converts pass plays to attempts.
3. Team carries and attempts split by projected carry and target shares, from past seasons, role changes (new/departed teammates) and comparable players.
4. Efficiency (QB: comp%, Y/A, pass-TD rate, INT rate, YPC, rush-TD rate. RB: YPC, rush-TD rate, catch rate, Y/rec, rec-TD rate. WR/TE: catch rate, Y/rec, rec-TD rate), each set relative to position league average, then adjusted for track record and OL.
5. TDs as per-carry / per-reception rates, not modeled separately. No explicit regression model or games-played adjustment is described (judgment-based).
- URL: https://draftsharks.com/article/the-anatomy-of-a-projection

### 1.3 Other systems (what I could and could not verify)
- **Ball Street Analytics "projection engine 2026"** (via search snippet only; the page 404'd on fetch) [unverified]: adds a position-group budget step (what % of team targets and carries goes to each position group) before individual shares, says player "when-active" rates cannot simply be summed, and normalises team outputs to the league total.
- **RotoViz**: sets team pass and rush attempts at percentiles and estimates each player's low/high share; ranges rather than points (via snippet) [unverified].
- **TeamRankings BetIQ**: uses market win totals as a major input to team projections (snippet; the methodology page returned 403). https://betiq.teamrankings.com/fantasy-football/strategy/fantasy-football-team-projections/
- **Football Outsiders KUBIAK**: modeled on PECOTA (comparable-player/similarity approach). I could not find a primary description of its weights. [unverified detail]. A similarity approach from TeamRankings uses 12 comparables for QB/TE and 18 for RB/WR, weighting the closest most heavily (snippet). https://betiq.teamrankings.com/fantasy-football/strategy/player-similarity-scores/
- **numberFire, PFF, 4for4, FTN, Sleeper, Establish The Run**: I could not retrieve primary methodology pages (numberFire redirects, PFF paywalled). Nothing here should be assumed about their internals. PFF's Scott Spratt describes a staged weekly process (not read).
- **Academic**: no definitive peer-reviewed NFL season-stat projection paper found. Closest relevant: srome's Bayesian hierarchical fantasy model (partial pooling by team x position, 2013-15 weekly data) https://srome.github.io/Bayesian-Hierarchical-Modeling-Applied-to-Fantasy-Football-Projections-for-Increased-Insight-and-Confidence ; Egidi & Gabry hierarchical models for fantasy football (soccer) as a method template https://www.research.unipd.it/retrieve/e14fb26a-5e0a-3de1-e053-1705fe0ac030/Egidi_Gabry_Short.pdf ; Sabin Paul hierarchical Bayes NFL player value (JQAS) https://econpapers.repec.org/RePEc:bpj:jqsprt:v:17:y:2021:i:4:p:313-364:n:4

### 1.4 Keeping team totals coherent (synthesis; mix of cited and my recommendation)
- Cited: shares multiply team totals (Draft Sharks); position-group budgets then player shares and league normalisation (Ball Street, unverified); changing one share forces changes to others (Footballguys forum, snippet).
- Recommendation for a statistical (non-judgment) model: 
  - Predict team plays and pass rate first from multi-year team/coach history, Vegas implied total, and win total. Use Vegas to set scoring level and pass/rush mix (trailing teams pass more).
  - Predict *raw* player share scores (e.g. via a softmax or Dirichlet-style allocation, or independent regressions then renormalise) so they sum to 1 per team within position group, including a "rest of roster/unknown" bucket for players you do not model.
  - Reconcile the sum of player yards/TDs against team totals (TD total ~ points scored expectation; yards ~ yards per play x plays) via a final proportional rescale. Check that league-wide totals match the long-run league mean (avoids the "everyone improves" bug).
  - Rookies, injuries and undrafted free agents mean the bucket must reserve share for unmodeled players.

---------------------------------------------------------------------------
## 2. Stat stability (year-over-year correlations)

Caveat: these are simple YoY r values from blog analyses, typically with min-target filters, and exclude players who changed role most violently. For a season-level projection prior, they tell you how much weight to put on last year versus the mean.

### 2.1 WR (4for4, "Most Predictable Wide Receiver Stats", 2017-2023, WRs with >=30 targets in consecutive seasons, rate stats only)
Slot rate 0.75; targets/game 0.70; FP/game 0.68; receptions/game 0.68; yards/game 0.67; aDOT 0.65; targets per route run 0.64; first downs/route 0.58; yards per route run (YPRR) 0.56; YAC/reception 0.48; yards/reception 0.42; broken+missed tackles/rec 0.39; on-target catch % 0.22; TD rate 0.19; EPA/target 0.18; drop rate 0.14; contested catch rate 0.02; route rate 0.01 (route rate is oddly low; likely a ceiling/selection artifact, an unexplained note I could not verify).
- https://www.4for4.com/node/173504
- An earlier 4for4 WR sample (2012-2022) via search snippet [unverified]: targets/game 0.66, target share 0.55, catch rate 0.47, yards/target 0.22, TD rate 0.12.

### 2.2 TE (4for4, same window and filter)
Yards/game 0.71; targets/game 0.68; receptions/game 0.67; FP/game 0.66; route rate 0.61; YPRR 0.60; aDOT 0.59; slot rate 0.56; targets per route run 0.50; yards/reception 0.52; on-target catch % 0.23; EPA/target 0.20; TD rate 0.11; drop rate 0.10; contested catch 0.05.
- https://www.4for4.com/2024/preseason/most-predictable-tight-end-stats

### 2.3 QB (4for4, 2018-2023)
Rush attempts/game 0.89; rush yards/game 0.86; time to throw 0.67; rush TDs/game 0.63; pass attempts/game 0.62; FP per dropback 0.60; pass yards/game 0.58; FP/game 0.54; EPA/dropback 0.50; completion % 0.48; aDOT 0.44; CPOE 0.42; pass TD rate 0.37; pressure-to-sack 0.33; yards/attempt 0.32; INT rate 0.26; turnover-worthy play rate 0.20.
Correlation of each with *next-season FP/game* in same article: FP per dropback 0.59, FP/game 0.54, rush att/game 0.47, rush TDs/game 0.40, pass TD rate 0.35, Y/A 0.28, CPOE 0.13, comp% 0.11, pass att/game -0.07, INT rate -0.25 (negative values are likely selection artifacts of the QB sample, so do not read them as causal).
- https://www.4for4.com/2024/preseason/most-predictable-quarterback-stats
- Sumer: EPA/attempt ~0.60 since 2021 (100+ snaps both years) https://sumersports.com/the-zone/sticky-football-stats-predictive-nfl-metrics/ ; CPOE R^2 ~0.226 YoY and Sumer's work on stabilising CPOE https://sumersports.com/the-zone/cutting-through-noise-to-increase-cpoe-stability/ (the R^2 value is from snippet) [unverified].

### 2.4 RB
- Primary SI/4for4 RB article only has the correlation table as an image, so I could not extract numbers. Text: per-game usage is the most reliable; TDs have almost no YoY correlation; efficiency (YPC, yards/touch) is a poor predictor. https://www.si.com/nfl/2018/08/06/fantasy-football-predictable-running-back-stats-todd-gurley-leveon-bell
- Sumer (since 2021, 100 snaps both years): RB tackled-for-loss % ~0.40; EPA per rush "virtually negligible."
- FantasyFootballers nflfastR autoregressive study (excludes players missing 7+ games, with <40 rec, and team-changers): stickiest WR stat is air yards; WR receptions coefficient ~0.5; receiving TDs least sticky; RB air yards and rush attempts stickiest; rush/rec TDs not sticky; QB INTs coefficient ~0 or slightly negative. Numbers are in charts only. https://www.thefantasyfootballers.com/articles/whats-sticky-statistics-you-can-rely-on-for-fantasy-football/

### 2.5 Kickers
- FG% YoY r = 0.05 (1999-2006, 10+ attempts both years, Quirky Research via snippet) and <1% of variance explained (4for4 2015). FG attempts correlate 0.73 with kicker FP/game vs 0.56 for FG% (4for4 2013-14, snippet). So: project FG attempts from team context (offense strength, red-zone stalling, fourth-down aggressiveness, game script) and use a near-league-average make rate with distance adjustment. [unverified for post-2020; kicker accuracy has risen over time, so use the recent league rate]. https://www.4for4.com/2015/preseason/daily-fantasy-playbook-2015-kicker-strategy ; https://conormclaughlin.net/2025/01/visualizing-nfl-kicker-accuracy-trends-1999-2024/

### 2.6 Team-level
- Team plays per game: best YoY carry-over among team volume metrics but still weak (~19% per a decade review, snippet) [unverified]. Neutral-situation pass rate is a better persistence measure than raw pass rate (game script is noisy); definitions of "neutral" vary (score within 3 or 7, or win-probability 20-80%). PFF league neutral pass rate: 59.0% (2023), 57.3% (2024), 57.4% (2025). https://www.pff.com/news/projecting-2026-fantasy-volume-through-neutral-situation-pass-rates
- Note on reading these r values: r of 0.6-0.7 implies ~40-50% of variance is persistent. The full regression-to-mean weight for a rate depends on the number of opportunities (n). A reliability-aware approach (empirical Bayes, shrink toward position/role mean with weight n/(n+k)) is more principled than a single YoY r. I did not find publicly published football split-half reliability or "stabilisation point" tables comparable to baseball's; if you want them, compute them yourself from PBP (odd/even-play split-half on 2010-2025). This is a gap in the public literature.

### Takeaway tiers (my synthesis)
- Tier A (stable, project with little shrinkage): QB rush attempts, QB pass attempts per game, target share/targets per game, aDOT, slot rate, rush attempts per game for established RBs.
- Tier B (moderate): YPRR, yards per target-ish, comp%, CPOE, sack rate, YAC/rec.
- Tier C (heavy regression to position/role mean): catch rate, yards/target, YPC, QB INT rate, Y/A (Clay's extreme-YPA example), all TD rates, FG%.

---------------------------------------------------------------------------
## 3. Opportunity vs efficiency; xFP; predictors

- **ffopportunity (ffverse)**: xgboost/tidymodels on nflverse PBP, trained 2006-2020; outputs expected fantasy points per play/player-game and an `ff_opportunity` dataset loadable via `nflreadr::load_ff_opportunity()` (python: `nflreadpy`). Authors Joe Sydlowski and Tan Ho. Vignette list shows an "Expected Rushing Yards" article; I could not read the model details. https://github.com/ffverse/ffopportunity ; https://ffopportunity.ffverse.com/articles/
- **Caution**: ffopportunity training stopped at 2020; the game has changed (more QB rushing, play-calling). Retrain on recent seasons if you use an xFP-style feature. Also xFP computed on realised plays still embeds game script and team context.
- **Expected TDs**: Fantasy Points' xTD (opportunity-based) predicted next-season TDs a touch better than raw TDs (r^2 0.283 vs 0.275) and was far stickier YoY (0.382 vs 0.276) [snippet; unverified]. PlayerProfiler: red-zone receiving TD YoY r ~0.11; red-zone target share ~3x as predictive (linear model on RZ target share and RZ receptions). Fantasy Points also argues red-zone counts are crude, and near-end-zone (inside the 10/5) opportunities are better. https://fantasypts.com/nfl/articles/2020/xtd-top-touchdown-regression-candidates ; https://www.playerprofiler.com/article/marvin-jones-advanced-stats-metrics-analytics-profile-2/
- **What predicts next season best (from the above)**: per-game opportunity (targets, carries, dropbacks), routes/role (route rate, slot rate, aDOT), then YPRR for receivers. EPA-based per-play stats are poorly sticky for RBs and for receivers (EPA/target 0.18). CPOE and accuracy metrics are moderately sticky for QBs but weakly predictive of next-year fantasy output (0.13).
- **YPRR dispute**: Sumer reports > 0.60 for WR/TE YPRR; 4for4 gets 0.56 (WR) and 0.60 (TE); an older Sharp Football Analysis piece described YPRR/catch rate/TD rate as having "almost no" carry-over (conflicting; likely a different sample). Public YPRR needs route data (PFF paywalled; FTN/NGS partial; nflverse participation data from 2016+ can give approximate routes). Note that YPRR, while stable, is partially mediated by role (slot, aDOT), which is why it correlates with itself.
- **Overhyped / use with care**: contested-catch rate, drop rate, "open score", EPA/target, and RB EPA/rush as predictive features (all ≤ 0.2 YoY or negligible). Red-zone *touchdown* counts. Any QB "efficiency" over one season.

---------------------------------------------------------------------------
## 4. Aging, rookies, draft capital, context changes

### 4.1 Aging curves (what exists)
- **Harstad mortality tables (Footballguys)**: "stable equilibrium prone to dramatic, sudden drops." Per-age probability of a catastrophic decline ("death rate"): RB 21: 3.3% -> 25: 9.3% -> 27: 15.4% -> 28: 19.8% -> 30: 32.9% -> 32: 54.5%. WR 25: 5.4% -> 28: 10.8% -> 30: 17.2% -> 32: 27.3% -> 34: 43.3%. Sample: top-50 retired fantasy RBs/WRs from 1985-2014; applies to second-contract-caliber players; underweights flameouts; pre-modern medicine. https://www.footballguys.com/article/HarstadDiP18?article=HarstadDiP18 ; https://footballguys.com/article/HarstadDiP17?article=HarstadDiP17
- **Football Perspective (RB, rushing yards delta)**: 723 RBs since 1970, 150+ carries in consecutive seasons, aged 21-32. Mean YoY change (yards): 23 +74, 24 -29, 25 +26, 26 -51, 27 -98, 28 -74, 29 -100, 30 -110, 31 -198, 32 -237. Smoothed peak age 26. Acknowledges survivorship bias (backs falling below 150 carries are excluded, so declines understated). https://www.footballperspective.com/a-closer-look-at-running-back-aging-patterns-part-ii/
- **Zimmerman / RotoWire QB delta method (2000-2015)**: QBs lose rushing almost immediately; TD rate declines from ~28, about two years before passing yards; completion % holds to ~30 then drops; Y/A flat then "drops like a rock after 30"; INT rate rises until ~34. Peak ~28-30 (inferred; not stated). Author flags survivor bias pushes apparent peak earlier and exaggerates decline. Charts are images so no numeric table available. https://www.rotowire.com/football/article/the-stats-room-at-what-age-do-qbs-decline-30084
- **Interpretation**: stat-specific (not points-only) age effects are directionally: QB rushing early, TD rate ~28+, Y/A and completions after 30; RB volume and YPC decline from mid-20s; WR is flatter until ~29-30 then drops. All numbers are older-era data; recheck with 2010+ nflverse data. The first-year pair "+" movements at 21-25 mix up rookies' role growth with talent.
- **Build recommendation**: fit age effects on *rates and shares* with player fixed/random effects (so the age curve is identified from within-player change) and a separate exit/role-loss hazard model (Harstad's idea) rather than putting both into the age curve.

### 4.2 Survivorship and selection (pitfalls)
- Delta-method on consecutive-season pairs conditions on a player appearing in both seasons -> survivors had lucky year N (Zimmerman) -> steep apparent declines and early apparent peaks. 
- Mortality tables built from retired top-N players condition on career success -> overstate longevity for marginal players (Harstad's own caveats).
- Minimum-volume filters (e.g. 150 carries, 30 targets, 40 receptions, exclude those missing 7+ games, exclude team changers) all select on the outcome and shrink the observed regression to the mean. If your model will be applied to *all* projected players, train on all players with an explicit playing-time/role model rather than filtering.
- Mitigation: model P(plays and meets role) jointly, use censoring-aware likelihoods, include players who fell out of the league as zeros, and evaluate on out-of-time holdouts with the same eligibility rules the projection will face.

### 4.3 Rookies and draft capital
- Draft capital is the dominant prior for rookie opportunity (Fantasy Life "draft capital remains king"; Elite Drafters uses draft capital + YPRR + breakout age; FantasyPros "draft capital creates the floor, efficiency creates the ceiling"). 4for4's 3-year rookie WR model uses only college production and draft capital. Harstad finds that once a score including production is built, draft position adds little incremental power. Links: https://elitedrafters.substack.com/p/predictive-rookie-receiver-metrics ; https://www.4for4.com/2022/preseason/forecasting-2022-nfl-rookie-wr-success-3-year-model ; https://www.footballguys.com/article/2023-dynasty-in-theory-85-rookie-receiver-model . All are claim-level summaries from snippets, so I could not check effect sizes.
- Comparable-player projection (PFF article "projecting rookie wide receiver fantasy performance with comparable players") is a viable alternative: weight by similarity in draft slot, age, college production, athletic profile. https://www.pff.com/news/fantasy-football-projecting-rookie-wide-receiver-fantasy-performance-with-comparable-players
- **Design idea**: hierarchical model where rookie priors for target share/carry share/snap share are regression-on-draft-pick (log pick or round), age, position, depth-chart competition (teammates' targets available, vacated targets), with wide variance. Second-year projections: partial pooling between prior-prior (rookie-year role) and draft prior; year-2 jump is partly role growth, which the share model should capture.

### 4.4 QB / coach / team changes
- 4for4 (2011+, 320 QB-seasons; new QB = primary passer by attempts, rookies split): same-QB teams' yardage moves within about +/-10%; new-QB teams show bigger swings, partly because they were weak before (regression to mean, not QB per se). Top-24 WR rate: same QB 14.5%, new veteran 11.3%, rookie QB 3.9%; top-12 TE: 12.8% / 10.7% / 6.6%; RB least affected (top-12 RB 10.4% / 7.7% / 8.0%). Descriptive, uncontrolled for team quality. https://www.4for4.com/2021/preseason/fantasy-implications-quarterback-change
- Footballguys: actual pass ratios are consistent YoY but expected ones are less so after coaching changes (snippet) [unverified]. Draft Sharks/others adjust snaps and pass rate for coaching change.
- I found no rigorous public study of target-share carry-over for players who change teams. This is a research gap and an opportunity to measure it yourself: regress next-year target share on prior-year target share x (stayed vs. moved) x (same QB vs. new QB) x (new HC) using nflverse rosters.
- Practical features: prior-year target share (re-based to the new team's available targets after removing departures/arrivals), team-level pass volume, QB change flag, OC/HC change flag, draft capital of the newcomers competing at the same position (they are the key share competitors), contract (OverTheCap) as a proxy for expected role.

---------------------------------------------------------------------------
## 5. Games played / availability

- Everything found is indirect. PFF: adjusted games lost has YoY r = 0.33 *at team level* since 2010 (snippet) [unverified]; Footballguys forum WR study: WRs who missed 1+ games in year N averaged 2.18 missed games two years later vs 1.51 for those who missed none (n = 30-100 per group; the gap flattened beyond a few missed games); most injuries are short (66% of cases 0-2 games, rotoworld-derived) [unverified]; TEs miss the fewest games; RBs 30+ average ~3 missed games; "injury-prone" largely a myth beyond a weak persistence effect. https://forums.footballguys.com/threads/do-past-injuries-predict-future-injuries.679678 ; https://pff.com/news/fantasy-football-projecting-injury-risk-and-games-missed-for-the-top-players-in-best-ball
- Design: model games *missed* (count, zero-inflated, with a heavy tail for season-ending injury) by position x age x prior-year missed games (log1p, shrunk) x role (QB vs RB workload). Output an *expected* games and a distribution. For per-game stat models, project *per-game rates while active* and multiply by expected games; but do not multiply a share-of-team rate by a games fraction twice (a share is already per team game). Also treat "partial-game" availability and being benched/inactive differently from injury absences, and mid-season trades.
- Per-game vs season totals: be careful that "when active" rates are conditionally biased upward (players who play 8 games and are injured prior to a bad stretch, players who play hurt, rest games for starters). Clay never projects 17/17.

---------------------------------------------------------------------------
## 6. Known pitfalls

1. **Leakage**: End-of-season rosters, final depth charts, realised team plays/pass rate, actual Vegas closing lines for the season being projected, post-hoc injury info, "team changed" flags derived from end-of-year data. Build features on a strict as-of-preseason (e.g. Sept 1 or earlier) timestamp. Contracts (OTC), draft capital and coach changes are knowable; the actual season's snap counts are not. Note the project's own memory that stats-coverage gaps in 2021-2023 distorted a past model; the same trap applies to stat-level models (missing player-seasons look like zeros).
2. **Regression to the mean confounded with age**: since high performers decline due to luck reversion, naive aging curves overstate aging. Use shrinkage priors before fitting age effects.
3. **Small samples / role change**: Players who change role mid-year (injury replacement turned starter) have a stat history that misrepresents their forward role. Use last-N-games weighting, snap-share or route-share, and role-change flags (injury to teammate) to avoid projecting last year's "when the starter was out" volume as the baseline. FTN notes QB switches can be confounded by a teammate's injury boosting targets.
4. **Selection by minimum volume** (see 4.2).
5. **Double counting**: using per-game rates multiplied by games and by share; or including both targets and receptions/yards that are mechanically linked without a coherent chain (targets -> catch rate -> yards/rec -> TD). Use a chain with identities (receptions <= targets; yards = receptions x Y/R).
6. **Era drift**: pass rate, QB rushing and kicker accuracy have changed; 2010-2025 pooled coefficients need season effects or recency weighting (neutral pass rate went 59.0% -> 57.3% -> 57.4% in 2023-2025).
7. **Overfitting to coarse data**: only ~6 seasons of tracking-style metrics (2017/2018+) exist; correlations among such features and next-year outcomes come from small samples.
8. **Evaluation**: judge each stat model on out-of-time holdouts versus naive baselines (last year's value; position mean; shrunk blend). Many fancy features fail to beat "last-year share shrunk to mean" for volume stats.

---------------------------------------------------------------------------
## 7. Data, code, and reading list

### Open data / code
- nflverse: https://nflverse.com ; nflreadr docs (R) https://nflreadr.nflverse.com ; Python `nflreadpy` https://github.com/nflverse/nflreadpy ; `nfl_data_py` is the older Python wrapper (not verified current).
- Loaders relevant to this project: `load_player_stats` (new summary_level argument; offense, defense, kicking in one file), `load_participation` (now includes time_to_throw, was_pressure), `load_nextgen_stats`, `load_ftn_charting` (FTN charting from 2022 onwards), `load_ff_opportunity`, `load_depth_charts`, `load_rosters`, `load_snap_counts`, `load_contracts` (OverTheCap). Verify current argument lists in the docs; the search results I got were for nflreadr 1.4.1 and release notes. https://www.rdocumentation.org/packages/nflreadr/versions/1.4.1
- nflfastR (PBP, EPA, WP, CPOE, xYAC) https://www.nflfastr.com ; ffopportunity https://github.com/ffverse/ffopportunity ; ffverse https://github.com/ffverse ; ffscrapr/ffpros.
- Python hierarchical modeling: PyMC (partial pooling tutorial) https://pymc3-testing.readthedocs.io/en/rtd-docs/notebooks/hierarchical_partial_pooling.html

### Further reading
- Sumer Sports sticky stats: https://sumersports.com/the-zone/sticky-football-stats-predictive-nfl-metrics/
- 4for4 "Most Predictable ..." series (QB/RB/WR/TE) at https://www.4for4.com (see URLs above; there are annual updates)
- Football Outsiders methodology (KUBIAK/DVOA) https://www.footballoutsiders.com (not retrieved)
- Sharp Football Analysis WR/TE stats that matter https://www.sharpfootballanalysis.com/fantasy/te-stats-that-matter-fantasy-football/
- RotoViz NFL pace/pass-rate projections https://rotoviz.com/2022/08/the-key-to-predicting-future-pass-rates-is-hiding-in-plain-sight-how-to-use-the-nfl-pace-app-to-find-high-powered-stacks
- Footballguys "Projecting pass ratios" https://www.footballguys.com/article/buzzard14_projecting_pass_ratios_part2
- FantasyPros kicker/volume and game-script items (4for4 kicker strategy URL above).

---------------------------------------------------------------------------
## 8. Gaps / things I could not verify

- Primary methodology for PFF, numberFire, FTN, 4for4, Sleeper, Establish The Run, KUBIAK weights: not obtained.
- Numeric RB YoY table (image-only), RB/WR/QB age curves for non-point stats (images-only).
- Published split-half reliability/sample-size stabilisation points for football stats: effectively absent publicly; compute from PBP.
- A quantitative player-level games-missed persistence correlation: not found.
- Rigorous target-share carry-over for team changers: not found.
- Whether xFP is more predictive than prior-year FP out-of-sample: not verified (ESPN does not report it in the article read).

## Sources (all URLs referenced)
- https://africa.espn.com/fantasy/football/insider/story/_/id/33621386/mike-clay-learned-doing-2022-fantasy-football-projections
- https://africa.espn.com/fantasy/football/story/_/id/46168860/2025-fantasy-football-expected-fantasy-points-xfp-qb
- https://g.espncdn.com/s/ffldraftkit/26/NFLDK2026_CS_ClayProjections2026.pdf
- https://draftsharks.com/article/the-anatomy-of-a-projection
- https://www.4for4.com/node/173504 (WR) ; https://www.4for4.com/2024/preseason/most-predictable-tight-end-stats ; https://www.4for4.com/2024/preseason/most-predictable-quarterback-stats
- https://www.4for4.com/2021/preseason/fantasy-implications-quarterback-change
- https://www.4for4.com/2015/preseason/daily-fantasy-playbook-2015-kicker-strategy
- https://www.si.com/nfl/2018/08/06/fantasy-football-predictable-running-back-stats-todd-gurley-leveon-bell
- https://sumersports.com/the-zone/sticky-football-stats-predictive-nfl-metrics/ ; https://sumersports.com/the-zone/cutting-through-noise-to-increase-cpoe-stability/
- https://www.thefantasyfootballers.com/articles/whats-sticky-statistics-you-can-rely-on-for-fantasy-football/
- https://github.com/ffverse/ffopportunity ; https://ffopportunity.ffverse.com/articles/
- https://fantasypts.com/nfl/articles/2020/xtd-top-touchdown-regression-candidates ; https://www.playerprofiler.com/article/marvin-jones-advanced-stats-metrics-analytics-profile-2/
- https://www.footballguys.com/article/HarstadDiP18?article=HarstadDiP18 ; https://footballguys.com/article/HarstadDiP17?article=HarstadDiP17
- https://www.footballperspective.com/a-closer-look-at-running-back-aging-patterns-part-ii/
- https://www.rotowire.com/football/article/the-stats-room-at-what-age-do-qbs-decline-30084
- https://elitedrafters.substack.com/p/predictive-rookie-receiver-metrics ; https://www.4for4.com/2022/preseason/forecasting-2022-nfl-rookie-wr-success-3-year-model ; https://www.footballguys.com/article/2023-dynasty-in-theory-85-rookie-receiver-model ; https://www.pff.com/news/fantasy-football-projecting-rookie-wide-receiver-fantasy-performance-with-comparable-players
- https://www.pff.com/news/projecting-2026-fantasy-volume-through-neutral-situation-pass-rates ; https://rotoviz.com/2022/08/the-key-to-predicting-future-pass-rates-is-hiding-in-plain-sight-how-to-use-the-nfl-pace-app-to-find-high-powered-stacks ; https://www.footballguys.com/article/buzzard14_projecting_pass_ratios_part2
- https://forums.footballguys.com/threads/do-past-injuries-predict-future-injuries.679678 ; https://pff.com/news/fantasy-football-projecting-injury-risk-and-games-missed-for-the-top-players-in-best-ball
- https://betiq.teamrankings.com/fantasy-football/strategy/player-similarity-scores/ ; https://betiq.teamrankings.com/fantasy-football/strategy/fantasy-football-team-projections/
- https://srome.github.io/Bayesian-Hierarchical-Modeling-Applied-to-Fantasy-Football-Projections-for-Increased-Insight-and-Confidence ; https://www.research.unipd.it/retrieve/e14fb26a-5e0a-3de1-e053-1705fe0ac030/Egidi_Gabry_Short.pdf ; https://econpapers.repec.org/RePEc:bpj:jqsprt:v:17:y:2021:i:4:p:313-364:n:4
- https://www.rdocumentation.org/packages/nflreadr/versions/1.4.1 ; https://conormclaughlin.net/2025/01/visualizing-nfl-kicker-accuracy-trends-1999-2024/
