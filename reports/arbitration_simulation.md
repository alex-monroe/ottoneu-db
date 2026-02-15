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
| Trevor Lawrence | QB         |      26 |           67.0 |      41.0 |       34.5 |       0.0 |               60.5 |                 6.5 |
| Kyle Pitts      | TE         |      11 |           24.0 |      13.0 |        0.6 |       0.0 |               11.6 |                12.4 |

**Total Expected Arbitration on My Roster:** $35

## Vulnerable Opponent Targets — Low Protection

These are high-value opponent players receiving low arbitration protection.
**Strategy:** Target these players to maximize disruption.

### Top 18 Vulnerable Targets

| name                | position   | nfl_team   | team_name                     |   price |   dollar_value |   surplus |   mean_arb |   std_arb |   surplus_after_arb |
|:--------------------|:-----------|:-----------|:------------------------------|--------:|---------------:|----------:|-----------:|----------:|--------------------:|
| Brock Purdy         | QB         | SF         | The Hard Eight                |      44 |           65.0 |      21.0 |        9.5 |       0.0 |                11.5 |
| Rico Dowdle         | RB         | CAR        | Tinseltown Little Gold Men    |       9 |           29.0 |      20.0 |        2.8 |       0.0 |                17.2 |
| Quinshon Judkins    | RB         | CLE        | The Trigeminal Thunderclaps   |       8 |           27.0 |      19.0 |        5.2 |       0.0 |                13.8 |
| Tyler Shough        | QB         | NO         | The Hard Eight                |       5 |           22.0 |      17.0 |        2.2 |       0.0 |                14.8 |
| Rhamondre Stevenson | RB         | NE         | Ball So Hard University       |       9 |           25.0 |      16.0 |        4.3 |       0.0 |                11.7 |
| Brandon Aubrey      | K          | DAL        | The Triple Helix              |       7 |           22.0 |      15.0 |        3.6 |       0.0 |                11.4 |
| Harold Fannin       | TE         | CLE        | The Triple Helix              |       7 |           21.0 |      14.0 |        2.6 |       0.0 |                11.4 |
| Aaron Rodgers       | QB         | PIT        | Ball So Hard University       |       7 |           20.0 |      13.0 |        0.6 |       0.0 |                12.4 |
| James Cook          | RB         | BUF        | The Royal Dynasty             |      44 |           57.0 |      13.0 |        4.0 |       0.0 |                 9.0 |
| Trey McBride        | TE         | ARI        | The Golden Gouda              |      49 |           62.0 |      13.0 |        5.9 |       0.0 |                 7.1 |
| Jordan Love         | QB         | GB         | Pacific Punt Masters          |      26 |           38.0 |      12.0 |        5.1 |       0.0 |                 6.9 |
| D'Andre Swift       | RB         | CHI        | Irish Invasion                |      28 |           40.0 |      12.0 |        5.1 |       0.0 |                 6.9 |
| Michael Wilson      | WR         | ARI        | The Roseman Empire            |       5 |           17.0 |      12.0 |        1.3 |       0.0 |                10.7 |
| Jaylen Warren       | RB         | PIT        | Marin County Mountain Runners |      19 |           31.0 |      12.0 |        0.6 |       0.0 |                11.4 |
| Alec Pierce         | WR         | IND        | The Golden Gouda              |       7 |           17.0 |      10.0 |        3.0 |       0.0 |                 7.0 |
| Zach Charbonnet     | RB         | SEA        | Pacific Punt Masters          |      14 |           24.0 |      10.0 |        1.7 |       0.0 |                 8.3 |
| Cameron Dicker      | K          | LAC        | The Golden Gouda              |       5 |           13.0 |       8.0 |        1.0 |       0.0 |                 7.0 |
| Jaxon Smith-Njigba  | WR         | SEA        | Marin County Mountain Runners |      62 |           68.0 |       6.0 |        1.2 |       0.0 |                 4.8 |

## Heavily Protected Players — Avoid

These players are likely to receive heavy arbitration raises.
**Strategy:** Avoid targeting these players unless strategic.

### Top 8 Protected Players

| name             | position   | nfl_team   | team_name                     |   price |   dollar_value |   surplus |   mean_arb |   pct_protected |   salary_after_arb |
|:-----------------|:-----------|:-----------|:------------------------------|--------:|---------------:|----------:|-----------:|----------------:|-------------------:|
| Matthew Stafford | QB         | LA         | Irish Invasion                |      13 |           75.0 |      62.0 |       44.0 |             1.0 |               57.0 |
| Caleb Williams   | QB         | CHI        | The Triple Helix              |      21 |           54.0 |      33.0 |       34.2 |             0.0 |               55.2 |
| Daniel Jones     | QB         | IND        | Ball So Hard University       |       6 |           44.0 |      38.0 |       34.0 |             0.0 |               40.0 |
| Tucker Kraft     | TE         | GB         | The Hard Eight                |       8 |           46.0 |      38.0 |       30.3 |             0.0 |               38.3 |
| Rashee Rice      | WR         | KC         | Ball So Hard University       |      14 |           53.0 |      39.0 |       29.7 |             0.0 |               43.7 |
| Travis Etienne   | RB         | JAC        | The Trigeminal Thunderclaps   |      14 |           47.0 |      33.0 |       27.0 |             0.0 |               41.0 |
| Javonte Williams | RB         | DAL        | Marin County Mountain Runners |      11 |           48.0 |      37.0 |       24.5 |             0.0 |               35.5 |
| Jacoby Brissett  | QB         | ARI        | The Roseman Empire            |       5 |           35.0 |      30.0 |       21.4 |             0.0 |               26.4 |

## Full Roster Breakdown by Opponent

Complete roster for each team showing expected arbitration raises.

### Ball So Hard University

| name                | position   |   price |   dollar_value |   surplus |   mean_arb |   salary_after_arb |   surplus_after_arb |
|:--------------------|:-----------|--------:|---------------:|----------:|-----------:|-------------------:|--------------------:|
| Daniel Jones        | QB         |       6 |           44.0 |      38.0 |       34.0 |               40.0 |                 4.0 |
| Rashee Rice         | WR         |      14 |           53.0 |      39.0 |       29.7 |               43.7 |                 9.3 |
| Rhamondre Stevenson | RB         |       9 |           25.0 |      16.0 |        4.3 |               13.3 |                11.7 |
| Puka Nacua          | WR         |      77 |           81.0 |       4.0 |        1.9 |               78.9 |                 2.1 |
| Aaron Rodgers       | QB         |       7 |           20.0 |      13.0 |        0.6 |                7.6 |                12.4 |

**Total Expected Arb:** $71 | **Avg per Player:** $14.1

### Irish Invasion

| name             | position   |   price |   dollar_value |   surplus |   mean_arb |   salary_after_arb |   surplus_after_arb |
|:-----------------|:-----------|--------:|---------------:|----------:|-----------:|-------------------:|--------------------:|
| Matthew Stafford | QB         |      13 |           75.0 |      62.0 |       44.0 |               57.0 |                18.0 |
| D'Andre Swift    | RB         |      28 |           40.0 |      12.0 |        5.1 |               33.1 |                 6.9 |
| Chase Brown      | RB         |      47 |           52.0 |       5.0 |        2.0 |               49.0 |                 3.0 |
| Davante Adams    | WR         |      32 |           34.0 |       2.0 |        0.9 |               32.9 |                 1.1 |

**Total Expected Arb:** $52 | **Avg per Player:** $13.0

### Marin County Mountain Runners

| name               | position   |   price |   dollar_value |   surplus |   mean_arb |   salary_after_arb |   surplus_after_arb |
|:-------------------|:-----------|--------:|---------------:|----------:|-----------:|-------------------:|--------------------:|
| Javonte Williams   | RB         |      11 |           48.0 |      37.0 |       24.5 |               35.5 |                12.5 |
| Dak Prescott       | QB         |      30 |           51.0 |      21.0 |       11.5 |               41.5 |                 9.5 |
| Jaxon Smith-Njigba | WR         |      62 |           68.0 |       6.0 |        1.2 |               63.2 |                 4.8 |
| Jaylen Warren      | RB         |      19 |           31.0 |      12.0 |        0.6 |               19.6 |                11.4 |

**Total Expected Arb:** $38 | **Avg per Player:** $9.4

### Pacific Punt Masters

| name            | position   |   price |   dollar_value |   surplus |   mean_arb |   salary_after_arb |   surplus_after_arb |
|:----------------|:-----------|--------:|---------------:|----------:|-----------:|-------------------:|--------------------:|
| George Pickens  | WR         |      22 |           45.0 |      23.0 |       13.3 |               35.3 |                 9.7 |
| Jordan Love     | QB         |      26 |           38.0 |      12.0 |        5.1 |               31.1 |                 6.9 |
| Zach Charbonnet | RB         |      14 |           24.0 |      10.0 |        1.7 |               15.7 |                 8.3 |

**Total Expected Arb:** $20 | **Avg per Player:** $6.7

### The Golden Gouda

| name           | position   |   price |   dollar_value |   surplus |   mean_arb |   salary_after_arb |   surplus_after_arb |
|:---------------|:-----------|--------:|---------------:|----------:|-----------:|-------------------:|--------------------:|
| Trey McBride   | TE         |      49 |           62.0 |      13.0 |        5.9 |               54.9 |                 7.1 |
| Alec Pierce    | WR         |       7 |           17.0 |      10.0 |        3.0 |               10.0 |                 7.0 |
| Bo Nix         | QB         |      54 |           47.0 |      -7.0 |        2.0 |               56.0 |                -9.0 |
| Kyren Williams | RB         |      65 |           59.0 |      -6.0 |        1.6 |               66.6 |                -7.6 |
| Romeo Doubs    | WR         |       5 |            9.0 |       4.0 |        1.0 |                6.0 |                 3.0 |
| Cameron Dicker | K          |       5 |           13.0 |       8.0 |        1.0 |                6.0 |                 7.0 |

**Total Expected Arb:** $14 | **Avg per Player:** $2.4

### The Hard Eight

| name             | position   |   price |   dollar_value |   surplus |   mean_arb |   salary_after_arb |   surplus_after_arb |
|:-----------------|:-----------|--------:|---------------:|----------:|-----------:|-------------------:|--------------------:|
| Tucker Kraft     | TE         |       8 |           46.0 |      38.0 |       30.3 |               38.3 |                 7.7 |
| Ka'imi Fairbairn | K          |       7 |           37.0 |      30.0 |       19.6 |               26.6 |                10.4 |
| Brock Purdy      | QB         |      44 |           65.0 |      21.0 |        9.5 |               53.5 |                11.5 |
| Tyler Shough     | QB         |       5 |           22.0 |      17.0 |        2.2 |                7.2 |                14.8 |

**Total Expected Arb:** $62 | **Avg per Player:** $15.4

### The Roseman Empire

| name                | position   |   price |   dollar_value |   surplus |   mean_arb |   salary_after_arb |   surplus_after_arb |
|:--------------------|:-----------|--------:|---------------:|----------:|-----------:|-------------------:|--------------------:|
| Jacoby Brissett     | QB         |       5 |           35.0 |      30.0 |       21.4 |               26.4 |                 8.6 |
| Christian McCaffrey | RB         |      77 |           99.0 |      22.0 |       18.9 |               95.9 |                 3.1 |
| Jonathan Taylor     | RB         |      61 |           92.0 |      31.0 |       14.5 |               75.5 |                16.5 |
| Michael Wilson      | WR         |       5 |           17.0 |      12.0 |        1.3 |                6.3 |                10.7 |
| George Kittle       | TE         |      40 |           41.0 |       1.0 |        0.6 |               40.6 |                 0.4 |

**Total Expected Arb:** $57 | **Avg per Player:** $11.3

### The Royal Dynasty

| name          | position   |   price |   dollar_value |   surplus |   mean_arb |   salary_after_arb |   surplus_after_arb |
|:--------------|:-----------|--------:|---------------:|----------:|-----------:|-------------------:|--------------------:|
| Chris Olave   | WR         |      19 |           39.0 |      20.0 |       12.0 |               31.0 |                 8.0 |
| De'Von Achane | RB         |      55 |           78.0 |      23.0 |       11.3 |               66.3 |                11.7 |
| Jason Myers   | K          |       7 |           28.0 |      21.0 |       11.1 |               18.1 |                 9.9 |
| James Cook    | RB         |      44 |           57.0 |      13.0 |        4.0 |               48.0 |                 9.0 |

**Total Expected Arb:** $38 | **Avg per Player:** $9.6

### The Trigeminal Thunderclaps

| name             | position   |   price |   dollar_value |   surplus |   mean_arb |   salary_after_arb |   surplus_after_arb |
|:-----------------|:-----------|--------:|---------------:|----------:|-----------:|-------------------:|--------------------:|
| Travis Etienne   | RB         |      14 |           47.0 |      33.0 |       27.0 |               41.0 |                 6.0 |
| Jaxson Dart      | QB         |      13 |           43.0 |      30.0 |       16.9 |               29.9 |                13.1 |
| Quinshon Judkins | RB         |       8 |           27.0 |      19.0 |        5.2 |               13.2 |                13.8 |

**Total Expected Arb:** $49 | **Avg per Player:** $16.4

### The Triple Helix

| name           | position   |   price |   dollar_value |   surplus |   mean_arb |   salary_after_arb |   surplus_after_arb |
|:---------------|:-----------|--------:|---------------:|----------:|-----------:|-------------------:|--------------------:|
| Caleb Williams | QB         |      21 |           54.0 |      33.0 |       34.2 |               55.2 |                -1.2 |
| Jahmyr Gibbs   | RB         |      83 |           87.0 |       4.0 |        8.2 |               91.2 |                -4.2 |
| Brandon Aubrey | K          |       7 |           22.0 |      15.0 |        3.6 |               10.6 |                11.4 |
| Harold Fannin  | TE         |       7 |           21.0 |      14.0 |        2.6 |                9.6 |                11.4 |

**Total Expected Arb:** $49 | **Avg per Player:** $12.1

### Tinseltown Little Gold Men

| name           | position   |   price |   dollar_value |   surplus |   mean_arb |   salary_after_arb |   surplus_after_arb |
|:---------------|:-----------|--------:|---------------:|----------:|-----------:|-------------------:|--------------------:|
| Cam Skattebo   | RB         |      15 |           51.0 |      36.0 |       19.8 |               34.8 |                16.2 |
| Drake Maye     | QB         |      30 |           62.0 |      32.0 |       19.2 |               49.2 |                12.8 |
| Dallas Goedert | TE         |       5 |           28.0 |      23.0 |       11.4 |               16.4 |                11.6 |
| Rico Dowdle    | RB         |       9 |           29.0 |      20.0 |        2.8 |               11.8 |                17.2 |

**Total Expected Arb:** $53 | **Avg per Player:** $13.3

