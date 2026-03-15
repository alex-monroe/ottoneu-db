export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      players: {
        Row: {
          id: string
          ottoneu_id: number
          name: string
          position: string | null
          nfl_team: string | null
          is_college: boolean
          created_at: string
          updated_at: string
          birth_date: string | null
        }
        Insert: {
          id?: string
          ottoneu_id: number
          name: string
          position?: string | null
          nfl_team?: string | null
          is_college?: boolean
          created_at?: string
          updated_at?: string
          birth_date?: string | null
        }
        Update: {
          id?: string
          ottoneu_id?: number
          name?: string
          position?: string | null
          nfl_team?: string | null
          is_college?: boolean
          created_at?: string
          updated_at?: string
          birth_date?: string | null
        }
        Relationships: []
      }
      player_stats: {
        Row: {
          id: string
          player_id: string
          season: number
          total_points: number | null
          games_played: number | null
          snaps: number | null
          ppg: number | null
          pps: number | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          player_id: string
          season: number
          total_points?: number | null
          games_played?: number | null
          snaps?: number | null
          ppg?: number | null
          pps?: number | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          player_id?: string
          season?: number
          total_points?: number | null
          games_played?: number | null
          snaps?: number | null
          ppg?: number | null
          pps?: number | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      league_prices: {
        Row: {
          id: string
          player_id: string
          league_id: number
          price: number
          team_name: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          player_id: string
          league_id: number
          price: number
          team_name?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          player_id?: string
          league_id?: number
          price?: number
          team_name?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      transactions: {
        Row: {
          id: string
          player_id: string
          league_id: number
          season: number
          transaction_type: string
          team_name: string | null
          from_team: string | null
          salary: number | null
          transaction_date: string | null
          raw_description: string | null
          scraped_at: string
        }
        Insert: {
          id?: string
          player_id: string
          league_id: number
          season: number
          transaction_type: string
          team_name?: string | null
          from_team?: string | null
          salary?: number | null
          transaction_date?: string | null
          raw_description?: string | null
          scraped_at?: string
        }
        Update: {
          id?: string
          player_id?: string
          league_id?: number
          season?: number
          transaction_type?: string
          team_name?: string | null
          from_team?: string | null
          salary?: number | null
          transaction_date?: string | null
          raw_description?: string | null
          scraped_at?: string
        }
        Relationships: []
      }
      users: {
        Row: {
          id: string
          email: string
          password_hash: string
          is_admin: boolean
          has_projections_access: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          email: string
          password_hash: string
          is_admin?: boolean
          has_projections_access?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          email?: string
          password_hash?: string
          is_admin?: boolean
          has_projections_access?: boolean
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      surplus_adjustments: {
        Row: {
          id: string
          player_id: string
          league_id: number
          user_id: string
          adjustment: number
          notes: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          player_id: string
          league_id: number
          user_id: string
          adjustment?: number
          notes?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          player_id?: string
          league_id?: number
          user_id?: string
          adjustment?: number
          notes?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      player_projections: {
        Row: {
          id: string
          player_id: string
          season: number
          projected_ppg: number
          projection_method: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          player_id: string
          season: number
          projected_ppg: number
          projection_method: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          player_id?: string
          season?: number
          projected_ppg?: number
          projection_method?: string
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      nfl_stats: {
        Row: {
          id: string
          player_id: string
          season: number
          games_played: number | null
          passing_yards: number | null
          passing_tds: number | null
          interceptions: number | null
          rushing_yards: number | null
          rushing_tds: number | null
          rushing_attempts: number | null
          receptions: number | null
          targets: number | null
          receiving_yards: number | null
          receiving_tds: number | null
          fg_made_0_39: number | null
          fg_made_40_49: number | null
          fg_made_50_plus: number | null
          pat_made: number | null
          offense_snaps: number | null
          defense_snaps: number | null
          st_snaps: number | null
          total_snaps: number | null
          total_points: number | null
          ppg: number | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          player_id: string
          season: number
          games_played?: number | null
          passing_yards?: number | null
          passing_tds?: number | null
          interceptions?: number | null
          rushing_yards?: number | null
          rushing_tds?: number | null
          rushing_attempts?: number | null
          receptions?: number | null
          targets?: number | null
          receiving_yards?: number | null
          receiving_tds?: number | null
          fg_made_0_39?: number | null
          fg_made_40_49?: number | null
          fg_made_50_plus?: number | null
          pat_made?: number | null
          offense_snaps?: number | null
          defense_snaps?: number | null
          st_snaps?: number | null
          total_snaps?: number | null
          total_points?: number | null
          ppg?: number | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          player_id?: string
          season?: number
          games_played?: number | null
          passing_yards?: number | null
          passing_tds?: number | null
          interceptions?: number | null
          rushing_yards?: number | null
          rushing_tds?: number | null
          rushing_attempts?: number | null
          receptions?: number | null
          targets?: number | null
          receiving_yards?: number | null
          receiving_tds?: number | null
          fg_made_0_39?: number | null
          fg_made_40_49?: number | null
          fg_made_50_plus?: number | null
          pat_made?: number | null
          offense_snaps?: number | null
          defense_snaps?: number | null
          st_snaps?: number | null
          total_snaps?: number | null
          total_points?: number | null
          ppg?: number | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      scraper_jobs: {
        Row: {
          id: string
          job_type: string
          status: string
          started_at: string | null
          completed_at: string | null
          error_message: string | null
          metadata: Json | null
          created_at: string
        }
        Insert: {
          id?: string
          job_type: string
          status?: string
          started_at?: string | null
          completed_at?: string | null
          error_message?: string | null
          metadata?: Json | null
          created_at?: string
        }
        Update: {
          id?: string
          job_type?: string
          status?: string
          started_at?: string | null
          completed_at?: string | null
          error_message?: string | null
          metadata?: Json | null
          created_at?: string
        }
        Relationships: []
      }
      arbitration_plans: {
        Row: {
          id: string
          league_id: number
          name: string
          notes: string | null
          created_at: string
          updated_at: string
          user_id: string
        }
        Insert: {
          id?: string
          league_id: number
          name: string
          notes?: string | null
          created_at?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          id?: string
          league_id?: number
          name?: string
          notes?: string | null
          created_at?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      arbitration_plan_allocations: {
        Row: {
          id: string
          plan_id: string
          player_id: string
          amount: number
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          plan_id: string
          player_id: string
          amount?: number
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          plan_id?: string
          player_id?: string
          amount?: number
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      projection_models: {
        Row: {
          id: string
          name: string
          version: number
          description: string | null
          features: Json
          config: Json
          is_baseline: boolean
          is_active: boolean
          created_at: string
        }
        Insert: {
          id?: string
          name: string
          version?: number
          description?: string | null
          features?: Json
          config?: Json
          is_baseline?: boolean
          is_active?: boolean
          created_at?: string
        }
        Update: {
          id?: string
          name?: string
          version?: number
          description?: string | null
          features?: Json
          config?: Json
          is_baseline?: boolean
          is_active?: boolean
          created_at?: string
        }
        Relationships: []
      }
      model_projections: {
        Row: {
          id: string
          model_id: string
          player_id: string
          season: number
          projected_ppg: number
          feature_values: Json | null
          created_at: string
        }
        Insert: {
          id?: string
          model_id: string
          player_id: string
          season: number
          projected_ppg: number
          feature_values?: Json | null
          created_at?: string
        }
        Update: {
          id?: string
          model_id?: string
          player_id?: string
          season?: number
          projected_ppg?: number
          feature_values?: Json | null
          created_at?: string
        }
        Relationships: []
      }
      backtest_results: {
        Row: {
          id: string
          model_id: string
          season: number
          position: string | null
          player_count: number | null
          mae: number | null
          bias: number | null
          r_squared: number | null
          rmse: number | null
          created_at: string
        }
        Insert: {
          id?: string
          model_id: string
          season: number
          position?: string | null
          player_count?: number | null
          mae?: number | null
          bias?: number | null
          r_squared?: number | null
          rmse?: number | null
          created_at?: string
        }
        Update: {
          id?: string
          model_id?: string
          season?: number
          position?: string | null
          player_count?: number | null
          mae?: number | null
          bias?: number | null
          r_squared?: number | null
          rmse?: number | null
          created_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}
