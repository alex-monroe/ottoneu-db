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
| Trevor Lawrence | QB         |      26 |           67.0 |      41.0 |       37.5 |       0.0 |               63.5 |                 3.5 |
| Kyle Pitts      | TE         |      11 |           24.0 |      13.0 |        2.9 |       0.0 |               13.9 |                10.1 |

**Total Expected Arbitration on My Roster:** $40

## Vulnerable Opponent Targets — Low Protection

These are high-value opponent players receiving low arbitration protection.
**Strategy:** Target these players to maximize disruption.

### Top 20 Vulnerable Targets

| name                | position   | nfl_team   | team_name                     |   price |   dollar_value |   surplus |   mean_arb |   std_arb |   surplus_after_arb |
|:--------------------|:-----------|:-----------|:------------------------------|--------:|---------------:|----------:|-----------:|----------:|--------------------:|
| Dallas Goedert      | TE         | PHI        | Tinseltown Little Gold Men    |       5 |           28.0 |      23.0 |        7.0 |       0.0 |                16.0 |
| Christian McCaffrey | RB         | SF         | The Roseman Empire            |      77 |           99.0 |      22.0 |        2.0 |       0.0 |                20.0 |
| Dak Prescott        | QB         | DAL        | Marin County Mountain Runners |      30 |           51.0 |      21.0 |        9.0 |       0.0 |                12.0 |
| Brock Purdy         | QB         | SF         | The Hard Eight                |      44 |           65.0 |      21.0 |        8.5 |       0.0 |                12.5 |
| Jason Myers         | K          | SEA        | The Royal Dynasty             |       7 |           28.0 |      21.0 |        6.2 |       0.0 |                14.8 |
| Chris Olave         | WR         | NO         | The Royal Dynasty             |      19 |           39.0 |      20.0 |        6.1 |       0.0 |                13.9 |
| Rico Dowdle         | RB         | CAR        | Tinseltown Little Gold Men    |       9 |           29.0 |      20.0 |        4.0 |       0.0 |                16.0 |
| Quinshon Judkins    | RB         | CLE        | The Trigeminal Thunderclaps   |       8 |           27.0 |      19.0 |        7.9 |       0.0 |                11.1 |
| Tyler Shough        | QB         | NO         | The Hard Eight                |       5 |           22.0 |      17.0 |        3.6 |       0.0 |                13.4 |
| Rhamondre Stevenson | RB         | NE         | Ball So Hard University       |       9 |           25.0 |      16.0 |        4.5 |       0.0 |                11.5 |
| Harold Fannin       | TE         | CLE        | The Triple Helix              |       7 |           21.0 |      14.0 |        2.5 |       0.0 |                11.5 |
| James Cook          | RB         | BUF        | The Royal Dynasty             |      44 |           57.0 |      13.0 |        2.3 |       0.0 |                10.7 |
| Aaron Rodgers       | QB         | PIT        | Ball So Hard University       |       7 |           20.0 |      13.0 |        1.7 |       0.0 |                11.3 |
| Jaylen Warren       | RB         | PIT        | Marin County Mountain Runners |      19 |           31.0 |      12.0 |        2.3 |       0.0 |                 9.7 |
| Jordan Love         | QB         | GB         | Pacific Punt Masters          |      26 |           38.0 |      12.0 |        3.3 |       0.0 |                 8.7 |
| D'Andre Swift       | RB         | CHI        | Irish Invasion                |      28 |           40.0 |      12.0 |        1.2 |       0.0 |                10.8 |
| Michael Wilson      | WR         | ARI        | The Roseman Empire            |       5 |           17.0 |      12.0 |        1.4 |       0.0 |                10.6 |
| Wan'Dale Robinson   | WR         | NYG        | Tinseltown Little Gold Men    |       7 |           18.0 |      11.0 |        0.6 |       0.0 |                10.4 |
| J.K. Dobbins        | RB         | DEN        | Ball So Hard University       |      15 |           25.0 |      10.0 |        0.9 |       0.0 |                 9.1 |
| Alec Pierce         | WR         | IND        | The Golden Gouda              |       7 |           17.0 |      10.0 |        3.0 |       0.0 |                 7.0 |

## Heavily Protected Players — Avoid

These players are likely to receive heavy arbitration raises.
**Strategy:** Avoid targeting these players unless strategic.

### Top 10 Protected Players

| name             | position   | nfl_team   | team_name                     |   price |   dollar_value |   surplus |   mean_arb |   pct_protected |   salary_after_arb |
|:-----------------|:-----------|:-----------|:------------------------------|--------:|---------------:|----------:|-----------:|----------------:|-------------------:|
| Matthew Stafford | QB         | LA         | Irish Invasion                |      13 |           75.0 |      62.0 |       44.0 |             1.0 |               57.0 |
| Javonte Williams | RB         | DAL        | Marin County Mountain Runners |      11 |           48.0 |      37.0 |       33.8 |             0.0 |               44.8 |
| Tucker Kraft     | TE         | GB         | The Hard Eight                |       8 |           46.0 |      38.0 |       31.7 |             0.0 |               39.7 |
| Rashee Rice      | WR         | KC         | Ball So Hard University       |      14 |           53.0 |      39.0 |       29.0 |             0.0 |               43.0 |
| Daniel Jones     | QB         | IND        | Ball So Hard University       |       6 |           44.0 |      38.0 |       28.2 |             0.0 |               34.2 |
| Cam Skattebo     | RB         | NYG        | Tinseltown Little Gold Men    |      15 |           51.0 |      36.0 |       28.0 |             0.0 |               43.0 |
| Drake Maye       | QB         | NE         | Tinseltown Little Gold Men    |      30 |           62.0 |      32.0 |       26.8 |             0.0 |               56.8 |
| Travis Etienne   | RB         | JAC        | The Trigeminal Thunderclaps   |      14 |           47.0 |      33.0 |       25.8 |             0.0 |               39.8 |
| Caleb Williams   | QB         | CHI        | The Triple Helix              |      21 |           54.0 |      33.0 |       24.4 |             0.0 |               45.4 |
| Jonathan Taylor  | RB         | IND        | The Roseman Empire            |      61 |           92.0 |      31.0 |       21.7 |             0.0 |               82.7 |

## Full Roster Breakdown by Team

Complete roster for each team showing expected arbitration raises.

### Ball So Hard University

| name                | position   |   price |   dollar_value |   surplus |   mean_arb |   salary_after_arb |   surplus_after_arb |
|:--------------------|:-----------|--------:|---------------:|----------:|-----------:|-------------------:|--------------------:|
| Rashee Rice         | WR         |      14 |           53.0 |      39.0 |       29.0 |               43.0 |                10.0 |
| Daniel Jones        | QB         |       6 |           44.0 |      38.0 |       28.2 |               34.2 |                 9.8 |
| Puka Nacua          | WR         |      77 |           81.0 |       4.0 |        5.7 |               82.7 |                -1.7 |
| Rhamondre Stevenson | RB         |       9 |           25.0 |      16.0 |        4.5 |               13.5 |                11.5 |
| Aaron Rodgers       | QB         |       7 |           20.0 |      13.0 |        1.7 |                8.7 |                11.3 |
| J.K. Dobbins        | RB         |      15 |           25.0 |      10.0 |        0.9 |               15.9 |                 9.1 |
| RJ Harvey           | RB         |      21 |           28.0 |       7.0 |        0.5 |               21.5 |                 6.5 |

**Total Expected Arb:** $70 | **Avg per Player:** $10.1

### Irish Invasion

| name             | position   |   price |   dollar_value |   surplus |   mean_arb |   salary_after_arb |   surplus_after_arb |
|:-----------------|:-----------|--------:|---------------:|----------:|-----------:|-------------------:|--------------------:|
| Matthew Stafford | QB         |      13 |           75.0 |      62.0 |       44.0 |               57.0 |                18.0 |
| D'Andre Swift    | RB         |      28 |           40.0 |      12.0 |        1.2 |               29.2 |                10.8 |
| Chase Brown      | RB         |      47 |           52.0 |       5.0 |        1.0 |               48.0 |                 4.0 |

**Total Expected Arb:** $46 | **Avg per Player:** $15.4

### Marin County Mountain Runners

| name               | position   |   price |   dollar_value |   surplus |   mean_arb |   salary_after_arb |   surplus_after_arb |
|:-------------------|:-----------|--------:|---------------:|----------:|-----------:|-------------------:|--------------------:|
| Javonte Williams   | RB         |      11 |           48.0 |      37.0 |       33.8 |               44.8 |                 3.2 |
| Dak Prescott       | QB         |      30 |           51.0 |      21.0 |        9.0 |               39.0 |                12.0 |
| Jaylen Warren      | RB         |      19 |           31.0 |      12.0 |        2.3 |               21.3 |                 9.7 |
| Jaxon Smith-Njigba | WR         |      62 |           68.0 |       6.0 |        0.7 |               62.7 |                 5.3 |

**Total Expected Arb:** $46 | **Avg per Player:** $11.5

### Pacific Punt Masters

| name           | position   |   price |   dollar_value |   surplus |   mean_arb |   salary_after_arb |   surplus_after_arb |
|:---------------|:-----------|--------:|---------------:|----------:|-----------:|-------------------:|--------------------:|
| George Pickens | WR         |      22 |           45.0 |      23.0 |       14.7 |               36.7 |                 8.3 |
| Jordan Love    | QB         |      26 |           38.0 |      12.0 |        3.3 |               29.3 |                 8.7 |

**Total Expected Arb:** $18 | **Avg per Player:** $9.0

### The Golden Gouda

| name           | position   |   price |   dollar_value |   surplus |   mean_arb |   salary_after_arb |   surplus_after_arb |
|:---------------|:-----------|--------:|---------------:|----------:|-----------:|-------------------:|--------------------:|
| Trey McBride   | TE         |      49 |           62.0 |      13.0 |       11.7 |               60.7 |                 1.3 |
| Alec Pierce    | WR         |       7 |           17.0 |      10.0 |        3.0 |               10.0 |                 7.0 |
| Cameron Dicker | K          |       5 |           13.0 |       8.0 |        2.0 |                7.0 |                 6.0 |
| Josh Jacobs    | RB         |      66 |           52.0 |     -14.0 |        1.2 |               67.2 |               -15.2 |

**Total Expected Arb:** $18 | **Avg per Player:** $4.5

### The Hard Eight

| name             | position   |   price |   dollar_value |   surplus |   mean_arb |   salary_after_arb |   surplus_after_arb |
|:-----------------|:-----------|--------:|---------------:|----------:|-----------:|-------------------:|--------------------:|
| Tucker Kraft     | TE         |       8 |           46.0 |      38.0 |       31.7 |               39.7 |                 6.3 |
| Ka'imi Fairbairn | K          |       7 |           37.0 |      30.0 |       18.0 |               25.0 |                12.0 |
| Brock Purdy      | QB         |      44 |           65.0 |      21.0 |        8.5 |               52.5 |                12.5 |
| Tyler Shough     | QB         |       5 |           22.0 |      17.0 |        3.6 |                8.6 |                13.4 |
| Zay Flowers      | WR         |      23 |           25.0 |       2.0 |        0.6 |               23.6 |                 1.4 |

**Total Expected Arb:** $62 | **Avg per Player:** $12.5

### The Roseman Empire

| name                | position   |   price |   dollar_value |   surplus |   mean_arb |   salary_after_arb |   surplus_after_arb |
|:--------------------|:-----------|--------:|---------------:|----------:|-----------:|-------------------:|--------------------:|
| Jonathan Taylor     | RB         |      61 |           92.0 |      31.0 |       21.7 |               82.7 |                 9.3 |
| Jacoby Brissett     | QB         |       5 |           35.0 |      30.0 |       18.4 |               23.4 |                11.6 |
| Christian McCaffrey | RB         |      77 |           99.0 |      22.0 |        2.0 |               79.0 |                20.0 |
| George Kittle       | TE         |      40 |           41.0 |       1.0 |        1.4 |               41.4 |                -0.4 |
| Michael Wilson      | WR         |       5 |           17.0 |      12.0 |        1.4 |                6.4 |                10.6 |
| Bijan Robinson      | RB         |      90 |           88.0 |      -2.0 |        0.6 |               90.6 |                -2.6 |

**Total Expected Arb:** $46 | **Avg per Player:** $7.6

### The Royal Dynasty

| name            | position   |   price |   dollar_value |   surplus |   mean_arb |   salary_after_arb |   surplus_after_arb |
|:----------------|:-----------|--------:|---------------:|----------:|-----------:|-------------------:|--------------------:|
| De'Von Achane   | RB         |      55 |           78.0 |      23.0 |       16.0 |               71.0 |                 7.0 |
| Jason Myers     | K          |       7 |           28.0 |      21.0 |        6.2 |               13.2 |                14.8 |
| Chris Olave     | WR         |      19 |           39.0 |      20.0 |        6.1 |               25.1 |                13.9 |
| Patrick Mahomes | QB         |      64 |           66.0 |       2.0 |        3.3 |               67.3 |                -1.3 |
| Jared Goff      | QB         |      42 |           45.0 |       3.0 |        2.6 |               44.6 |                 0.4 |
| James Cook      | RB         |      44 |           57.0 |      13.0 |        2.3 |               46.3 |                10.7 |

**Total Expected Arb:** $37 | **Avg per Player:** $6.1

### The Trigeminal Thunderclaps

| name             | position   |   price |   dollar_value |   surplus |   mean_arb |   salary_after_arb |   surplus_after_arb |
|:-----------------|:-----------|--------:|---------------:|----------:|-----------:|-------------------:|--------------------:|
| Travis Etienne   | RB         |      14 |           47.0 |      33.0 |       25.8 |               39.8 |                 7.2 |
| Jaxson Dart      | QB         |      13 |           43.0 |      30.0 |       19.9 |               32.9 |                10.1 |
| Quinshon Judkins | RB         |       8 |           27.0 |      19.0 |        7.9 |               15.9 |                11.1 |
| Bryce Young      | QB         |      14 |           22.0 |       8.0 |        0.8 |               14.8 |                 7.2 |

**Total Expected Arb:** $54 | **Avg per Player:** $13.6

### The Triple Helix

| name           | position   |   price |   dollar_value |   surplus |   mean_arb |   salary_after_arb |   surplus_after_arb |
|:---------------|:-----------|--------:|---------------:|----------:|-----------:|-------------------:|--------------------:|
| Caleb Williams | QB         |      21 |           54.0 |      33.0 |       24.4 |               45.4 |                 8.6 |
| Jahmyr Gibbs   | RB         |      83 |           87.0 |       4.0 |        4.0 |               87.0 |                 0.0 |
| Harold Fannin  | TE         |       7 |           21.0 |      14.0 |        2.5 |                9.5 |                11.5 |
| Justin Herbert | QB         |      45 |           49.0 |       4.0 |        0.6 |               45.6 |                 3.4 |

**Total Expected Arb:** $31 | **Avg per Player:** $7.9

### The Witchcraft

| name            | position   |   price |   dollar_value |   surplus |   mean_arb |   salary_after_arb |   surplus_after_arb |
|:----------------|:-----------|--------:|---------------:|----------:|-----------:|-------------------:|--------------------:|
| Trevor Lawrence | QB         |      26 |           67.0 |      41.0 |       37.5 |               63.5 |                 3.5 |
| Kyle Pitts      | TE         |      11 |           24.0 |      13.0 |        2.9 |               13.9 |                10.1 |

**Total Expected Arb:** $40 | **Avg per Player:** $20.2

### Tinseltown Little Gold Men

| name              | position   |   price |   dollar_value |   surplus |   mean_arb |   salary_after_arb |   surplus_after_arb |
|:------------------|:-----------|--------:|---------------:|----------:|-----------:|-------------------:|--------------------:|
| Cam Skattebo      | RB         |      15 |           51.0 |      36.0 |       28.0 |               43.0 |                 8.0 |
| Drake Maye        | QB         |      30 |           62.0 |      32.0 |       26.8 |               56.8 |                 5.2 |
| Dallas Goedert    | TE         |       5 |           28.0 |      23.0 |        7.0 |               12.0 |                16.0 |
| Rico Dowdle       | RB         |       9 |           29.0 |      20.0 |        4.0 |               13.0 |                16.0 |
| Wan'Dale Robinson | WR         |       7 |           18.0 |      11.0 |        0.6 |                7.6 |                10.4 |

**Total Expected Arb:** $66 | **Avg per Player:** $13.3

