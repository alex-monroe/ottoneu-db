/**
 * NFL division mapping. Used to group teams on the vegas-lines page so
 * preseason expectations are easy to compare against divisional rivals.
 *
 * Codes match nflverse / `team_vegas_lines.team` (modern 32-team set,
 * 2016+). Teams that have moved cities (OAK→LV, SD→LAC, STL→LA) appear
 * under their current code only.
 */

export type Conference = "AFC" | "NFC";
export type DivisionDirection = "East" | "North" | "South" | "West";

export interface DivisionEntry {
  conference: Conference;
  direction: DivisionDirection;
  teams: readonly TeamEntry[];
}

export interface TeamEntry {
  code: string;
  name: string;
}

export const DIVISIONS: readonly DivisionEntry[] = [
  {
    conference: "AFC",
    direction: "East",
    teams: [
      { code: "BUF", name: "Bills" },
      { code: "MIA", name: "Dolphins" },
      { code: "NE", name: "Patriots" },
      { code: "NYJ", name: "Jets" },
    ],
  },
  {
    conference: "AFC",
    direction: "North",
    teams: [
      { code: "BAL", name: "Ravens" },
      { code: "CIN", name: "Bengals" },
      { code: "CLE", name: "Browns" },
      { code: "PIT", name: "Steelers" },
    ],
  },
  {
    conference: "AFC",
    direction: "South",
    teams: [
      { code: "HOU", name: "Texans" },
      { code: "IND", name: "Colts" },
      { code: "JAX", name: "Jaguars" },
      { code: "TEN", name: "Titans" },
    ],
  },
  {
    conference: "AFC",
    direction: "West",
    teams: [
      { code: "DEN", name: "Broncos" },
      { code: "KC", name: "Chiefs" },
      { code: "LAC", name: "Chargers" },
      { code: "LV", name: "Raiders" },
    ],
  },
  {
    conference: "NFC",
    direction: "East",
    teams: [
      { code: "DAL", name: "Cowboys" },
      { code: "NYG", name: "Giants" },
      { code: "PHI", name: "Eagles" },
      { code: "WAS", name: "Commanders" },
    ],
  },
  {
    conference: "NFC",
    direction: "North",
    teams: [
      { code: "CHI", name: "Bears" },
      { code: "DET", name: "Lions" },
      { code: "GB", name: "Packers" },
      { code: "MIN", name: "Vikings" },
    ],
  },
  {
    conference: "NFC",
    direction: "South",
    teams: [
      { code: "ATL", name: "Falcons" },
      { code: "CAR", name: "Panthers" },
      { code: "NO", name: "Saints" },
      { code: "TB", name: "Buccaneers" },
    ],
  },
  {
    conference: "NFC",
    direction: "West",
    teams: [
      { code: "ARI", name: "Cardinals" },
      { code: "LA", name: "Rams" },
      { code: "SEA", name: "Seahawks" },
      { code: "SF", name: "49ers" },
    ],
  },
];

export const TEAM_NAME_BY_CODE: Record<string, string> = Object.fromEntries(
  DIVISIONS.flatMap((d) => d.teams.map((t) => [t.code, t.name])),
);
