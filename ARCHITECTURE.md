# Architecture

## System Overview

```mermaid
graph TD
    subgraph Data Collection
        E[enqueue.py] -->|insert jobs| SJ[scraper_jobs table]
        SJ -->|poll| W[worker.py]
        W -->|dispatch| T1[pull_nfl_stats]
        W -->|dispatch| T2[scrape_roster]
        W -->|dispatch| T3[scrape_player_card]
    end

    subgraph External Sources
        NFL[nfl_data_py API] --> T1
        OTT[Ottoneu Website] -->|Playwright| T2
        OTT -->|Playwright| T3
    end

    subgraph Supabase PostgreSQL
        T1 -->|upsert| PS[player_stats]
        T2 -->|upsert| P[players]
        T2 -->|upsert| LP[league_prices]
        T2 -->|upsert| PS
        T3 -->|upsert| TX[transactions]
    end

    subgraph Analysis Pipeline
        P & PS & LP & TX --> A1[analyze_projected_salary.py]
        A1 --> A2[analyze_vorp.py]
        A2 --> A3[analyze_surplus_value.py]
        A3 --> A4[analyze_arbitration.py]
        A4 --> A5[analyze_arbitration_simulation.py]
        A2 -->|calculate_vorp| A3
        A3 -->|calculate_surplus| A4
    end

    subgraph Next.js Frontend
        P & PS & LP & TX -->|@supabase/supabase-js| WEB[Next.js App Router]
        WEB --> PG1["/ — Player Efficiency"]
        WEB --> PG2["/projected-salary — Keep/Cut"]
        WEB --> PG3["/vorp — VORP Analysis"]
        WEB --> PG4["/surplus-value — Surplus Rankings"]
        WEB --> PG5["/arbitration — Arb Targets"]
        WEB --> PG6["/players — Player Cards"]
        WEB --> PG7["/rosters — Team Rosters"]
    end
```

## Database Entity Relationship

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

## Analysis Pipeline Dependency Order

```mermaid
graph LR
    PS[analyze_projected_salary] --> VORP[analyze_vorp]
    VORP --> SV[analyze_surplus_value]
    SV --> ARB[analyze_arbitration]
    ARB --> SIM[analyze_arbitration_simulation]

    style PS fill:#3B82F6,color:#fff
    style VORP fill:#10B981,color:#fff
    style SV fill:#F59E0B,color:#fff
    style ARB fill:#EF4444,color:#fff
    style SIM fill:#8B5CF6,color:#fff
```

Key dependencies:
- `analyze_vorp.py` exports `calculate_vorp()` used by surplus value
- `analyze_surplus_value.py` exports `calculate_surplus()` used by arbitration
- All scripts share config from `scripts/config.py` and helpers from `scripts/analysis_utils.py`

## Frontend Component Hierarchy

```mermaid
graph TD
    Layout[layout.tsx] --> Nav[Navigation.tsx]
    Layout --> Pages

    subgraph Pages
        Home["/ page.tsx"]
        PS["/projected-salary"]
        VORP["/vorp"]
        SV["/surplus-value"]
        ARB["/arbitration"]
        Players["/players"]
        Rosters["/rosters"]
    end

    subgraph Shared Components
        DT[DataTable.tsx]
        SC[ScatterChart.tsx]
        PF[PositionFilter.tsx]
        SMC[SummaryCard.tsx]
        MT[ModeToggle.tsx]
        PSR[PlayerSearch.tsx]
    end

    Home --> SC & PF
    PS --> DT & SMC
    VORP --> DT & PF & SMC
    SV --> DT & PF & SMC
    ARB --> DT & MT & SMC
    Players --> DT & PSR

    subgraph Shared Libraries
        AN[lib/analysis.ts]
        AL[lib/arb-logic.ts]
        CF[lib/config.ts]
        TY[lib/types.ts]
        PL[lib/players.ts]
        CO[lib/columns.ts]
    end
```

## Configuration Sync

Two config files must stay in sync:

| Python (`scripts/config.py`) | TypeScript (`web/lib/config.ts`) |
|------------------------------|----------------------------------|
| `LEAGUE_ID = 309` | `export const LEAGUE_ID = 309` |
| `SEASON = 2025` | `export const SEASON = 2025` |
| `MY_TEAM = "The Witchcraft"` | `export const MY_TEAM = "The Witchcraft"` |
| `NUM_TEAMS = 12` | `export const NUM_TEAMS = 12` |
| `CAP_PER_TEAM = 400` | `export const CAP_PER_TEAM = 400` |
| `REPLACEMENT_LEVEL = {...}` | `export const REPLACEMENT_LEVEL = {...}` |

When updating any constant, **update both files**.
