---
description: Deep-dive accuracy analysis for a specific player segment
---
Diagnose projection accuracy for a specific player segment. Segment analysis and
per-player diagnostics are **descriptive** tools — they surface *where* error
concentrates. Any model-change idea they motivate must still be validated on the
held-out harness (`/experiment`), never on the in-sample segment numbers.

// turbo

1. **Parse the segment** from arguments (e.g. "bench WR", "elite QB", "age 30+",
   "high-usage RB"). If none given, ask the user.

2. **Confirm the active model** with `just list-models --check` (reads
   `projection_models.is_active`; substitute its output for `<active>` below).

3. **Run segment analysis** across the active model + an additive reference + the naïve
   baseline (use `venv/bin/python` directly — no `source venv/bin/activate`):
   ```bash
   venv/bin/python scripts/feature_projections/cli.py segment-analysis \
     --models <active>,v14_qb_starter,naive_prior_season_ppg \
     --seasons 2022,2023,2024,2025
   ```

4. **Run per-player diagnostics** for the player-level view:
   ```bash
   venv/bin/python scripts/feature_projections/cli.py diagnostics \
     --model <active> --season 2025 --top 50 \
     --output docs/generated/player-diagnostics.md
   ```

5. **Read and filter** `docs/generated/segment-analysis.md` and
   `docs/generated/player-diagnostics.md` to the requested segment.

6. **Present segment metrics** (MAE, Bias, R², N per model) and **list the
   players** with projected vs actual and an over/under-projection label.

7. **Identify systematic patterns** — is the segment consistently over/under-
   projected? Are errors correlated with a feature (age, usage, depth role)? Note
   that these are in-sample observations on the full history.

8. **Propose improvements as hypotheses, not conclusions.** For any proposed
   feature or weight change, hand off to `/experiment` to get a held-out,
   significance-tested verdict vs the active model (from `just list-models --check`)
   before trusting it. Be alert to
   the level-vs-ordering split (#579/#598): a segment can be biased in level while
   still ranked correctly, which changes whether a fix is even worth making.
