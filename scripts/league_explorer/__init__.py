"""Explorer for public Ottoneu football league pages across the platform.

Discovers other leagues from player-card trade links, scrapes their public
pages (settings, standings history, trophies, finances, rosters) into a local
SQLite database, and offers canned cross-league reports plus ad-hoc SQL for
agents and scripts.

Entirely separate from the Supabase pipeline: writes only to
data/league_explorer/ (gitignored). See docs/references/league-explorer.md.
"""
