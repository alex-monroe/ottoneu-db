export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      arbitration_allocation_details: {
        Row: {
          allocating_team_name: string
          amount: number
          id: string
          league_id: number
          ottoneu_id: number
          owner_team_name: string | null
          player_name: string
          scraped_at: string
          season: number
        }
        Insert: {
          allocating_team_name: string
          amount: number
          id?: string
          league_id: number
          ottoneu_id: number
          owner_team_name?: string | null
          player_name: string
          scraped_at?: string
          season: number
        }
        Update: {
          allocating_team_name?: string
          amount?: number
          id?: string
          league_id?: number
          ottoneu_id?: number
          owner_team_name?: string | null
          player_name?: string
          scraped_at?: string
          season?: number
        }
        Relationships: []
      }
      arbitration_plan_allocations: {
        Row: {
          amount: number
          id: string
          plan_id: string
          player_id: string
        }
        Insert: {
          amount?: number
          id?: string
          plan_id: string
          player_id: string
        }
        Update: {
          amount?: number
          id?: string
          plan_id?: string
          player_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "arbitration_plan_allocations_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "arbitration_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "arbitration_plan_allocations_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
        ]
      }
      arbitration_plans: {
        Row: {
          created_at: string
          id: string
          league_id: number
          name: string
          notes: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          league_id: number
          name: string
          notes?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          league_id?: number
          name?: string
          notes?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "arbitration_plans_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      arbitration_progress: {
        Row: {
          current_salary: number | null
          id: string
          league_id: number
          new_salary: number | null
          ottoneu_id: number | null
          player_name: string
          raise_amount: number
          scraped_at: string
          season: number
          team_name: string | null
        }
        Insert: {
          current_salary?: number | null
          id?: string
          league_id: number
          new_salary?: number | null
          ottoneu_id?: number | null
          player_name: string
          raise_amount?: number
          scraped_at?: string
          season: number
          team_name?: string | null
        }
        Update: {
          current_salary?: number | null
          id?: string
          league_id?: number
          new_salary?: number | null
          ottoneu_id?: number | null
          player_name?: string
          raise_amount?: number
          scraped_at?: string
          season?: number
          team_name?: string | null
        }
        Relationships: []
      }
      arbitration_progress_teams: {
        Row: {
          id: string
          is_complete: boolean
          league_id: number
          scraped_at: string
          season: number
          team_name: string
        }
        Insert: {
          id?: string
          is_complete?: boolean
          league_id: number
          scraped_at?: string
          season: number
          team_name: string
        }
        Update: {
          id?: string
          is_complete?: boolean
          league_id?: number
          scraped_at?: string
          season?: number
          team_name?: string
        }
        Relationships: []
      }
      backtest_results: {
        Row: {
          bias: number | null
          created_at: string
          id: string
          mae: number | null
          model_id: string
          player_count: number | null
          position: string | null
          r_squared: number | null
          rmse: number | null
          season: number
        }
        Insert: {
          bias?: number | null
          created_at?: string
          id?: string
          mae?: number | null
          model_id: string
          player_count?: number | null
          position?: string | null
          r_squared?: number | null
          rmse?: number | null
          season: number
        }
        Update: {
          bias?: number | null
          created_at?: string
          id?: string
          mae?: number | null
          model_id?: string
          player_count?: number | null
          position?: string | null
          r_squared?: number | null
          rmse?: number | null
          season?: number
        }
        Relationships: [
          {
            foreignKeyName: "backtest_results_model_id_fkey"
            columns: ["model_id"]
            isOneToOne: false
            referencedRelation: "projection_models"
            referencedColumns: ["id"]
          },
        ]
      }
      draft_capital: {
        Row: {
          created_at: string
          id: string
          overall_pick: number
          player_id: string
          round: number
          season_drafted: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          overall_pick: number
          player_id: string
          round: number
          season_drafted: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          overall_pick?: number
          player_id?: string
          round?: number
          season_drafted?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "draft_capital_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: true
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
        ]
      }
      league_prices: {
        Row: {
          created_at: string
          id: string
          league_id: number
          player_id: string
          price: number
          team_name: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          league_id: number
          player_id: string
          price?: number
          team_name?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          league_id?: number
          player_id?: string
          price?: number
          team_name?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "league_prices_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
        ]
      }
      model_projections: {
        Row: {
          created_at: string
          feature_values: Json | null
          id: string
          model_id: string
          player_id: string
          projected_ppg: number
          season: number
        }
        Insert: {
          created_at?: string
          feature_values?: Json | null
          id?: string
          model_id: string
          player_id: string
          projected_ppg: number
          season: number
        }
        Update: {
          created_at?: string
          feature_values?: Json | null
          id?: string
          model_id?: string
          player_id?: string
          projected_ppg?: number
          season?: number
        }
        Relationships: [
          {
            foreignKeyName: "model_projections_model_id_fkey"
            columns: ["model_id"]
            isOneToOne: false
            referencedRelation: "projection_models"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "model_projections_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
        ]
      }
      nfl_stats: {
        Row: {
          air_yards_share: number | null
          completions: number | null
          created_at: string
          defense_snaps: number | null
          fg_made_0_39: number | null
          fg_made_40_49: number | null
          fg_made_50_plus: number | null
          games_played: number | null
          id: string
          interceptions: number | null
          offense_snaps: number | null
          passing_attempts: number | null
          passing_tds: number | null
          passing_yards: number | null
          pat_made: number | null
          player_id: string
          ppg: number | null
          racr: number | null
          receiving_air_yards: number | null
          receiving_tds: number | null
          receiving_yards: number | null
          recent_team: string | null
          receptions: number | null
          rushing_attempts: number | null
          rushing_tds: number | null
          rushing_yards: number | null
          season: number
          st_snaps: number | null
          target_share: number | null
          targets: number | null
          total_points: number | null
          total_snaps: number | null
          updated_at: string
          wopr: number | null
        }
        Insert: {
          air_yards_share?: number | null
          completions?: number | null
          created_at?: string
          defense_snaps?: number | null
          fg_made_0_39?: number | null
          fg_made_40_49?: number | null
          fg_made_50_plus?: number | null
          games_played?: number | null
          id?: string
          interceptions?: number | null
          offense_snaps?: number | null
          passing_attempts?: number | null
          passing_tds?: number | null
          passing_yards?: number | null
          pat_made?: number | null
          player_id: string
          ppg?: number | null
          racr?: number | null
          receiving_air_yards?: number | null
          receiving_tds?: number | null
          receiving_yards?: number | null
          recent_team?: string | null
          receptions?: number | null
          rushing_attempts?: number | null
          rushing_tds?: number | null
          rushing_yards?: number | null
          season: number
          st_snaps?: number | null
          target_share?: number | null
          targets?: number | null
          total_points?: number | null
          total_snaps?: number | null
          updated_at?: string
          wopr?: number | null
        }
        Update: {
          air_yards_share?: number | null
          completions?: number | null
          created_at?: string
          defense_snaps?: number | null
          fg_made_0_39?: number | null
          fg_made_40_49?: number | null
          fg_made_50_plus?: number | null
          games_played?: number | null
          id?: string
          interceptions?: number | null
          offense_snaps?: number | null
          passing_attempts?: number | null
          passing_tds?: number | null
          passing_yards?: number | null
          pat_made?: number | null
          player_id?: string
          ppg?: number | null
          racr?: number | null
          receiving_air_yards?: number | null
          receiving_tds?: number | null
          receiving_yards?: number | null
          recent_team?: string | null
          receptions?: number | null
          rushing_attempts?: number | null
          rushing_tds?: number | null
          rushing_yards?: number | null
          season?: number
          st_snaps?: number | null
          target_share?: number | null
          targets?: number | null
          total_points?: number | null
          total_snaps?: number | null
          updated_at?: string
          wopr?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "nfl_stats_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
        ]
      }
      player_projections: {
        Row: {
          created_at: string
          id: string
          player_id: string
          projected_ppg: number
          projection_method: string
          season: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          player_id: string
          projected_ppg: number
          projection_method: string
          season: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          player_id?: string
          projected_ppg?: number
          projection_method?: string
          season?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "player_projections_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
        ]
      }
      player_stats: {
        Row: {
          created_at: string
          games_played: number | null
          h1_games: number | null
          h1_snaps: number | null
          h2_games: number | null
          h2_snaps: number | null
          id: string
          player_id: string
          ppg: number | null
          pps: number | null
          season: number
          snaps: number | null
          total_points: number | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          games_played?: number | null
          h1_games?: number | null
          h1_snaps?: number | null
          h2_games?: number | null
          h2_snaps?: number | null
          id?: string
          player_id: string
          ppg?: number | null
          pps?: number | null
          season: number
          snaps?: number | null
          total_points?: number | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          games_played?: number | null
          h1_games?: number | null
          h1_snaps?: number | null
          h2_games?: number | null
          h2_snaps?: number | null
          id?: string
          player_id?: string
          ppg?: number | null
          pps?: number | null
          season?: number
          snaps?: number | null
          total_points?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "player_stats_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
        ]
      }
      players: {
        Row: {
          birth_date: string | null
          created_at: string
          id: string
          is_college: boolean
          name: string
          nfl_team: string | null
          ottoneu_id: number
          position: string | null
          updated_at: string
        }
        Insert: {
          birth_date?: string | null
          created_at?: string
          id?: string
          is_college?: boolean
          name: string
          nfl_team?: string | null
          ottoneu_id: number
          position?: string | null
          updated_at?: string
        }
        Update: {
          birth_date?: string | null
          created_at?: string
          id?: string
          is_college?: boolean
          name?: string
          nfl_team?: string | null
          ottoneu_id?: number
          position?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      projection_models: {
        Row: {
          config: Json
          created_at: string
          description: string | null
          features: Json
          id: string
          is_active: boolean | null
          is_baseline: boolean | null
          name: string
          version: number
        }
        Insert: {
          config?: Json
          created_at?: string
          description?: string | null
          features?: Json
          id?: string
          is_active?: boolean | null
          is_baseline?: boolean | null
          name: string
          version?: number
        }
        Update: {
          config?: Json
          created_at?: string
          description?: string | null
          features?: Json
          id?: string
          is_active?: boolean | null
          is_baseline?: boolean | null
          name?: string
          version?: number
        }
        Relationships: []
      }
      scraper_jobs: {
        Row: {
          attempts: number
          batch_id: string | null
          completed_at: string | null
          created_at: string
          depends_on: string | null
          id: string
          last_error: string | null
          max_attempts: number
          params: Json
          priority: number
          started_at: string | null
          status: string
          task_type: string
        }
        Insert: {
          attempts?: number
          batch_id?: string | null
          completed_at?: string | null
          created_at?: string
          depends_on?: string | null
          id?: string
          last_error?: string | null
          max_attempts?: number
          params?: Json
          priority?: number
          started_at?: string | null
          status?: string
          task_type: string
        }
        Update: {
          attempts?: number
          batch_id?: string | null
          completed_at?: string | null
          created_at?: string
          depends_on?: string | null
          id?: string
          last_error?: string | null
          max_attempts?: number
          params?: Json
          priority?: number
          started_at?: string | null
          status?: string
          task_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "scraper_jobs_depends_on_fkey"
            columns: ["depends_on"]
            isOneToOne: false
            referencedRelation: "scraper_jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      surplus_adjustments: {
        Row: {
          adjustment: number
          created_at: string
          id: string
          league_id: number
          notes: string | null
          player_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          adjustment?: number
          created_at?: string
          id?: string
          league_id: number
          notes?: string | null
          player_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          adjustment?: number
          created_at?: string
          id?: string
          league_id?: number
          notes?: string | null
          player_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "surplus_adjustments_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "surplus_adjustments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      team_vegas_lines: {
        Row: {
          created_at: string
          id: string
          implied_total: number
          season: number
          team: string
          updated_at: string
          win_total: number | null
        }
        Insert: {
          created_at?: string
          id?: string
          implied_total: number
          season: number
          team: string
          updated_at?: string
          win_total?: number | null
        }
        Update: {
          created_at?: string
          id?: string
          implied_total?: number
          season?: number
          team?: string
          updated_at?: string
          win_total?: number | null
        }
        Relationships: []
      }
      transactions: {
        Row: {
          from_team: string | null
          id: string
          league_id: number
          player_id: string
          raw_description: string | null
          salary: number | null
          scraped_at: string
          season: number
          team_name: string | null
          transaction_date: string | null
          transaction_type: string
        }
        Insert: {
          from_team?: string | null
          id?: string
          league_id: number
          player_id: string
          raw_description?: string | null
          salary?: number | null
          scraped_at?: string
          season: number
          team_name?: string | null
          transaction_date?: string | null
          transaction_type: string
        }
        Update: {
          from_team?: string | null
          id?: string
          league_id?: number
          player_id?: string
          raw_description?: string | null
          salary?: number | null
          scraped_at?: string
          season?: number
          team_name?: string | null
          transaction_date?: string | null
          transaction_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "transactions_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
        ]
      }
      users: {
        Row: {
          created_at: string
          email: string
          has_projections_access: boolean
          id: string
          is_admin: boolean
          password_hash: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          email: string
          has_projections_access?: boolean
          id?: string
          is_admin?: boolean
          password_hash: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string
          has_projections_access?: boolean
          id?: string
          is_admin?: boolean
          password_hash?: string
          updated_at?: string
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

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
