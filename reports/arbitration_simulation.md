# Arbitration Simulation Analysis (2025)

**Simulation:** 100 Monte Carlo runs
**Value Variation:** ±20% per team

Each team independently allocates their arbitration budget to opponent players.
**Strategy:** Target high-surplus players to maximize disruption to opponents.

**Note:** In Ottoneu, teams can ONLY arbitrate opponents' players, not their own.

Results show expected arbitration raises from opponent targeting.

## My Roster (The Witchcraft) — Expected Arbitration Raises

### Top 2 Players by Expected Arbitration

| name            | position   |   price |   dollar_value |   surplus |   mean_arb |   std_arb |   salary_after_arb |   surplus_after_arb |
|:----------------|:-----------|--------:|---------------:|----------:|-----------:|----------:|-------------------:|--------------------:|
| Trevor Lawrence | QB         |      26 |           67.0 |      41.0 |       34.2 |       0.0 |               60.2 |                 6.8 |
| Kyle Pitts      | TE         |      11 |           24.0 |      13.0 |        0.5 |       0.0 |               11.5 |                12.5 |

**Total Expected Arbitration on My Roster:** $35

## Vulnerable Opponent Targets — Low Protection

These are high-value opponent players receiving low arbitration protection.
**Strategy:** Target these players to maximize disruption.

### Top 19 Vulnerable Targets

| name                | position   | nfl_team   | team_name                     |   price |   dollar_value |   surplus |   mean_arb |   std_arb |   surplus_after_arb |
|:--------------------|:-----------|:-----------|:------------------------------|--------:|---------------:|----------:|-----------:|----------:|--------------------:|
| Dallas Goedert      | TE         | PHI        | Tinseltown Little Gold Men    |       5 |           28.0 |      23.0 |        6.1 |       0.0 |                16.9 |
| Jason Myers         | K          | SEA        | The Royal Dynasty             |       7 |           28.0 |      21.0 |        8.5 |       0.0 |                12.5 |
| Chris Olave         | WR         | NO         | The Royal Dynasty             |      19 |           39.0 |      20.0 |        9.8 |       0.0 |                10.2 |
| Rico Dowdle         | RB         | CAR        | Tinseltown Little Gold Men    |       9 |           29.0 |      20.0 |        9.8 |       0.0 |                10.2 |
| Quinshon Judkins    | RB         | CLE        | The Trigeminal Thunderclaps   |       8 |           27.0 |      19.0 |        5.9 |       0.0 |                13.1 |
| Tyler Shough        | QB         | NO         | The Hard Eight                |       5 |           22.0 |      17.0 |        1.9 |       0.0 |                15.1 |
| Rhamondre Stevenson | RB         | NE         | Ball So Hard University       |       9 |           25.0 |      16.0 |        3.2 |       0.0 |                12.8 |
| Brandon Aubrey      | K          | DAL        | The Triple Helix              |       7 |           22.0 |      15.0 |        4.3 |       0.0 |                10.7 |
| Harold Fannin       | TE         | CLE        | The Triple Helix              |       7 |           21.0 |      14.0 |        1.3 |       0.0 |                12.7 |
| Aaron Rodgers       | QB         | PIT        | Ball So Hard University       |       7 |           20.0 |      13.0 |        1.6 |       0.0 |                11.4 |
| Trey McBride        | TE         | ARI        | The Golden Gouda              |      49 |           62.0 |      13.0 |        3.0 |       0.0 |                10.0 |
| James Cook          | RB         | BUF        | The Royal Dynasty             |      44 |           57.0 |      13.0 |        4.7 |       0.0 |                 8.3 |
| Jaylen Warren       | RB         | PIT        | Marin County Mountain Runners |      19 |           31.0 |      12.0 |        1.1 |       0.0 |                10.9 |
| D'Andre Swift       | RB         | CHI        | Irish Invasion                |      28 |           40.0 |      12.0 |        3.4 |       0.0 |                 8.6 |
| Jordan Love         | QB         | GB         | Pacific Punt Masters          |      26 |           38.0 |      12.0 |        3.4 |       0.0 |                 8.6 |
| Alec Pierce         | WR         | IND        | The Golden Gouda              |       7 |           17.0 |      10.0 |        1.0 |       0.0 |                 9.0 |
| J.K. Dobbins        | RB         | DEN        | Ball So Hard University       |      15 |           25.0 |      10.0 |        0.7 |       0.0 |                 9.3 |
| Cameron Dicker      | K          | LAC        | The Golden Gouda              |       5 |           13.0 |       8.0 |        5.0 |       0.0 |                 3.0 |
| Jaxon Smith-Njigba  | WR         | SEA        | Marin County Mountain Runners |      62 |           68.0 |       6.0 |        3.8 |       0.0 |                 2.2 |

## Heavily Protected Players — Avoid

These players are likely to receive heavy arbitration raises.
**Strategy:** Avoid targeting these players unless strategic.

### Top 12 Protected Players

| name             | position   | nfl_team   | team_name                     |   price |   dollar_value |   surplus |   mean_arb |   pct_protected |   salary_after_arb |
|:-----------------|:-----------|:-----------|:------------------------------|--------:|---------------:|----------:|-----------:|----------------:|-------------------:|
| Matthew Stafford | QB         | LA         | Irish Invasion                |      13 |           75.0 |      62.0 |       44.0 |             1.0 |               57.0 |
| Javonte Williams | RB         | DAL        | Marin County Mountain Runners |      11 |           48.0 |      37.0 |       32.8 |             0.0 |               43.8 |
| Tucker Kraft     | TE         | GB         | The Hard Eight                |       8 |           46.0 |      38.0 |       31.7 |             0.0 |               39.7 |
| Rashee Rice      | WR         | KC         | Ball So Hard University       |      14 |           53.0 |      39.0 |       29.7 |             0.0 |               43.7 |
| Daniel Jones     | QB         | IND        | Ball So Hard University       |       6 |           44.0 |      38.0 |       28.9 |             0.0 |               34.9 |
| Travis Etienne   | RB         | JAC        | The Trigeminal Thunderclaps   |      14 |           47.0 |      33.0 |       26.6 |             0.0 |               40.6 |
| Caleb Williams   | QB         | CHI        | The Triple Helix              |      21 |           54.0 |      33.0 |       25.9 |             0.0 |               46.9 |
| Jacoby Brissett  | QB         | ARI        | The Roseman Empire            |       5 |           35.0 |      30.0 |       25.8 |             0.0 |               30.8 |
| Drake Maye       | QB         | NE         | Tinseltown Little Gold Men    |      30 |           62.0 |      32.0 |       25.4 |             0.0 |               55.4 |
| Cam Skattebo     | RB         | NYG        | Tinseltown Little Gold Men    |      15 |           51.0 |      36.0 |       24.7 |             0.0 |               39.7 |
| Ka'imi Fairbairn | K          | HOU        | The Hard Eight                |       7 |           37.0 |      30.0 |       22.5 |             0.0 |               29.5 |
| Jonathan Taylor  | RB         | IND        | The Roseman Empire            |      61 |           92.0 |      31.0 |       22.0 |             0.0 |               83.0 |

## Strategic Recommendations by Opponent Team

### Ball So Hard University

**Vulnerable targets (3):**

| name                | position   |   price |   surplus |   mean_arb |   surplus_after_arb |
|:--------------------|:-----------|--------:|----------:|-----------:|--------------------:|
| Rhamondre Stevenson | RB         |       9 |      16.0 |        3.2 |                12.8 |
| Aaron Rodgers       | QB         |       7 |      13.0 |        1.6 |                11.4 |
| J.K. Dobbins        | RB         |      15 |      10.0 |        0.7 |                 9.3 |

**Protected players (2) — avoid:**

| name         | position   |   price |   mean_arb |   salary_after_arb |
|:-------------|:-----------|--------:|-----------:|-------------------:|
| Rashee Rice  | WR         |      14 |       29.7 |               43.7 |
| Daniel Jones | QB         |       6 |       28.9 |               34.9 |

**Suggested allocation to Ball So Hard University:** $7

### Irish Invasion

**Vulnerable targets (1):**

| name          | position   |   price |   surplus |   mean_arb |   surplus_after_arb |
|:--------------|:-----------|--------:|----------:|-----------:|--------------------:|
| D'Andre Swift | RB         |      28 |      12.0 |        3.4 |                 8.6 |

**Protected players (1) — avoid:**

| name             | position   |   price |   mean_arb |   salary_after_arb |
|:-----------------|:-----------|--------:|-----------:|-------------------:|
| Matthew Stafford | QB         |      13 |       44.0 |               57.0 |

**Suggested allocation to Irish Invasion:** $3

### Marin County Mountain Runners

**Vulnerable targets (3):**

| name               | position   |   price |   surplus |   mean_arb |   surplus_after_arb |
|:-------------------|:-----------|--------:|----------:|-----------:|--------------------:|
| Dak Prescott       | QB         |      30 |      21.0 |       13.0 |                 8.0 |
| Jaylen Warren      | RB         |      19 |      12.0 |        1.1 |                10.9 |
| Jaxon Smith-Njigba | WR         |      62 |       6.0 |        3.8 |                 2.2 |

**Protected players (1) — avoid:**

| name             | position   |   price |   mean_arb |   salary_after_arb |
|:-----------------|:-----------|--------:|-----------:|-------------------:|
| Javonte Williams | RB         |      11 |       32.8 |               43.8 |

**Suggested allocation to Marin County Mountain Runners:** $7

### Pacific Punt Masters

**Vulnerable targets (2):**

| name           | position   |   price |   surplus |   mean_arb |   surplus_after_arb |
|:---------------|:-----------|--------:|----------:|-----------:|--------------------:|
| George Pickens | WR         |      22 |      23.0 |       12.4 |                10.6 |
| Jordan Love    | QB         |      26 |      12.0 |        3.4 |                 8.6 |

**Suggested allocation to Pacific Punt Masters:** $5

### The Golden Gouda

**Vulnerable targets (3):**

| name           | position   |   price |   surplus |   mean_arb |   surplus_after_arb |
|:---------------|:-----------|--------:|----------:|-----------:|--------------------:|
| Trey McBride   | TE         |      49 |      13.0 |        3.0 |                10.0 |
| Alec Pierce    | WR         |       7 |      10.0 |        1.0 |                 9.0 |
| Cameron Dicker | K          |       5 |       8.0 |        5.0 |                 3.0 |

**Suggested allocation to The Golden Gouda:** $7

### The Hard Eight

**Vulnerable targets (2):**

| name         | position   |   price |   surplus |   mean_arb |   surplus_after_arb |
|:-------------|:-----------|--------:|----------:|-----------:|--------------------:|
| Brock Purdy  | QB         |      44 |      21.0 |       11.2 |                 9.8 |
| Tyler Shough | QB         |       5 |      17.0 |        1.9 |                15.1 |

**Protected players (2) — avoid:**

| name             | position   |   price |   mean_arb |   salary_after_arb |
|:-----------------|:-----------|--------:|-----------:|-------------------:|
| Tucker Kraft     | TE         |       8 |       31.7 |               39.7 |
| Ka'imi Fairbairn | K          |       7 |       22.5 |               29.5 |

**Suggested allocation to The Hard Eight:** $5

### The Roseman Empire

**Vulnerable targets (1):**

| name                | position   |   price |   surplus |   mean_arb |   surplus_after_arb |
|:--------------------|:-----------|--------:|----------:|-----------:|--------------------:|
| Christian McCaffrey | RB         |      77 |      22.0 |       10.4 |                11.6 |

**Protected players (2) — avoid:**

| name            | position   |   price |   mean_arb |   salary_after_arb |
|:----------------|:-----------|--------:|-----------:|-------------------:|
| Jacoby Brissett | QB         |       5 |       25.8 |               30.8 |
| Jonathan Taylor | RB         |      61 |       22.0 |               83.0 |

**Suggested allocation to The Roseman Empire:** $3

### The Royal Dynasty

**Vulnerable targets (4):**

| name          | position   |   price |   surplus |   mean_arb |   surplus_after_arb |
|:--------------|:-----------|--------:|----------:|-----------:|--------------------:|
| De'Von Achane | RB         |      55 |      23.0 |       13.2 |                 9.8 |
| Jason Myers   | K          |       7 |      21.0 |        8.5 |                12.5 |
| Chris Olave   | WR         |      19 |      20.0 |        9.8 |                10.2 |

**Suggested allocation to The Royal Dynasty:** $8

### The Trigeminal Thunderclaps

**Vulnerable targets (1):**

| name             | position   |   price |   surplus |   mean_arb |   surplus_after_arb |
|:-----------------|:-----------|--------:|----------:|-----------:|--------------------:|
| Quinshon Judkins | RB         |       8 |      19.0 |        5.9 |                13.1 |

**Protected players (2) — avoid:**

| name           | position   |   price |   mean_arb |   salary_after_arb |
|:---------------|:-----------|--------:|-----------:|-------------------:|
| Travis Etienne | RB         |      14 |       26.6 |               40.6 |
| Jaxson Dart    | QB         |      13 |       15.6 |               28.6 |

**Suggested allocation to The Trigeminal Thunderclaps:** $3

### The Triple Helix

**Vulnerable targets (2):**

| name           | position   |   price |   surplus |   mean_arb |   surplus_after_arb |
|:---------------|:-----------|--------:|----------:|-----------:|--------------------:|
| Brandon Aubrey | K          |       7 |      15.0 |        4.3 |                10.7 |
| Harold Fannin  | TE         |       7 |      14.0 |        1.3 |                12.7 |

**Protected players (1) — avoid:**

| name           | position   |   price |   mean_arb |   salary_after_arb |
|:---------------|:-----------|--------:|-----------:|-------------------:|
| Caleb Williams | QB         |      21 |       25.9 |               46.9 |

**Suggested allocation to The Triple Helix:** $5

### Tinseltown Little Gold Men

**Vulnerable targets (2):**

| name           | position   |   price |   surplus |   mean_arb |   surplus_after_arb |
|:---------------|:-----------|--------:|----------:|-----------:|--------------------:|
| Dallas Goedert | TE         |       5 |      23.0 |        6.1 |                16.9 |
| Rico Dowdle    | RB         |       9 |      20.0 |        9.8 |                10.2 |

**Protected players (2) — avoid:**

| name         | position   |   price |   mean_arb |   salary_after_arb |
|:-------------|:-----------|--------:|-----------:|-------------------:|
| Drake Maye   | QB         |      30 |       25.4 |               55.4 |
| Cam Skattebo | RB         |      15 |       24.7 |               39.7 |

**Suggested allocation to Tinseltown Little Gold Men:** $5

