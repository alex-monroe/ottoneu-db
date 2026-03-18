# Per-Player Backtest Diagnostics

_Generated: 2026-03-17 19:49_

**Model:** `v6_usage_share`  
**Season:** 2025  
**Players analyzed:** 261

## Error Category Summary

| Category | Count | % |
| --- | --- | --- |
| normal | 82 | 31.4% |
| injury | 63 | 24.1% |
| bust | 55 | 21.1% |
| breakout | 26 | 10.0% |
| rookie_bust | 25 | 9.6% |
| rookie_breakout | 10 | 3.8% |

## Position Summary

| Position | Count | Mean |Error| | Max |Error| |
| --- | --- | --- | --- |
| QB | 53 | 8.208 | 54.170 |
| RB | 54 | 4.735 | 17.970 |
| WR | 62 | 4.382 | 16.880 |
| TE | 62 | 3.099 | 12.000 |
| K | 30 | 2.653 | 6.740 |

## Top 10 Worst Projections

| Rank | Player | Pos | Team | Projected | Actual | Error | |Error| | Category | GP | Features |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | Jacoby Brissett | QB | ARI | 70.34 | 16.17 | -54.17 | 54.17 | bust | 14 | age_curve=-0.25, games_played=-2.82, stat_efficiency=+2.46, team_context=-1.37, usage_share=+62.92, weighted_ppg=9.39 |
| 2 | Carson Wentz | QB | MIN | 66.00 | 13.87 | -52.13 | 52.13 | injury | 5 | age_curve=-0.24, games_played=-4.62, stat_efficiency=+9.54, team_context=+1.45, usage_share=+48.91, weighted_ppg=10.95 |
| 3 | Marcus Mariota | QB | WAS | 42.97 | 11.32 | -31.65 | 31.65 | bust | 11 | age_curve=-0.17, games_played=-5.32, stat_efficiency=-4.35, team_context=+1.22, usage_share=+37.40, weighted_ppg=14.19 |
| 4 | Aaron Rodgers | QB | PIT | 38.40 | 14.10 | -24.30 | 24.30 | bust | 16 | age_curve=-1.06, games_played=+0.00, stat_efficiency=-9.45, team_context=+0.57, usage_share=+33.84, weighted_ppg=14.50 |
| 5 | Joe Milton | QB | DAL | 22.04 | 2.58 | -19.46 | 19.46 | injury | 4 | age_curve=+0.36, games_played=+0.00, stat_efficiency=None, team_context=+0.44, usage_share=None, weighted_ppg=21.24 |
| 6 | Jerome Ford | RB | CLE | 20.32 | 2.35 | -17.97 | 17.97 | bust | 13 | age_curve=-0.23, games_played=+0.00, stat_efficiency=-0.57, team_context=-1.80, usage_share=+15.12, weighted_ppg=7.81 |
| 7 | Christian Kirk | WR | HOU | 22.83 | 5.95 | -16.88 | 16.88 | bust | 13 | age_curve=-0.89, games_played=-1.90, stat_efficiency=+1.26, team_context=+1.57, usage_share=+13.08, weighted_ppg=9.71 |
| 8 | Justin Jefferson | WR | MIN | 26.20 | 9.38 | -16.82 | 16.82 | bust | 17 | age_curve=+0.32, games_played=+0.00, stat_efficiency=+0.88, team_context=+1.45, usage_share=+7.13, weighted_ppg=16.42 |
| 9 | Nick Mullens | QB | JAC | 15.65 | -0.01 | -15.66 | 15.66 | injury | 5 | age_curve=-0.04, games_played=-2.01, stat_efficiency=+4.32, team_context=-0.13, usage_share=+8.16, weighted_ppg=5.36 |
| 10 | Tanner McKee | QB | PHI | 17.86 | 3.44 | -14.42 | 14.42 | injury | 4 | age_curve=+0.36, games_played=+0.00, stat_efficiency=None, team_context=+3.09, usage_share=None, weighted_ppg=14.41 |

## All Players (sorted by |Error|)

| Player | Pos | Projected | Actual | Error | Category |
| --- | --- | --- | --- | --- | --- |
| Jacoby Brissett | QB | 70.34 | 16.17 | -54.17 | bust |
| Carson Wentz | QB | 66.00 | 13.87 | -52.13 | injury |
| Marcus Mariota | QB | 42.97 | 11.32 | -31.65 | bust |
| Aaron Rodgers | QB | 38.40 | 14.10 | -24.30 | bust |
| Joe Milton | QB | 22.04 | 2.58 | -19.46 | injury |
| Jerome Ford | RB | 20.32 | 2.35 | -17.97 | bust |
| Christian Kirk | WR | 22.83 | 5.95 | -16.88 | bust |
| Justin Jefferson | WR | 26.20 | 9.38 | -16.82 | bust |
| Nick Mullens | QB | 15.65 | -0.01 | -15.66 | injury |
| Tanner McKee | QB | 17.86 | 3.44 | -14.42 | injury |
| Raheem Mostert | RB | 15.51 | 1.95 | -13.56 | bust |
| Aaron Jones | RB | 21.61 | 8.72 | -12.89 | bust |
| Isiah Pacheco | RB | 18.73 | 5.98 | -12.75 | bust |
| Brian Robinson | RB | 15.91 | 3.44 | -12.47 | bust |
| Jordan Love | QB | 4.07 | 16.48 | +12.41 | breakout |
| Cooper Rush | QB | 12.67 | 0.43 | -12.24 | injury |
| Trey McBride | TE | 2.88 | 14.88 | +12.00 | breakout |
| Tyreek Hill | WR | 22.63 | 10.75 | -11.88 | injury |
| Rico Dowdle | RB | 0.00 | 11.58 | +11.58 | breakout |
| Kyren Williams | RB | 3.76 | 15.18 | +11.42 | breakout |
| J.K. Dobbins | RB | 21.96 | 11.04 | -10.92 | injury |
| Malik Willis | QB | 2.17 | 12.79 | +10.62 | injury |
| Brian Thomas | WR | 18.77 | 8.24 | -10.53 | rookie_bust |
| Keenan Allen | WR | 18.82 | 8.36 | -10.46 | bust |
| Jayden Daniels | QB | 26.57 | 16.18 | -10.39 | injury |
| Cole Kmet | TE | 13.59 | 3.76 | -9.83 | bust |
| Jonathan Taylor | RB | 10.33 | 19.96 | +9.63 | breakout |
| Xavier Worthy | WR | 15.67 | 6.35 | -9.32 | rookie_bust |
| Kenny Pickett | QB | 10.22 | 1.29 | -8.93 | injury |
| Chase Brown | RB | 5.70 | 14.59 | +8.89 | breakout |
| Deebo Samuel | WR | 18.24 | 9.51 | -8.73 | bust |
| Nick Chubb | RB | 13.14 | 4.60 | -8.54 | bust |
| Gardner Minshew | QB | 8.42 | -0.08 | -8.50 | injury |
| A.J. Brown | WR | 20.66 | 12.27 | -8.39 | bust |
| Mark Andrews | TE | 14.50 | 6.29 | -8.21 | bust |
| Dameon Pierce | RB | 8.89 | 0.72 | -8.17 | injury |
| Davis Mills | QB | 3.19 | 11.27 | +8.08 | injury |
| Brock Purdy | QB | 28.19 | 20.20 | -7.99 | injury |
| Isaac Guerendo | RB | 7.80 | 0.00 | -7.80 | rookie_bust |
| Johnny Mundt | TE | 8.76 | 0.97 | -7.79 | bust |
| Tyrod Taylor | QB | 2.26 | 9.91 | +7.65 | injury |
| Jaylen Waddle | WR | 17.51 | 10.13 | -7.38 | bust |
| Ladd McConkey | WR | 16.18 | 8.89 | -7.29 | rookie_bust |
| Adam Thielen | WR | 9.24 | 1.98 | -7.26 | bust |
| Jalen McMillan | WR | 13.10 | 5.97 | -7.13 | injury |
| Ray Davis | RB | 10.59 | 3.48 | -7.11 | rookie_bust |
| Jalen Hurts | QB | 24.98 | 17.93 | -7.05 | bust |
| Tucker Kraft | TE | 5.74 | 12.65 | +6.91 | injury |
| Bijan Robinson | RB | 12.65 | 19.49 | +6.84 | breakout |
| Younghoe Koo | K | 11.57 | 4.83 | -6.74 | injury |
| Jaxon Smith-Njigba | WR | 10.83 | 17.49 | +6.66 | breakout |
| Patrick Mahomes | QB | 26.79 | 20.23 | -6.56 | bust |
| Chris Olave | WR | 20.18 | 13.62 | -6.56 | bust |
| Rashod Bateman | WR | 10.08 | 3.53 | -6.55 | bust |
| Jameson Williams | WR | 4.54 | 11.02 | +6.48 | breakout |
| Jayden Reed | WR | 12.03 | 5.57 | -6.46 | injury |
| DeVonta Smith | WR | 16.42 | 10.07 | -6.35 | bust |
| Josh Allen | QB | 27.78 | 21.48 | -6.30 | bust |
| Kylen Granson | TE | 6.69 | 0.44 | -6.25 | bust |
| Tyler Conklin | TE | 7.30 | 1.06 | -6.24 | bust |
| Geno Smith | QB | 17.75 | 11.53 | -6.22 | bust |
| Joe Burrow | QB | 22.97 | 16.81 | -6.16 | injury |
| Noah Gray | TE | 7.91 | 1.77 | -6.14 | bust |
| Matthew Stafford | QB | 15.86 | 21.98 | +6.12 | breakout |
| Brenton Strange | TE | 1.38 | 7.42 | +6.04 | breakout |
| Travis Kelce | TE | 15.08 | 9.13 | -5.95 | rookie_bust |
| Keon Coleman | WR | 12.32 | 6.42 | -5.90 | rookie_bust |
| Russell Wilson | QB | 14.18 | 8.31 | -5.87 | injury |
| C.J. Stroud | QB | 20.70 | 14.84 | -5.86 | bust |
| Justin Herbert | QB | 22.60 | 16.81 | -5.79 | bust |
| Mason Rudolph | QB | 8.69 | 3.02 | -5.67 | injury |
| Joe Flacco | QB | 16.77 | 11.13 | -5.64 | bust |
| T.J. Hockenson | TE | 11.44 | 5.82 | -5.62 | bust |
| Zach Charbonnet | RB | 5.21 | 10.71 | +5.50 | rookie_breakout |
| Jordan Addison | WR | 13.61 | 8.15 | -5.46 | bust |
| Rachaad White | RB | 12.69 | 7.24 | -5.45 | bust |
| Breece Hall | RB | 17.29 | 11.85 | -5.44 | bust |
| Devin Culp | TE | 5.96 | 0.55 | -5.41 | rookie_bust |
| Jake Elliott | K | 11.66 | 6.35 | -5.31 | bust |
| Isaiah Likely | TE | 8.52 | 3.44 | -5.08 | bust |
| Joshua Dobbs | QB | 5.54 | 0.53 | -5.01 | injury |
| Andy Dalton | QB | 7.39 | 2.38 | -5.01 | injury |
| Dawson Knox | TE | 10.03 | 5.04 | -4.99 | bust |
| Ja'Marr Chase | WR | 20.66 | 15.69 | -4.97 | bust |
| Jake Ferguson | TE | 3.69 | 8.65 | +4.96 | breakout |
| Drake London | WR | 9.09 | 13.99 | +4.90 | breakout |
| Tua Tagovailoa | QB | 16.26 | 11.41 | -4.85 | rookie_bust |
| Nico Collins | WR | 7.84 | 12.69 | +4.85 | breakout |
| George Pickens | WR | 9.59 | 14.44 | +4.85 | breakout |
| Saquon Barkley | RB | 18.08 | 13.25 | -4.83 | bust |
| Courtland Sutton | WR | 5.96 | 10.75 | +4.79 | breakout |
| Javonte Williams | RB | 9.36 | 14.08 | +4.72 | breakout |
| Roschon Johnson | RB | 4.89 | 0.24 | -4.65 | injury |
| Chris Godwin | WR | 12.03 | 7.39 | -4.64 | injury |
| Matt Gay | K | 11.71 | 7.08 | -4.63 | bust |
| Brock Bowers | TE | 16.63 | 12.02 | -4.61 | rookie_bust |
| Justice Hill | RB | 10.02 | 5.47 | -4.55 | injury |
| Bryce Young | QB | 9.83 | 14.37 | +4.54 | breakout |
| Wan'Dale Robinson | WR | 6.21 | 10.74 | +4.53 | breakout |
| Dak Prescott | QB | 13.79 | 18.28 | +4.49 | breakout |
| Jordan Mason | RB | 3.13 | 7.62 | +4.49 | breakout |
| Will Dissly | TE | 6.12 | 1.69 | -4.43 | injury |
| Zane Gonzalez | K | 5.80 | 10.22 | +4.42 | injury |
| Dyami Brown | WR | 7.23 | 2.84 | -4.39 | bust |
| Sam LaPorta | TE | 13.97 | 9.66 | -4.31 | injury |
| Matthew Wright | K | 9.77 | 5.50 | -4.27 | injury |
| Michael Wilson | WR | 6.42 | 10.68 | +4.26 | breakout |
| Spencer Shrader | K | 6.98 | 11.20 | +4.22 | injury |
| Jonnu Smith | TE | 7.54 | 3.36 | -4.18 | bust |
| George Kittle | TE | 16.26 | 12.09 | -4.17 | bust |
| Joshua Karty | K | 10.42 | 6.25 | -4.17 | injury |
| Taysom Hill | TE | 6.93 | 2.79 | -4.14 | rookie_bust |
| Caleb Williams | QB | 14.48 | 18.56 | +4.08 | rookie_breakout |
| Josh Johnson | QB | 0.97 | 4.88 | +3.91 | injury |
| Kyle Pitts | TE | 5.92 | 9.81 | +3.89 | breakout |
| Noah Fant | TE | 7.71 | 3.85 | -3.86 | bust |
| Khalil Shakir | WR | 12.29 | 8.45 | -3.84 | bust |
| Will Reichard | K | 13.04 | 9.24 | -3.80 | rookie_bust |
| Mitchell Trubisky | QB | 11.30 | 7.53 | -3.77 | injury |
| Kirk Cousins | QB | 14.00 | 10.35 | -3.65 | injury |
| Cam Little | K | 5.73 | 9.35 | +3.62 | rookie_breakout |
| CeeDee Lamb | WR | 15.27 | 11.67 | -3.60 | bust |
| Will Shipley | RB | 4.36 | 0.77 | -3.59 | rookie_bust |
| Drew Lock | QB | 3.59 | 0.02 | -3.57 | injury |
| Graham Gano | K | 4.04 | 7.60 | +3.56 | injury |
| Daniel Carlson | K | 9.26 | 5.71 | -3.55 | bust |
| David Montgomery | RB | 12.64 | 9.11 | -3.53 | bust |
| Luke Musgrave | TE | 5.71 | 2.22 | -3.49 | bust |
| Trey Lance | QB | 6.72 | 3.38 | -3.34 | injury |
| Jason Myers | K | 8.10 | 11.41 | +3.31 | breakout |
| Mac Jones | QB | 13.13 | 9.83 | -3.30 | bust |
| Grant Calcaterra | TE | 4.50 | 1.21 | -3.29 | bust |
| Jauan Jennings | WR | 6.01 | 9.28 | +3.27 | breakout |
| Jake Bates | K | 11.65 | 8.41 | -3.24 | rookie_bust |
| Malik Nabers | WR | 15.26 | 12.03 | -3.23 | injury |
| Spencer Rattler | QB | 7.72 | 10.90 | +3.18 | injury |
| Trevor Lawrence | QB | 16.72 | 19.89 | +3.17 | rookie_breakout |
| Pat Freiermuth | TE | 8.52 | 5.36 | -3.16 | bust |
| Trey Benson | RB | 4.10 | 7.22 | +3.12 | injury |
| Travis Etienne | RB | 10.76 | 13.88 | +3.12 | rookie_breakout |
| Baker Mayfield | QB | 12.83 | 15.88 | +3.05 | breakout |
| Stefon Diggs | WR | 12.92 | 9.91 | -3.01 | bust |
| Miles Sanders | RB | 8.66 | 5.67 | -2.99 | injury |
| Tyler Higbee | TE | 9.09 | 6.16 | -2.93 | injury |
| Hunter Henry | TE | 10.64 | 7.72 | -2.92 | normal |
| Bucky Irving | RB | 15.23 | 12.35 | -2.88 | injury |
| Chris Rodriguez | RB | 4.10 | 6.96 | +2.86 | normal |
| Tyrone Tracy | RB | 12.23 | 9.52 | -2.71 | rookie_bust |
| Foster Moreau | TE | 3.55 | 0.85 | -2.70 | normal |
| Cade Stover | TE | 4.39 | 1.69 | -2.70 | injury |
| Marvin Harrison | WR | 11.61 | 8.94 | -2.67 | rookie_bust |
| Evan McPherson | K | 10.29 | 7.65 | -2.64 | normal |
| D'Andre Swift | RB | 10.59 | 13.22 | +2.63 | normal |
| Mike Evans | WR | 11.31 | 8.72 | -2.59 | injury |
| Cade Otton | TE | 8.38 | 5.79 | -2.59 | normal |
| Blake Corum | RB | 4.65 | 7.19 | +2.54 | rookie_breakout |
| Justin Fields | QB | 18.02 | 15.52 | -2.50 | injury |
| Julian Hill | TE | 4.10 | 1.68 | -2.42 | normal |
| Joey Slye | K | 5.53 | 7.94 | +2.41 | normal |
| Calvin Ridley | WR | 7.91 | 5.54 | -2.37 | injury |
| Alec Pierce | WR | 8.29 | 10.65 | +2.36 | normal |
| Jahmyr Gibbs | RB | 16.98 | 19.32 | +2.34 | normal |
| Cameron Dicker | K | 11.71 | 9.41 | -2.30 | normal |
| Ricky Pearsall | WR | 9.22 | 7.04 | -2.18 | injury |
| Tank Bigsby | RB | 5.26 | 3.08 | -2.18 | normal |
| Tony Pollard | RB | 12.12 | 9.96 | -2.16 | rookie_bust |
| Rashid Shaheed | WR | 4.69 | 6.81 | +2.12 | normal |
| Theo Johnson | TE | 4.92 | 7.02 | +2.10 | rookie_breakout |
| Puka Nacua | WR | 17.94 | 20.04 | +2.10 | normal |
| Harrison Butker | K | 10.28 | 8.24 | -2.04 | normal |
| Mike Gesicki | TE | 6.39 | 4.36 | -2.03 | normal |
| Alvin Kamara | RB | 9.65 | 7.65 | -2.00 | normal |
| Cairo Santos | K | 6.47 | 8.47 | +2.00 | normal |
| Davante Adams | WR | 15.95 | 13.96 | -1.99 | normal |
| Ben Sinnott | TE | 3.38 | 1.43 | -1.95 | rookie_bust |
| Luke Schoonmaker | TE | 3.14 | 1.19 | -1.95 | normal |
| Dalton Kincaid | TE | 10.82 | 8.88 | -1.94 | normal |
| Chris Boswell | K | 10.00 | 8.06 | -1.94 | normal |
| Josh Downs | WR | 8.60 | 6.71 | -1.89 | normal |
| Juwan Johnson | TE | 6.43 | 8.32 | +1.89 | normal |
| Darnell Mooney | WR | 6.29 | 4.42 | -1.87 | normal |
| James Cook | RB | 17.90 | 16.06 | -1.84 | normal |
| Chase McLaughlin | K | 10.58 | 8.76 | -1.82 | normal |
| Ka'imi Fairbairn | K | 11.07 | 12.87 | +1.80 | normal |
| Kenneth Walker | RB | 12.18 | 10.38 | -1.80 | normal |
| Jared Goff | QB | 19.26 | 17.47 | -1.79 | normal |
| Darnell Washington | TE | 1.85 | 3.62 | +1.77 | normal |
| Quentin Johnston | WR | 7.30 | 9.06 | +1.76 | normal |
| Daniel Jones | QB | 15.60 | 17.34 | +1.74 | normal |
| Tyler Allgeier | RB | 8.55 | 6.82 | -1.73 | normal |
| Jakobi Meyers | WR | 9.59 | 7.89 | -1.70 | normal |
| Josh Jacobs | RB | 16.26 | 14.61 | -1.65 | normal |
| Josh Whyle | TE | 3.30 | 1.66 | -1.64 | injury |
| Brandon McManus | K | 9.17 | 7.57 | -1.60 | normal |
| Jaylen Warren | RB | 10.28 | 11.84 | +1.56 | normal |
| Brock Wright | TE | 4.26 | 2.71 | -1.55 | normal |
| Jerry Jeudy | WR | 7.17 | 5.63 | -1.54 | normal |
| Terry McLaurin | WR | 10.94 | 9.52 | -1.42 | injury |
| Evan Engram | TE | 6.46 | 5.04 | -1.42 | normal |
| De'Von Achane | RB | 19.47 | 18.08 | -1.39 | normal |
| Isaiah Davis | RB | 5.16 | 3.79 | -1.37 | rookie_bust |
| Matt Prater | K | 8.20 | 6.87 | -1.33 | normal |
| Kendre Miller | RB | 3.10 | 4.40 | +1.30 | injury |
| Rome Odunze | WR | 7.22 | 8.43 | +1.21 | rookie_breakout |
| Cooper Kupp | WR | 7.74 | 6.55 | -1.19 | normal |
| Lamar Jackson | QB | 17.62 | 16.45 | -1.17 | normal |
| Chuba Hubbard | RB | 8.50 | 7.36 | -1.14 | normal |
| Romeo Doubs | WR | 8.40 | 9.53 | +1.13 | normal |
| Tee Higgins | WR | 13.24 | 12.14 | -1.10 | normal |
| Jake Moody | K | 9.64 | 8.56 | -1.08 | injury |
| Blake Grupe | K | 8.61 | 7.56 | -1.05 | normal |
| Austin Hooper | TE | 1.65 | 2.69 | +1.04 | normal |
| Brandon Aubrey | K | 11.64 | 10.62 | -1.02 | normal |
| Dalton Schultz | TE | 9.09 | 8.12 | -0.97 | normal |
| Christian McCaffrey | RB | 19.96 | 20.93 | +0.97 | normal |
| DK Metcalf | WR | 11.14 | 10.17 | -0.97 | normal |
| Amon-Ra St. Brown | WR | 16.58 | 15.62 | -0.96 | normal |
| Garrett Wilson | WR | 10.69 | 11.64 | +0.95 | injury |
| Darren Waller | TE | 9.47 | 8.52 | -0.95 | injury |
| Tanner Hudson | TE | 3.50 | 2.55 | -0.95 | normal |
| Drake Maye | QB | 20.60 | 19.68 | -0.92 | rookie_bust |
| Dallas Goedert | TE | 11.25 | 10.34 | -0.91 | normal |
| David Njoku | TE | 4.94 | 5.82 | +0.88 | normal |
| Zay Flowers | WR | 12.62 | 11.78 | -0.84 | rookie_bust |
| Chad Ryland | K | 6.42 | 7.24 | +0.82 | normal |
| Jeremy Ruckert | TE | 2.88 | 2.08 | -0.80 | normal |
| Elijah Higgins | TE | 1.75 | 2.54 | +0.79 | normal |
| Michael Pittman | WR | 10.29 | 9.55 | -0.74 | normal |
| Michael Mayer | TE | 5.06 | 4.33 | -0.73 | normal |
| Derrick Henry | RB | 16.64 | 16.00 | -0.64 | normal |
| Demario Douglas | WR | 5.84 | 5.21 | -0.63 | normal |
| Jake Browning | QB | 9.12 | 9.75 | +0.63 | injury |
| Darius Slayton | WR | 5.11 | 5.74 | +0.63 | normal |
| Colby Parkinson | TE | 7.59 | 8.21 | +0.62 | normal |
| Quintin Morris | TE | 1.66 | 1.04 | -0.62 | normal |
| Braelon Allen | RB | 4.19 | 3.58 | -0.61 | injury |
| AJ Barner | TE | 5.93 | 6.54 | +0.61 | rookie_breakout |
| Adam Trautman | TE | 1.48 | 2.09 | +0.61 | normal |
| Daniel Bellinger | TE | 2.54 | 3.13 | +0.59 | normal |
| Stone Smartt | TE | 1.16 | 0.58 | -0.58 | normal |
| Rashee Rice | WR | 14.88 | 15.45 | +0.57 | injury |
| Kyler Murray | QB | 15.07 | 15.56 | +0.49 | injury |
| Josh Oliver | TE | 3.65 | 3.17 | -0.48 | normal |
| DJ Moore | WR | 8.52 | 8.98 | +0.46 | normal |
| Nick Folk | K | 7.42 | 7.88 | +0.46 | normal |
| Jaylen Wright | RB | 4.97 | 4.57 | -0.40 | injury |
| Sam Darnold | QB | 13.37 | 13.73 | +0.36 | normal |
| Michael Penix | QB | 12.90 | 13.25 | +0.35 | injury |
| Wil Lutz | K | 7.32 | 7.06 | -0.26 | rookie_bust |
| Bo Nix | QB | 17.95 | 17.70 | -0.25 | rookie_bust |
| Tyjae Spears | RB | 6.61 | 6.86 | +0.25 | normal |
| Ja'Tavion Sanders | TE | 3.28 | 3.04 | -0.24 | rookie_bust |
| Kareem Hunt | RB | 7.82 | 8.02 | +0.20 | normal |
| Eddy Pineiro | K | 9.76 | 9.93 | +0.17 | normal |
| Tommy Tremble | TE | 2.81 | 2.96 | +0.15 | rookie_breakout |
| Drew Sample | TE | 1.57 | 1.44 | -0.13 | normal |
| Marvin Mims | WR | 5.55 | 5.45 | -0.10 | normal |
| Tyler Huntley | QB | 7.98 | 8.03 | +0.05 | injury |
| Zach Ertz | TE | 7.84 | 7.80 | -0.04 | rookie_bust |
| Ty Johnson | RB | 5.18 | 5.19 | +0.01 | normal |
| Rhamondre Stevenson | RB | 11.02 | 11.01 | -0.01 | normal |
