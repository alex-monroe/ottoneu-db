# Database

## Entity Relationship

```mermaid
erDiagram
    players {
        uuid id PK
        int ottoneu_id UK
        text name
        text position
        text nfl_team
        date birth_date
    }

    player_stats {
        uuid id PK
        uuid player_id FK
        int season
        numeric total_points
        int games_played
        int snaps
        numeric ppg
        numeric pps
    }

    league_prices {
        uuid id PK
        uuid player_id FK
        int league_id
        int price
        text team_name
    }

    transactions {
        uuid id PK
        uuid player_id FK
        int league_id
        int season
        text transaction_type
        text team_name
        int salary
        date transaction_date
    }

    surplus_adjustments {
        uuid id PK
        uuid player_id FK
        int league_id
        numeric adjustment
        text notes
    }

    player_projections {
        uuid id PK
        uuid player_id FK
        int season
        numeric projected_ppg
        text projection_method
    }

    players ||--o{ player_stats : "has seasons"
    players ||--o{ league_prices : "has prices"
    players ||--o{ transactions : "has transactions"
    players ||--o{ surplus_adjustments : "has adjustments"
    players ||--o{ player_projections : "has projections"
```

## Schema Details

Six tables, all with UUID primary keys:

- **`players`** — Player metadata. Unique on `ottoneu_id`.
- **`player_stats`** — Season statistics. FK to `players`, unique on `(player_id, season)`.
- **`league_prices`** — Current salaries. FK to `players`, unique on `(player_id, league_id)`.
- **`transactions`** — Event log of all roster moves (adds, cuts, trades, auctions).
- **`surplus_adjustments`** — Manual value overrides per player per league.
- **`player_projections`** — Calculated projection outputs from Python backend.

See `schema.sql` for full DDL and `migrations/` for incremental changes.

## Environment Variables

**Root `.env`** (for Python scripts):
- `SUPABASE_URL` — Supabase project URL
- `SUPABASE_KEY` — Supabase anon/service key

**`web/.env.local`** (for Next.js):
- `NEXT_PUBLIC_SUPABASE_URL` — Supabase project URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` — Supabase anon key
- `SUPABASE_SERVICE_ROLE_KEY` — Service role key (server-side only)

See `.env.example` and `web/.env.local.example` for templates.
