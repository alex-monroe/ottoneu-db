import { runArbitrationSimulation } from "./web/lib/simulation";

const mockPlayers = Array.from({ length: 300 }).map((_, i) => ({
    player_id: `p${i}`,
    name: `Player ${i}`,
    position: 'QB',
    nfl_team: 'KC',
    price: Math.floor(Math.random() * 20),
    team_name: `Team ${i % 12}`,
    birth_date: null,
    is_college: false,
    total_points: Math.random() * 300,
    games_played: 17,
    snaps: 1000,
    ppg: Math.random() * 20,
    pps: 0.1,
}));

console.time('runArbitrationSimulation (N=1000)');
runArbitrationSimulation(mockPlayers, 1000);
console.timeEnd('runArbitrationSimulation (N=1000)');

console.time('runArbitrationSimulation (N=5000)');
runArbitrationSimulation(mockPlayers, 5000);
console.timeEnd('runArbitrationSimulation (N=5000)');
