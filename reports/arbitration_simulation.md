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
| Trevor Lawrence | QB         |      26 |          106.0 |      80.0 |       37.2 |       0.0 |               63.2 |                42.8 |
| C.J. Stroud     | QB         |      38 |           43.0 |       5.0 |        0.5 |       0.0 |               38.5 |                 4.5 |

**Total Expected Arbitration on My Roster:** $38

## Vulnerable Opponent Targets — Low Protection

These are high-value opponent players receiving low arbitration protection.
**Strategy:** Target these players to maximize disruption.

### Top 17 Vulnerable Targets

| name              | position   | nfl_team   | team_name                   |   price |   dollar_value |   surplus |   mean_arb |   std_arb |   surplus_after_arb |
|:------------------|:-----------|:-----------|:----------------------------|--------:|---------------:|----------:|-----------:|----------:|--------------------:|
| Jonathan Taylor   | RB         | IND        | The Roseman Empire          |      61 |           95.0 |      34.0 |        6.7 |       0.0 |                27.3 |
| Tyler Shough      | QB         | NO         | The Hard Eight              |       5 |           37.0 |      32.0 |        8.8 |       0.0 |                23.2 |
| Tucker Kraft      | TE         | GB         | The Hard Eight              |       8 |           35.0 |      27.0 |        4.7 |       0.0 |                22.3 |
| Aaron Rodgers     | QB         | PIT        | Ball So Hard University     |       7 |           34.0 |      27.0 |        2.1 |       0.0 |                24.9 |
| Bo Nix            | QB         | DEN        | The Golden Gouda            |      54 |           79.0 |      25.0 |        7.4 |       0.0 |                17.6 |
| Kyler Murray      | QB         | ARI        | The Trigeminal Thunderclaps |      29 |           52.0 |      23.0 |        3.0 |       0.0 |                20.0 |
| Bryce Young       | QB         | CAR        | The Trigeminal Thunderclaps |      14 |           37.0 |      23.0 |        5.3 |       0.0 |                17.7 |
| Davante Adams     | WR         | LA         | Irish Invasion              |      32 |           52.0 |      20.0 |        8.1 |       0.0 |                11.9 |
| Michael Wilson    | WR         | ARI        | The Roseman Empire          |       5 |           22.0 |      17.0 |        0.7 |       0.0 |                16.3 |
| De'Von Achane     | RB         | MIA        | The Royal Dynasty           |      55 |           72.0 |      17.0 |        2.8 |       0.0 |                14.2 |
| Wan'Dale Robinson | WR         | NYG        | Tinseltown Little Gold Men  |       7 |           23.0 |      16.0 |        1.7 |       0.0 |                14.3 |
| Alec Pierce       | WR         | IND        | The Golden Gouda            |       7 |           22.0 |      15.0 |        4.0 |       0.0 |                11.0 |
| Trey McBride      | TE         | ARI        | The Golden Gouda            |      49 |           63.0 |      14.0 |        4.7 |       0.0 |                 9.3 |
| Zay Flowers       | WR         | BAL        | The Hard Eight              |      23 |           36.0 |      13.0 |        1.2 |       0.0 |                11.8 |
| Josh Allen        | QB         | BUF        | Irish Invasion              |     114 |          126.0 |      12.0 |        8.8 |       0.0 |                 3.2 |
| Cam Skattebo      | RB         | NYG        | Tinseltown Little Gold Men  |      15 |           26.0 |      11.0 |        0.8 |       0.0 |                10.2 |
| Baker Mayfield    | QB         | TB         | The Golden Gouda            |      48 |           56.0 |       8.0 |        1.3 |       0.0 |                 6.7 |

## Cut Candidates — Negative Surplus After Arbitration

Players who will have negative surplus value after receiving expected arbitration.
**Strategy:** These players are likely to be cut, creating FA opportunities.

### Top 1 Cut Candidates

| name              | position   | nfl_team   | team_name                  |   price |   dollar_value |   surplus |   mean_arb |   salary_after_arb |   surplus_after_arb |
|:------------------|:-----------|:-----------|:---------------------------|--------:|---------------:|----------:|-----------:|-------------------:|--------------------:|
| Amon-Ra St. Brown | WR         | DET        | Tinseltown Little Gold Men |      84 |           84.0 |       0.0 |        1.4 |               85.4 |                -1.4 |

## Full Roster Breakdown by Team

Complete roster for each team showing expected arbitration raises.

### Ball So Hard University

| name          | position   |   price |   dollar_value |   surplus |   mean_arb |   salary_after_arb |   surplus_after_arb |
|:--------------|:-----------|--------:|---------------:|----------:|-----------:|-------------------:|--------------------:|
| Rashee Rice   | WR         |      14 |           82.0 |      68.0 |       30.1 |               44.1 |                37.9 |
| Daniel Jones  | QB         |       6 |           74.0 |      68.0 |       29.6 |               35.6 |                38.4 |
| Puka Nacua    | WR         |      77 |          129.0 |      52.0 |       21.1 |               98.1 |                30.9 |
| Aaron Rodgers | QB         |       7 |           34.0 |      27.0 |        2.1 |                9.1 |                24.9 |

**Total Expected Arb:** $83 | **Avg per Player:** $20.7

### Irish Invasion

| name             | position   |   price |   dollar_value |   surplus |   mean_arb |   salary_after_arb |   surplus_after_arb |
|:-----------------|:-----------|--------:|---------------:|----------:|-----------:|-------------------:|--------------------:|
| Matthew Stafford | QB         |      13 |          121.0 |     108.0 |       42.7 |               55.7 |                65.3 |
| Josh Allen       | QB         |     114 |          126.0 |      12.0 |        8.8 |              122.8 |                 3.2 |
| Davante Adams    | WR         |      32 |           52.0 |      20.0 |        8.1 |               40.1 |                11.9 |

**Total Expected Arb:** $60 | **Avg per Player:** $19.9

### Marin County Mountain Runners

| name               | position   |   price |   dollar_value |   surplus |   mean_arb |   salary_after_arb |   surplus_after_arb |
|:-------------------|:-----------|--------:|---------------:|----------:|-----------:|-------------------:|--------------------:|
| Dak Prescott       | QB         |      30 |           86.0 |      56.0 |       24.5 |               54.5 |                31.5 |
| Jaxon Smith-Njigba | WR         |      62 |          108.0 |      46.0 |       21.4 |               83.4 |                24.6 |

**Total Expected Arb:** $46 | **Avg per Player:** $22.9

### Pacific Punt Masters

| name           | position   |   price |   dollar_value |   surplus |   mean_arb |   salary_after_arb |   surplus_after_arb |
|:---------------|:-----------|--------:|---------------:|----------:|-----------:|-------------------:|--------------------:|
| George Pickens | WR         |      22 |           69.0 |      47.0 |       19.5 |               41.5 |                27.5 |
| Jordan Love    | QB         |      26 |           63.0 |      37.0 |       11.3 |               37.3 |                25.7 |

**Total Expected Arb:** $31 | **Avg per Player:** $15.4

### The Golden Gouda

| name           | position   |   price |   dollar_value |   surplus |   mean_arb |   salary_after_arb |   surplus_after_arb |
|:---------------|:-----------|--------:|---------------:|----------:|-----------:|-------------------:|--------------------:|
| Bo Nix         | QB         |      54 |           79.0 |      25.0 |        7.4 |               61.4 |                17.6 |
| Trey McBride   | TE         |      49 |           63.0 |      14.0 |        4.7 |               53.7 |                 9.3 |
| Alec Pierce    | WR         |       7 |           22.0 |      15.0 |        4.0 |               11.0 |                11.0 |
| Baker Mayfield | QB         |      48 |           56.0 |       8.0 |        1.3 |               49.3 |                 6.7 |

**Total Expected Arb:** $17 | **Avg per Player:** $4.3

### The Hard Eight

| name         | position   |   price |   dollar_value |   surplus |   mean_arb |   salary_after_arb |   surplus_after_arb |
|:-------------|:-----------|--------:|---------------:|----------:|-----------:|-------------------:|--------------------:|
| Brock Purdy  | QB         |      44 |          110.0 |      66.0 |       25.7 |               69.7 |                40.3 |
| Tyler Shough | QB         |       5 |           37.0 |      32.0 |        8.8 |               13.8 |                23.2 |
| Tucker Kraft | TE         |       8 |           35.0 |      27.0 |        4.7 |               12.7 |                22.3 |
| Zay Flowers  | WR         |      23 |           36.0 |      13.0 |        1.2 |               24.2 |                11.8 |

**Total Expected Arb:** $40 | **Avg per Player:** $10.1

### The Roseman Empire

| name                | position   |   price |   dollar_value |   surplus |   mean_arb |   salary_after_arb |   surplus_after_arb |
|:--------------------|:-----------|--------:|---------------:|----------:|-----------:|-------------------:|--------------------:|
| Jacoby Brissett     | QB         |       5 |           60.0 |      55.0 |       21.2 |               26.2 |                33.8 |
| Christian McCaffrey | RB         |      77 |          107.0 |      30.0 |       10.5 |               87.5 |                19.5 |
| Jonathan Taylor     | RB         |      61 |           95.0 |      34.0 |        6.7 |               67.7 |                27.3 |
| Michael Wilson      | WR         |       5 |           22.0 |      17.0 |        0.7 |                5.7 |                16.3 |

**Total Expected Arb:** $39 | **Avg per Player:** $9.8

### The Royal Dynasty

| name            | position   |   price |   dollar_value |   surplus |   mean_arb |   salary_after_arb |   surplus_after_arb |
|:----------------|:-----------|--------:|---------------:|----------:|-----------:|-------------------:|--------------------:|
| Patrick Mahomes | QB         |      64 |          110.0 |      46.0 |       24.6 |               88.6 |                21.4 |
| Jared Goff      | QB         |      42 |           76.0 |      34.0 |       19.6 |               61.6 |                14.4 |
| Chris Olave     | WR         |      19 |           59.0 |      40.0 |       13.5 |               32.5 |                26.5 |
| De'Von Achane   | RB         |      55 |           72.0 |      17.0 |        2.8 |               57.8 |                14.2 |

**Total Expected Arb:** $60 | **Avg per Player:** $15.1

### The Trigeminal Thunderclaps

| name         | position   |   price |   dollar_value |   surplus |   mean_arb |   salary_after_arb |   surplus_after_arb |
|:-------------|:-----------|--------:|---------------:|----------:|-----------:|-------------------:|--------------------:|
| Jaxson Dart  | QB         |      13 |           72.0 |      59.0 |       27.7 |               40.7 |                31.3 |
| Bryce Young  | QB         |      14 |           37.0 |      23.0 |        5.3 |               19.3 |                17.7 |
| Kyler Murray | QB         |      29 |           52.0 |      23.0 |        3.0 |               32.0 |                20.0 |

**Total Expected Arb:** $36 | **Avg per Player:** $12.0

### The Triple Helix

| name           | position   |   price |   dollar_value |   surplus |   mean_arb |   salary_after_arb |   surplus_after_arb |
|:---------------|:-----------|--------:|---------------:|----------:|-----------:|-------------------:|--------------------:|
| Caleb Williams | QB         |      21 |           90.0 |      69.0 |       32.2 |               53.2 |                36.8 |
| Justin Herbert | QB         |      45 |           82.0 |      37.0 |       20.0 |               65.0 |                17.0 |
| Jahmyr Gibbs   | RB         |      83 |           87.0 |       4.0 |        0.8 |               83.8 |                 3.2 |

**Total Expected Arb:** $53 | **Avg per Player:** $17.6

### The Witchcraft

| name            | position   |   price |   dollar_value |   surplus |   mean_arb |   salary_after_arb |   surplus_after_arb |
|:----------------|:-----------|--------:|---------------:|----------:|-----------:|-------------------:|--------------------:|
| Trevor Lawrence | QB         |      26 |          106.0 |      80.0 |       37.2 |               63.2 |                42.8 |
| C.J. Stroud     | QB         |      38 |           43.0 |       5.0 |        0.5 |               38.5 |                 4.5 |

**Total Expected Arb:** $38 | **Avg per Player:** $18.9

### Tinseltown Little Gold Men

| name              | position   |   price |   dollar_value |   surplus |   mean_arb |   salary_after_arb |   surplus_after_arb |
|:------------------|:-----------|--------:|---------------:|----------:|-----------:|-------------------:|--------------------:|
| Drake Maye        | QB         |      30 |          101.0 |      71.0 |       26.8 |               56.8 |                44.2 |
| Wan'Dale Robinson | WR         |       7 |           23.0 |      16.0 |        1.7 |                8.7 |                14.3 |
| Amon-Ra St. Brown | WR         |      84 |           84.0 |       0.0 |        1.4 |               85.4 |                -1.4 |
| Cam Skattebo      | RB         |      15 |           26.0 |      11.0 |        0.8 |               15.8 |                10.2 |

**Total Expected Arb:** $31 | **Avg per Player:** $7.7

