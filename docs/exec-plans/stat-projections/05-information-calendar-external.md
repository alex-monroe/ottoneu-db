# 05 - Information calendar for 2027 NFL stat projections (external research)

Written 2026-11-05. Status key: [V] = verified from a cited source this session; [T] = typical window inferred from prior years (not yet announced); [U] = unverified claim or weak evidence.
Honest limit up front: the web has very little rigorous, dated evidence on "how much does event X improve season-projection accuracy". Most value ratings below are reasoned from mechanism plus thin fantasy-media studies. Treat H/M/L as priors to be measured on our own backtests (replay each event date against 2022-2025 seasons using snapshots available as of that date).

## 1. Calendar, Nov 2026 -> Week 1 2027

| Date | Event | Status |
|---|---|---|
| Tue Nov 10, 2026, 4pm ET | 2026 NFL trade deadline (Tuesday after Week 9). NOT yet passed as of Nov 5. After it, no trades until the 2027 league year. Also ~Nov 17: deadline for unsigned franchise/transition players and certain tendered UFAs [1][2] | [V] |
| Nov 2026 - Jan 2027 | Rest of 2026 regular season; weekly injuries/IR. IR return requires a minimum of 4 games missed (rule detail [U]) | [V]/[U] |
| Dec 9, 2026 | Special League Meeting (virtual) [1] | [V] |
| Jan 9-10, 2027 | Week 18 (regular season ends) [1] | [V] |
| Mon Jan 11, 2027 | "Black Monday": head coach / coordinator firings cluster the day after Week 18; more firings, interviews and hires run through January/February (derived from [1]) | [T] |
| Jan 16-18 / 23-24 / 31, 2027 | Wild Card / Divisional / Conference Championships [1] | [V] |
| Late Jan 2027 | Senior Bowl (Mobile, AL) and East-West Shrine; exact 2027 dates not verified | [T] |
| Sun Feb 14, 2027 | Super Bowl LXI, SoFi Stadium [1] | [V] |
| ~Feb 14-20, 2027 | First 2027 season win totals post (2026 precedent: DraftKings posted Feb 18, 2026, days after the Super Bowl [3]). Best-ball ADP at Underdog/Drafters starts ~Feb 1 onward [4]; exact 2027 dates [U] | [V precedent] |
| Feb 17 - Mar 3, 2027 (4pm ET) | Franchise/transition tag window [1] | [V] |
| Mar 1-8, 2027 | NFL Scouting Combine, Indianapolis [1] | [V] |
| Mar 9 noon - Mar 11 3:59pm ET | Negotiating ("legal tampering") window; deals leak here [1] | [V] |
| Mar 11, 2027 4pm ET | New league year; free-agency signings, releases and trades official [1] | [V] |
| Mar 21-24, 2027 | Annual League Meeting (Phoenix) [1]; compensatory picks are historically announced at this meeting (timing [T]) | [V]/[T] |
| Apr 5 / Apr 19, 2027 | Offseason workouts begin (Apr 5 for clubs with new head coach, Apr 19 for others) [1]; OTAs (practice-style sessions) run late May-early June [T] | [V]/[T] |
| Apr 29 - May 1, 2027 | NFL Draft, Washington D.C. (National Mall) [1][5] | [V] |
| Apr 30 - ~May 5 | UDFA signings; rookie minicamps ~1-2 weeks after the draft | [T] |
| ~Mid May 2027 (2026: Thu May 14) | 2027 schedule release [6]; 2027 date not announced yet | [V precedent] |
| May 17, 2027 | Rookie Football Development Programs begin [1] | [V] |
| May 25-26, 2027 | Spring League Meeting [1] | [V] |
| ~Mid June 2027 | Mandatory minicamp (typically 3 days) | [T] |
| Mid-July 2027 | Franchise-tag extension deadline (2026: Jul 15 [1]); training camp: 2026 rookies reported as early as Jul 17, most vets Jul 28 [7] | [T from 2026] |
| ~Aug 5, 2027 | Hall of Fame Game (2026: Aug 6 [8]); preseason weeks ~Aug 12-14, 19-21, 26-28 | [T] |
| ~Tue Aug 31, 2027 | Cut to 53 (2026: Aug 30 [1]) | [T] |
| Thu Sep 9, 2027 | Week 1 kickoff, expected Thursday after Labor Day (Sep 6, 2027); 2026 kickoff is Sep 9 [1]. 2027 date derived, not announced | [T] |

## 2. Data and market availability

### nflverse (nflreadr / nflverse-data GitHub releases)
- Datasets: pbp, player_stats, team_stats, snap_counts (PFR), ff_opportunity, participation, ftn_charting, nextgen_stats, injuries, contracts (OverTheCap), depth_charts, rosters [9].
- Documented cadences (nflverse docs as relayed via search; may be a 2024 snapshot [U]): schedules/games every 5 minutes in season; snap counts at 00/06/12/18 UTC (depends on PFR); FTN charting same cadence (depends on FTN); PFR advanced stats daily 07:00 UTC; NGS player stats nightly ~3-5am ET [10]. The authoritative status table is at https://nflreadr.nflverse.com/articles/nflverse_data_schedule.html (the direct fetch failed; verify there).
- Participation data: no longer updated (data source gone) [10]. Do not plan on it for 2026/2027.
- Depth charts: source changed after the 2024 season; from 2025 each row has a `dt` load timestamp [11]. Weekly in-season day/time not documented on that page [U] - verify empirically from release assets.
- Contracts (OTC): irregular, spikes at FA and the draft; rosters and injuries update weekly in-season (job times not verified) [U].
- Offseason: stats/pbp pipelines go quiet after the Super Bowl; rosters, contracts, draft picks and depth charts update around FA and the draft.

### Markets
- Season win totals: first lines within days of the Super Bowl (DraftKings Feb 18, 2026 [3]); re-posted after FA, the draft and the schedule release (SI/theScore publish those snapshots [12][13]). 2026 openers were unusually tight (10 teams at 10.5) [3].
- Season-long player props (passing/receiving yards): a trickle beginning in spring/early summer (2021: June [14]); DraftKings early lines usually cover only a few QBs and RBs in the offseason, broader menus by July-August [14]. 2026 launch dates not confirmed [U]; our scraper should log first-seen dates.
- Week 1 lines and implied totals: lookahead lines post after the schedule release and become liquid in August; no full-season per-game lines exist (only week-by-week) [T/U].
- ADP: best-ball ADP begins ~Feb 1 onward after the Super Bowl [4][15]; redraft ADP volume ramps Jun-Aug; early ADP is noisier (few drafts) and moves on FA/draft/minicamp news [16]. Sleeper ADP start date: not found [U].
- Expert projections: consensus sets appear mid-May to July, full after camp [T].
- Depth-chart sources: team official charts mostly Tuesday in season and from preseason; Ourlads maintains continuous charts incl. offseason [T/U].
- Injury timelines: average ACL return ~10.9-12 months; post-ACL production drop ~40% by one PT-authored fantasy summary, RBs worst [17][U non-peer-reviewed]; a WR study found ACL players had careers ~1.9 seasons shorter [17]; in-season tears are more likely to return than preseason/offseason ones [17].

## 3. Evidence on value (quantified where available)

1. Prior vs fresh data (Harstad, 2015 data): correlation with rest-of-season fantasy output - ADP 0.548 overall, early-season results 0.659, expert projections 0.703, best blend 0.721. By position: RB early-season 0.644 vs ADP 0.309; TE 0.559 vs 0.295; WR roughly tied (0.632 vs 0.648); QB both weak (0.215 vs 0.260). Ceiling ~R^2 0.5 [18]. Blending beats either input but the gain over a good prior is small (0.703 -> 0.721). A later snippet reports ADP vs early results 0.65 vs 0.66 and 0.618 vs 0.614 in other samples [19][U snippet only].
2. ADP over time: no study found comparing March vs August ADP accuracy [U gap]. Qualitative: early ADP volatile; stabilizes as drafts accumulate Jun-Aug [16]. Auction values most reliable late Aug/early Sep [20][U]. One best-ball analysis found later drafts scored slightly better (single season) [21][U].
3. Draft capital for rookies: strongest for RB (high-moderate correlation of pick with usage/production over five drafts), weak for WR; better a measure of opportunity than talent [22]. RBs have ~30 top-24 rookie seasons per decade vs 16 for WR [22]. Claimed hit rates (QB 83%, RB 80%, WR 85%, TE 100%) have unclear definitions [U]. Adding college production/age improves on capital alone (FantasyPros claims Z-score 0.62) [22][U].
4. Team changes: top-36 WRs fell ~27% per game after switching teams in an older 4for4 study; higher-scoring RBs ~17% [23]. FTN (2010-2021): WRs 10.6 -> 10.7 PPG (flat), RBs 11.1 -> 10.3 (~-7%) [23]. Selection and regression to the mean confound these. No direct evidence on coaching-change effects found [U gap]; build an internal panel (play-caller change vs team pass rate/pace/RB share).
5. Win totals: mean absolute error vs actual wins ~2.2 games (1.7 vs Pythagorean wins) per numberFire [24]; Vegas roughly tied with ESPN/Athletic experts and only slightly better than a regression-to-mean baseline in a 2-season blog check [25][U small sample]. Preseason games reportedly contribute ~13% of a model's signal [26][U]. Use totals as team-level priors (points, pass rate), not player-level.
6. Final weeks vs full-season sample: no direct study found [U gap]. Harstad's results imply recent data matters most for RB/TE and least for WR/QB [18]. Backtest last-4/last-8 weighting ourselves.
7. Training-camp/beat-writer news: camp is the most ADP-volatile period [27], but no ROI study of camp risers exists in what I found; commentary is skeptical and notes preseason stat lines mislead (usage/personnel is more informative) [27][U]. Prior: low value except injury and starter-confirmation news.

## 4. Calendar table

| Date window | Event | Information gained | Component affected | Expected value to accuracy | Machine-readable source |
|---|---|---|---|---|---|
| Nov 2026 - Jan 10, 2027 | Rest of 2026 season (incl. injuries) | Final-season role/share, injuries, ACL return clocks, efficiency | Availability, share/role, efficiency | HIGH - base prior for 2027; late data matters most for RB/TE, less for WR/QB [18] | nflverse player_stats, snap_counts, injuries, depth_charts, ff_opportunity |
| Nov 10, 2026 | Trade deadline | Midseason team changes | Role, team volume | LOW-MED (few players) | nflverse rosters; league calendar [1] |
| Jan 11 - Feb 2027 | Coach firings/hires, coordinators, play-caller | Scheme, pace, pass rate, committee tendencies | Team volume, role | MED-HIGH (plausibly large for pass rate/pace; effect size undocumented [U]) | Manual/Wikipedia; no clean feed |
| Jan - Mar 2027 | Senior Bowl, Combine | Athletic testing, medicals | Rookie priors | LOW (WR/TE), MED (RB) [U] | nflverse combine/draft_picks |
| ~Feb 14-20, 2027 | First 2027 win totals | Market team-strength prior | Team volume (points, pass rate) | MED-HIGH team level; MAE ~2.2 wins [24] | Odds feeds/scrape (not in nflverse) |
| Feb 1+, 2027 | Best-ball ADP starts | Market player prior | Share/role (all) | MED; noisy early [16] | Underdog/Drafters public ADP |
| Feb 17 - Mar 3 | Franchise tags | Who stays/leaves | Role, team change | MED | OTC; nflverse contracts |
| Mar 9-11, 2027 | Legal tampering + free agency | New team/QB/OL; vacated targets/carries | Team volume, role, efficiency | HIGH (RB ~-7% to -17%, WR mixed [23]; QB moves dominate pass-game outcomes) | nflverse rosters, OTC |
| Mar 21-24 | Comp picks, owners meetings | Draft order refinements | Rookie priors | LOW | NFL.com |
| Apr 29 - May 1, 2027 | NFL Draft | Rookie capital + landing spot; vacated roles | Rookie priors, share/role | HIGH for RB rookies, MED for WR/TE/QB [22] | nflverse draft_picks |
| Apr 30 - ~May 5 | UDFA, rookie minicamp | Depth competition | Role | LOW-MED | Beat writers (text) |
| ~May 14, 2027 | Schedule release | Opponents, byes, Week 1 | Team volume (small), context | LOW-MED [U] | nflverse schedules |
| May - Jul | Season-long player props, expert projections | Market per-player yardage/TD priors | Volume + efficiency | MED-HIGH (market aggregate); sparse early [14] | Odds scrape |
| Late May - mid Jun | OTAs, mandatory minicamp | First-team reps, early injuries | Role, availability | LOW-MED; hype-prone [27] | Beat writers; Ourlads |
| Late Jul - Aug | Training camp | Starter battles, injuries | Role, availability | LOW-MED; injuries high, hype low [27] | Team charts; nflverse depth_charts |
| Aug 2027 | Preseason, peak ADP volume, Week 1 lines | Starter snaps, sharpest ADP | Role, availability | MED [16][20] | ADP sites, odds APIs |
| ~Aug 31 | Cut to 53 | Final rosters, IR starts | Availability, role | MED | nflverse rosters |
| Sep 9, 2027 onward | Weeks 1-4 | First 2027 usage; official depth charts | All | HIGH from Week 3-4 (early results beat ADP for RB/TE [18]) | nflverse pbp/player_stats |

## 5. Suggested update ladder
1. Now: publish v0 from 2026 data plus age curves and regression to the mean; label preliminary.
2. Re-run after: Week 18, coaching moves, win totals post, free agency (largest vet jump), the draft (largest rookie jump), schedule/props, minicamp, cutdown, then weekly.
3. Measure each step by replaying prior seasons with only the information available on that date. Historical snapshots of win totals, ADP and depth charts mostly do not exist in nflverse - start archiving now.

## Gaps (not found)
Dated ADP-accuracy studies (March vs August); coaching-change effect sizes; value of final N weeks; training-camp ROI; 2027-specific dates for minicamp, preseason, cutdown, Week 1, props launch; Sleeper ADP start.

## Sources
[1] NFL important dates 2026-27 (via Seahawks): https://www.seahawks.com/news/nfl-announces-important-dates-for-2026-2027
[2] 2026 trade deadline: https://www.chargers.com/news/2026-nfl-trade-deadline
[3] DraftKings opening 2026 win totals: https://dknetwork.draftkings.com/2026/02/18/opening-2026-nfl-win-totals-team-over-under/
[4] Rotoballer early best-ball ADP: https://rotoballer.com/early-adp-surprises-best-ball-2020-drafts/729672
[5] 2027 Draft: https://www.nbcsports.com/nfl/profootballtalk/rumor-mill/news/the-2027-nfl-draft-will-be-held-april-29-may-1-in-washington-d-c
[6] 2026 schedule release: https://www.nbcsports.com/nfl/profootballtalk/rumor-mill/news/schedule-release-is-coming-thursday-may-14
[7] 2026 training camps: https://www.nfl.com/news/2026-nfl-training-camps-report-dates-locations-announced-for-all-32-teams
[8] 2026 HOF Game: https://bleacherreport.com/articles/25402863-panthers-vs-cardinals-announced-hall-fame-game-2026-nfl-preseason-schedule
[9] nflreadr reference: https://nflreadr.nflverse.com/reference/index.html
[10] nflverse data schedule: https://rdrr.io/github/nflverse/nflreadr/f/vignettes/articles/nflverse_data_schedule.Rmd (via search snippet; fetch 404)
[11] Depth chart dictionary: https://nflreadr.nflverse.com/articles/dictionary_depth_charts.html
[12] SI post-draft totals: https://www.si.com/betting/2026-nfl-win-total-projections-following-draft-rams-ravens-among-highest-totals
[13] theScore post-schedule totals: https://www.thescore.com/news/3539185
[14] Season-long props: https://www.4for4.com/2021/preseason/connor-allens-season-long-player-prop-bets ; https://ftnfantasy.com/?p=146366
[15] FantasyPros best ball: https://www.fantasypros.com/2025/03/fantasy-football-mock-draft-best-ball-middle-pick
[16] RotoWire early vs draft-day ADP: https://www.rotowire.com/football/article/early-fantasy-football-adp-differs-from-draft-day-adp-119495
[17] ACL: https://dynastypt.substack.com/p/how-acl-tears-affect-performance ; https://pmc.ncbi.nlm.nih.gov/articles/PMC6204640
[18] Harstad, Bayes and Bob: https://www.footballguys.com/subscribers/apps/article.php?article=HarstadFiT3
[19] Harstad preseason expectations: https://www.footballguys.com/subscribers/apps/article.php?article=HarstadDiP5
[20] RotoWire auction values: https://www.rotowire.com/football/article/fantasy-football-auction-values-reliable-2026-season-123908
[21] Establish the Run: https://establishtherun.com/best-time-to-draft-best-ball/
[22] Draft capital: https://www.pff.com/news/fantasy-football-what-draft-capital-tells-us-about-rookies-in-fantasy-football ; https://www.nbcsports.com/fantasy/football/news/article-numbers-draft-capital-best-projecting-rookies ; https://www.fantasypros.com/2022/03/how-to-value-rookies-in-fantasy-football-pre-draft-2022
[23] Team changes: https://www.4for4.com/how-does-free-agency-impact-production ; https://fantasypoints.com/nfl/articles/season/2022/how-free-agents-fare-after-switching-teams ; https://ftnfantasy.com/?p=17362
[24] numberFire: https://m.numberfire.com/nfl/news/37309/nfl-betting-how-predictive-are-preseason-win-totals-and-super-bowl-odds
[25] Blogging the Boys: https://www.bloggingtheboys.com/2024/9/4/24235031/dallas-cowboys-2024-season-nfl-preseason-win-projections-mostly-worthless-vegas-odds-predictions
[26] Yahoo: https://au.sports.yahoo.com/want-to-beat-vegas-dont-ignore-nfl-preseason-results-175804061.html
[27] Camp ADP movement: https://www.fantasypros.com/2025/08/15-risers-fallers-fantasy-football ; https://www.rotoviz.com/2025/08/are-they-worth-the-hype-buying-or-selling-the-12-biggest-adp-risers-of-the-2025-preseason/
