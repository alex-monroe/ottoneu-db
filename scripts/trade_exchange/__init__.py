"""Team exchange rates between this-season value and keeper value, from trades.

See docs/references/trade-exchange-rate.md. Modules:

- ``outlook``  — keeper outlooks per (player, season, as-of week), fitted in
  memory by ``scripts.keeper_value.publish.build`` and cached under ``.cache/``
  (never written to ``keeper_outlook``).
- ``features`` — one row per trade side: prorated this-season net, keeper
  option-value net, playoff odds at trade time, votes.
- ``fit``      — the pooled descriptive read and the slope-on-odds fit, with
  bootstrap intervals; ``just trade-exchange`` runs it end to end.
"""
