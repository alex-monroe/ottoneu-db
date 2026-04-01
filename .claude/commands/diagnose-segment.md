---
description: Deep-dive accuracy analysis for a specific player segment
---
Follow these steps to diagnose projection accuracy for a specific player segment:

// turbo

1. **Parse the segment description from arguments.** Examples: "bench WR", "elite QB", "rookies", "age 30+", "high-usage RB". If no segment specified, ask the user.

2. **Run segment analysis** to get accuracy broken down by segments:
   ```bash
   source venv/bin/activate && python scripts/feature_projections/cli.py segment-analysis \
     --models v1_baseline_weighted_ppg,v14_qb_starter,v20_learned_usage \
     --seasons 2022,2023,2024,2025
   ```

3. **Run per-player diagnostics** for detailed player-level view:
   ```bash
   source venv/bin/activate && python scripts/feature_projections/cli.py diagnostics \
     --model v20_learned_usage --season 2025 --top 50 \
     --output docs/generated/player-diagnostics.md
   ```

4. **Read and filter** the generated reports to the requested segment. Look at:
   - `docs/generated/segment-analysis.md` for segment-level metrics
   - `docs/generated/player-diagnostics.md` for individual players

5. **Present segment-specific metrics:**
   ```
   Segment: Bench-tier WR (rank > 24)
   Model              | MAE   | Bias    | R²    | N
   v1_baseline        | 2.81  | -1.05   | 0.210 | 87
   v14_qb_starter     | 2.78  | -1.27   | 0.220 | 87
   v20_learned_usage  | 2.65  | -0.90   | 0.255 | 87
   ```

6. **List players in the segment** with their projected vs actual:
   ```
   Player         | Projected | Actual | Error  | Category
   John Smith     | 4.50      | 2.10   | -2.40  | bust
   Jane Doe       | 3.80      | 6.50   | +2.70  | breakout
   ```

7. **Identify systematic patterns:**
   - Is the segment consistently over-projected or under-projected?
   - Are errors correlated with specific features (e.g., age, usage share)?
   - Are certain error categories dominant (breakout, bust, injury)?

8. **Suggest potential improvements:**
   - Which features might address the gap?
   - Would a segment-specific weight adjustment help?
   - Is this a data quality issue or a modeling issue?
