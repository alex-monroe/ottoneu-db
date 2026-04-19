import { calculateMetrics, calculateMetricsByPosition } from '@/app/projection-accuracy/metrics';
import { BacktestPlayer } from '@/lib/types';

describe('Projection Accuracy Metrics', () => {
  const mockPlayers: BacktestPlayer[] = [
    {
      player_id: "1",
      name: "Player 1",
      position: "QB",
      nfl_team: "Team A",
      team_name: "Owner A",
      price: 10,
      seasons_used: "2022",
      games_played: 16,
      projection_method: "weighted",
      projected_ppg: 10,
      actual_ppg: 15, // error = 5, abs_error = 5
      error: 5,
      abs_error: 5,
    },
    {
      player_id: "2",
      name: "Player 2",
      position: "QB",
      nfl_team: "Team B",
      team_name: "Owner B",
      price: 15,
      seasons_used: "2021, 2022",
      games_played: 16,
      projection_method: "weighted",
      projected_ppg: 20,
      actual_ppg: 15, // error = -5, abs_error = 5
      error: -5,
      abs_error: 5,
    },
    {
      player_id: "3",
      name: "Player 3",
      position: "RB",
      nfl_team: "Team C",
      team_name: "Owner C",
      price: 20,
      seasons_used: "2023",
      games_played: 14,
      projection_method: "rookie_trajectory",
      projected_ppg: 12,
      actual_ppg: 12, // error = 0, abs_error = 0
      error: 0,
      abs_error: 0,
    }
  ];

  describe('calculateMetrics', () => {
    it('returns zeroes for an empty array', () => {
      const result = calculateMetrics([]);
      expect(result).toEqual({
        position: 'ALL',
        count: 0,
        mae: 0,
        bias: 0,
        r2: 0,
        rmse: 0,
      });
    });

    it('calculates metrics correctly for a single player', () => {
      const result = calculateMetrics([mockPlayers[0]]);
      expect(result).toEqual({
        position: 'ALL',
        count: 1,
        mae: 5,
        bias: 5,
        r2: 0, // ss_tot is 0, so r2 should be 0 based on the formula
        rmse: Math.sqrt(25), // 5
      });
    });

    it('calculates metrics correctly for multiple players', () => {
      const result = calculateMetrics(mockPlayers);
      expect(result.count).toBe(3);
      // MAE: (5 + 5 + 0) / 3 = 10 / 3 = 3.333...
      expect(result.mae).toBeCloseTo(3.3333, 4);
      // Bias: (5 - 5 + 0) / 3 = 0
      expect(result.bias).toBe(0);

      // Mean Actual: (15 + 15 + 12) / 3 = 42 / 3 = 14
      // SS_Tot: (15-14)^2 + (15-14)^2 + (12-14)^2 = 1 + 1 + 4 = 6
      // SS_Res: (15-10)^2 + (15-20)^2 + (12-12)^2 = 25 + 25 + 0 = 50
      // R2: max(0, 1 - (50/6)) = max(0, 1 - 8.33) = 0
      expect(result.r2).toBe(0);

      // RMSE: sqrt(50 / 3) = sqrt(16.666)
      expect(result.rmse).toBeCloseTo(4.0825, 4);
    });
  });

  describe('calculateMetricsByPosition', () => {
    it('groups players by position correctly and calculates metrics', () => {
      const positions = ['QB', 'RB'];
      const results = calculateMetricsByPosition(mockPlayers, positions);

      expect(results.length).toBe(3); // ALL + 2 positions

      expect(results[0].position).toBe('ALL');
      expect(results[0].count).toBe(3);

      expect(results[1].position).toBe('QB');
      expect(results[1].count).toBe(2);
      expect(results[1].mae).toBe(5); // (5 + 5) / 2
      expect(results[1].bias).toBe(0); // (5 - 5) / 2

      expect(results[2].position).toBe('RB');
      expect(results[2].count).toBe(1);
      expect(results[2].mae).toBe(0);
    });

    it('handles empty groups safely', () => {
      const positions = ['TE']; // TE doesn't exist in mockPlayers
      const results = calculateMetricsByPosition(mockPlayers, positions);

      expect(results.length).toBe(2); // ALL + 1 position
      expect(results[1].position).toBe('TE');
      expect(results[1].count).toBe(0);
      expect(results[1].mae).toBe(0);
    });

    it('ignores players with positions not in the requested positions array', () => {
      const positions = ['RB'];
      const results = calculateMetricsByPosition(mockPlayers, positions);

      expect(results.length).toBe(2); // ALL + 1 position
      expect(results[1].position).toBe('RB');
      expect(results[1].count).toBe(1);

      // The 'ALL' metric still includes all players because calculateMetrics(players, 'ALL') is called on the full array
      expect(results[0].count).toBe(3);
    });
  });
});
