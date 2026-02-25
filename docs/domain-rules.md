# Ottoneu Fantasy Football — League 309 Rules

League 309 is a **12-team Superflex Half PPR** league on [Ottoneu](https://ottoneu.com).

## Scoring (Half PPR)

| Stat | Points |
|------|--------|
| Passing yards | 0.04/yd (1 pt per 25 yds) |
| Passing TD | 4 |
| Interception | -2 |
| Rushing yards | 0.1/yd (1 pt per 10 yds) |
| Rushing TD | 6 |
| Receptions | 0.5 |
| Receiving yards | 0.1/yd (1 pt per 10 yds) |
| Receiving TD | 6 |
| FG 0-39 yds | 3 |
| FG 40-49 yds | 4 |
| FG 50+ yds | 5 |
| Extra point | 1 |

## Roster Format

- **20 roster spots** per team
- **Starting lineup:** 1 QB, 2 RB, 2 WR, 1 TE, 1 K, 1 Superflex (QB/RB/WR/TE)
- In superflex, it is almost always optimal to start a QB in the superflex slot, making **QBs significantly more valuable** than in standard formats
- IR/PUP/NFI players don't count against roster limits but do count against salary cap

## Salary Cap & Player Acquisition

- **$400 cap** per team
- **Auctions:** 24-hour blind Vickrey-style (winner pays second-highest bid + $1). Minimum bid is the player's current cap penalty or $1.
- **Waivers:** Cut players can be claimed within 24 hours at their full previous salary.
- **Cutting:** Incurs a cap penalty of half the player's salary (rounded up). Player cannot be reacquired by the same team for 30 days.

## Salary Increases & Arbitration

- **End of season:** +$4 for players who played at least 1 NFL game, +$1 for all others.
- **Arbitration (Feb 15 – Mar 31):** Each team has a $60 allocation budget distributed across other teams. Each team must give every other team $1–$8, and no single player can receive more than $4 from one team (max $44 league-wide per player).

## Season Structure

- Season ends after NFL week 16.
- Trade deadline: day before Thanksgiving. Trades can include cap space loans (expire end of regular season). Trades require 48-hour league approval; 7 of 12 managers must vote against to veto.

## Key Metrics

| Metric | Formula | Description |
|--------|---------|-------------|
| PPG | `total_points / games_played` | Points per game |
| PPS | `total_points / snaps` | Points per snap (efficiency) |
| VORP | `ppg - replacement_ppg` | Value Over Replacement Player at position |
| Surplus Value | `dollar_value - salary` | How much more a player is worth than they cost |
| Dollar Value | Derived from VORP | Converts VORP to a dollar amount based on total league cap |
