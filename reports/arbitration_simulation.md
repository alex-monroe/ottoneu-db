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
| Trevor Lawrence | QB         |      26 |           67.0 |      41.0 |       36.7 |       0.0 |               62.7 |                 4.3 |
| Kyle Pitts      | TE         |      11 |           24.0 |      13.0 |        1.2 |       0.0 |               12.2 |                11.8 |

**Total Expected Arbitration on My Roster:** $38

## Vulnerable Opponent Targets — Low Protection

These are high-value opponent players receiving low arbitration protection.
**Strategy:** Target these players to maximize disruption.

### Top 15 Vulnerable Targets

| name                | position   | nfl_team   | team_name                     |   price |   dollar_value |   surplus |   mean_arb |   std_arb |   surplus_after_arb |
|:--------------------|:-----------|:-----------|:------------------------------|--------:|---------------:|----------:|-----------:|----------:|--------------------:|
| Brock Purdy         | QB         | SF         | The Hard Eight                |      44 |           65.0 |      21.0 |        6.8 |       0.0 |                14.2 |
| Rico Dowdle         | RB         | CAR        | Tinseltown Little Gold Men    |       9 |           29.0 |      20.0 |        6.3 |       0.0 |                13.7 |
| Quinshon Judkins    | RB         | CLE        | The Trigeminal Thunderclaps   |       8 |           27.0 |      19.0 |        4.7 |       0.0 |                14.3 |
| Tyler Shough        | QB         | NO         | The Hard Eight                |       5 |           22.0 |      17.0 |        2.9 |       0.0 |                14.1 |
| Rhamondre Stevenson | RB         | NE         | Ball So Hard University       |       9 |           25.0 |      16.0 |        3.8 |       0.0 |                12.2 |
| Brandon Aubrey      | K          | DAL        | The Triple Helix              |       7 |           22.0 |      15.0 |        0.7 |       0.0 |                14.3 |
| James Cook          | RB         | BUF        | The Royal Dynasty             |      44 |           57.0 |      13.0 |        4.3 |       0.0 |                 8.7 |
| Aaron Rodgers       | QB         | PIT        | Ball So Hard University       |       7 |           20.0 |      13.0 |        0.6 |       0.0 |                12.4 |
| Trey McBride        | TE         | ARI        | The Golden Gouda              |      49 |           62.0 |      13.0 |        6.2 |       0.0 |                 6.8 |
| Jordan Love         | QB         | GB         | Pacific Punt Masters          |      26 |           38.0 |      12.0 |        2.7 |       0.0 |                 9.3 |
| D'Andre Swift       | RB         | CHI        | Irish Invasion                |      28 |           40.0 |      12.0 |        2.2 |       0.0 |                 9.8 |
| Zach Charbonnet     | RB         | SEA        | Pacific Punt Masters          |      14 |           24.0 |      10.0 |        2.8 |       0.0 |                 7.2 |
| Alec Pierce         | WR         | IND        | The Golden Gouda              |       7 |           17.0 |      10.0 |        5.0 |       0.0 |                 5.0 |
| Jaxon Smith-Njigba  | WR         | SEA        | Marin County Mountain Runners |      62 |           68.0 |       6.0 |        6.4 |       0.0 |                -0.4 |
| Colston Loveland    | TE         | CHI        | Marin County Mountain Runners |      12 |           18.0 |       6.0 |        0.9 |       0.0 |                 5.1 |

## Cut Candidates — Negative Surplus After Arbitration

Players who will have negative surplus value after receiving expected arbitration.
**Strategy:** These players are likely to be cut, creating FA opportunities.

### Top 6 Cut Candidates

| name                | position   | nfl_team   | team_name                     |   price |   dollar_value |   surplus |   mean_arb |   salary_after_arb |   surplus_after_arb |
|:--------------------|:-----------|:-----------|:------------------------------|--------:|---------------:|----------:|-----------:|-------------------:|--------------------:|
| Bijan Robinson      | RB         | ATL        | The Roseman Empire            |      90 |           88.0 |      -2.0 |        5.4 |               95.4 |                -7.4 |
| Jahmyr Gibbs        | RB         | DET        | The Triple Helix              |      83 |           87.0 |       4.0 |        8.6 |               91.6 |                -4.6 |
| Chase Brown         | RB         | CIN        | Irish Invasion                |      47 |           52.0 |       5.0 |        6.1 |               53.1 |                -1.1 |
| Christian McCaffrey | RB         | SF         | The Roseman Empire            |      77 |           99.0 |      22.0 |       22.7 |               99.7 |                -0.7 |
| George Kittle       | TE         | SF         | The Roseman Empire            |      40 |           41.0 |       1.0 |        1.4 |               41.4 |                -0.4 |
| Jaxon Smith-Njigba  | WR         | SEA        | Marin County Mountain Runners |      62 |           68.0 |       6.0 |        6.4 |               68.4 |                -0.4 |

## Full Roster Breakdown by Team

Complete roster for each team showing expected arbitration raises.

### Ball So Hard University

| name                | position   |   price |   dollar_value |   surplus |   mean_arb |   salary_after_arb |   surplus_after_arb |
|:--------------------|:-----------|--------:|---------------:|----------:|-----------:|-------------------:|--------------------:|
| Rashee Rice         | WR         |      14 |           53.0 |      39.0 |       33.4 |               47.4 |                 5.6 |
| Daniel Jones        | QB         |       6 |           44.0 |      38.0 |       32.0 |               38.0 |                 6.0 |
| Rhamondre Stevenson | RB         |       9 |           25.0 |      16.0 |        3.8 |               12.8 |                12.2 |
| Puka Nacua          | WR         |      77 |           81.0 |       4.0 |        0.9 |               77.9 |                 3.1 |
| Aaron Rodgers       | QB         |       7 |           20.0 |      13.0 |        0.6 |                7.6 |                12.4 |

**Total Expected Arb:** $71 | **Avg per Player:** $14.2

### Irish Invasion

| name             | position   |   price |   dollar_value |   surplus |   mean_arb |   salary_after_arb |   surplus_after_arb |
|:-----------------|:-----------|--------:|---------------:|----------:|-----------:|-------------------:|--------------------:|
| Matthew Stafford | QB         |      13 |           75.0 |      62.0 |       37.2 |               50.2 |                24.8 |
| Chase Brown      | RB         |      47 |           52.0 |       5.0 |        6.1 |               53.1 |                -1.1 |
| D'Andre Swift    | RB         |      28 |           40.0 |      12.0 |        2.2 |               30.2 |                 9.8 |
| Davante Adams    | WR         |      32 |           34.0 |       2.0 |        0.8 |               32.8 |                 1.2 |

**Total Expected Arb:** $46 | **Avg per Player:** $11.5

### Marin County Mountain Runners

| name               | position   |   price |   dollar_value |   surplus |   mean_arb |   salary_after_arb |   surplus_after_arb |
|:-------------------|:-----------|--------:|---------------:|----------:|-----------:|-------------------:|--------------------:|
| Javonte Williams   | RB         |      11 |           48.0 |      37.0 |       25.3 |               36.3 |                11.7 |
| Dak Prescott       | QB         |      30 |           51.0 |      21.0 |       15.3 |               45.3 |                 5.7 |
| Jaxon Smith-Njigba | WR         |      62 |           68.0 |       6.0 |        6.4 |               68.4 |                -0.4 |
| Colston Loveland   | TE         |      12 |           18.0 |       6.0 |        0.9 |               12.9 |                 5.1 |

**Total Expected Arb:** $48 | **Avg per Player:** $12.0

### Pacific Punt Masters

| name            | position   |   price |   dollar_value |   surplus |   mean_arb |   salary_after_arb |   surplus_after_arb |
|:----------------|:-----------|--------:|---------------:|----------:|-----------:|-------------------:|--------------------:|
| George Pickens  | WR         |      22 |           45.0 |      23.0 |       11.4 |               33.4 |                11.6 |
| Zach Charbonnet | RB         |      14 |           24.0 |      10.0 |        2.8 |               16.8 |                 7.2 |
| Jordan Love     | QB         |      26 |           38.0 |      12.0 |        2.7 |               28.7 |                 9.3 |

**Total Expected Arb:** $17 | **Avg per Player:** $5.6

### The Golden Gouda

| name         | position   |   price |   dollar_value |   surplus |   mean_arb |   salary_after_arb |   surplus_after_arb |
|:-------------|:-----------|--------:|---------------:|----------:|-----------:|-------------------:|--------------------:|
| Trey McBride | TE         |      49 |           62.0 |      13.0 |        6.2 |               55.2 |                 6.8 |
| Alec Pierce  | WR         |       7 |           17.0 |      10.0 |        5.0 |               12.0 |                 5.0 |
| Romeo Doubs  | WR         |       5 |            9.0 |       4.0 |        1.0 |                6.0 |                 3.0 |

**Total Expected Arb:** $12 | **Avg per Player:** $4.1

### The Hard Eight

| name             | position   |   price |   dollar_value |   surplus |   mean_arb |   salary_after_arb |   surplus_after_arb |
|:-----------------|:-----------|--------:|---------------:|----------:|-----------:|-------------------:|--------------------:|
| Tucker Kraft     | TE         |       8 |           46.0 |      38.0 |       34.9 |               42.9 |                 3.1 |
| Ka'imi Fairbairn | K          |       7 |           37.0 |      30.0 |       19.9 |               26.9 |                10.1 |
| Brock Purdy      | QB         |      44 |           65.0 |      21.0 |        6.8 |               50.8 |                14.2 |
| Tyler Shough     | QB         |       5 |           22.0 |      17.0 |        2.9 |                7.9 |                14.1 |

**Total Expected Arb:** $64 | **Avg per Player:** $16.1

### The Roseman Empire

| name                | position   |   price |   dollar_value |   surplus |   mean_arb |   salary_after_arb |   surplus_after_arb |
|:--------------------|:-----------|--------:|---------------:|----------:|-----------:|-------------------:|--------------------:|
| Christian McCaffrey | RB         |      77 |           99.0 |      22.0 |       22.7 |               99.7 |                -0.7 |
| Jonathan Taylor     | RB         |      61 |           92.0 |      31.0 |       16.7 |               77.7 |                14.3 |
| Jacoby Brissett     | QB         |       5 |           35.0 |      30.0 |       15.6 |               20.6 |                14.4 |
| Bijan Robinson      | RB         |      90 |           88.0 |      -2.0 |        5.4 |               95.4 |                -7.4 |
| George Kittle       | TE         |      40 |           41.0 |       1.0 |        1.4 |               41.4 |                -0.4 |

**Total Expected Arb:** $62 | **Avg per Player:** $12.3

### The Royal Dynasty

| name          | position   |   price |   dollar_value |   surplus |   mean_arb |   salary_after_arb |   surplus_after_arb |
|:--------------|:-----------|--------:|---------------:|----------:|-----------:|-------------------:|--------------------:|
| Jason Myers   | K          |       7 |           28.0 |      21.0 |       12.7 |               19.7 |                 8.3 |
| Chris Olave   | WR         |      19 |           39.0 |      20.0 |       12.6 |               31.6 |                 7.4 |
| De'Von Achane | RB         |      55 |           78.0 |      23.0 |       11.3 |               66.3 |                11.7 |
| James Cook    | RB         |      44 |           57.0 |      13.0 |        4.3 |               48.3 |                 8.7 |

**Total Expected Arb:** $41 | **Avg per Player:** $10.2

### The Trigeminal Thunderclaps

| name             | position   |   price |   dollar_value |   surplus |   mean_arb |   salary_after_arb |   surplus_after_arb |
|:-----------------|:-----------|--------:|---------------:|----------:|-----------:|-------------------:|--------------------:|
| Travis Etienne   | RB         |      14 |           47.0 |      33.0 |       22.8 |               36.8 |                10.2 |
| Jaxson Dart      | QB         |      13 |           43.0 |      30.0 |       19.5 |               32.5 |                10.5 |
| Quinshon Judkins | RB         |       8 |           27.0 |      19.0 |        4.7 |               12.7 |                14.3 |

**Total Expected Arb:** $47 | **Avg per Player:** $15.7

### The Triple Helix

| name           | position   |   price |   dollar_value |   surplus |   mean_arb |   salary_after_arb |   surplus_after_arb |
|:---------------|:-----------|--------:|---------------:|----------:|-----------:|-------------------:|--------------------:|
| Caleb Williams | QB         |      21 |           54.0 |      33.0 |       21.5 |               42.5 |                11.5 |
| Jahmyr Gibbs   | RB         |      83 |           87.0 |       4.0 |        8.6 |               91.6 |                -4.6 |
| Brandon Aubrey | K          |       7 |           22.0 |      15.0 |        0.7 |                7.7 |                14.3 |

**Total Expected Arb:** $31 | **Avg per Player:** $10.3

### The Witchcraft

| name            | position   |   price |   dollar_value |   surplus |   mean_arb |   salary_after_arb |   surplus_after_arb |
|:----------------|:-----------|--------:|---------------:|----------:|-----------:|-------------------:|--------------------:|
| Trevor Lawrence | QB         |      26 |           67.0 |      41.0 |       36.7 |               62.7 |                 4.3 |
| Kyle Pitts      | TE         |      11 |           24.0 |      13.0 |        1.2 |               12.2 |                11.8 |

**Total Expected Arb:** $38 | **Avg per Player:** $18.9

### Tinseltown Little Gold Men

| name           | position   |   price |   dollar_value |   surplus |   mean_arb |   salary_after_arb |   surplus_after_arb |
|:---------------|:-----------|--------:|---------------:|----------:|-----------:|-------------------:|--------------------:|
| Drake Maye     | QB         |      30 |           62.0 |      32.0 |       23.4 |               53.4 |                 8.6 |
| Cam Skattebo   | RB         |      15 |           51.0 |      36.0 |       21.3 |               36.3 |                14.7 |
| Dallas Goedert | TE         |       5 |           28.0 |      23.0 |       11.8 |               16.8 |                11.2 |
| Rico Dowdle    | RB         |       9 |           29.0 |      20.0 |        6.3 |               15.3 |                13.7 |
| Tyler Warren   | TE         |      13 |           17.0 |       4.0 |        0.6 |               13.6 |                 3.4 |

**Total Expected Arb:** $63 | **Avg per Player:** $12.7

