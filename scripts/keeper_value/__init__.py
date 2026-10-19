"""Keeper option value: what a contract is worth to keep next season.

Ottoneu offseason cuts are free, so a keeper is a call option on next season's
value: worth E[max(0, V_next − salary_next)], not E[V_next] − salary_next. This
package estimates the distribution of V_next for every NFL skill player from an
empirical population prior (position × years in league × draft round) shifted
by the player's own production and usage, with the weight on his own data
growing with the games behind it.

- ``nflverse``  — download + cache the weekly stats, snap counts and player file.
- ``market``    — the /value VORP → $ market, ported from web/lib/surplus.ts.
- ``dataset``   — one row per player-season "as of" an NFL week, plus outcome.
- ``model``     — the prior, the shrunk individual adjustment, the quantiles.
- ``evaluate``  — CRPS, option-value error, P(keepable) calibration.
- ``backtest``  — leakage-free rolling-origin comparison (``just keeper-backtest``).
- ``publish``   — fit and write ``keeper_outlook`` (``just keeper-publish``).

See docs/references/keeper-value.md.
"""
