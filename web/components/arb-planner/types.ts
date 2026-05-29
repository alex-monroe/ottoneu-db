import type { ArbitrationTarget, PublicArbPlayer } from "@/lib/types";

/**
 * Minimal player shape consumed by the shared arbitration-planner components.
 *
 * Both `ArbitrationTarget` (authed planner) and `PublicArbPlayer` (public
 * planner) satisfy this base, so the shared roster and comparison components
 * are generic over `T extends ArbPlannerPlayer`. The value/surplus fields are
 * optional here and supplied only by the authed view; the public view never
 * passes them and the corresponding columns stay hidden.
 */
export interface ArbPlannerPlayer {
  player_id: string;
  ottoneu_id: number;
  name: string;
  position: string;
  nfl_team: string;
  price: number;
  team_name: string | null;
  ppg: number;
  games_played: number;
  dollar_value?: number;
  surplus?: number;
}

// Compile-time assertions that both concrete row types are assignable to the
// shared base. If either diverges in a way that breaks the shared components,
// these lines will fail `just typecheck`.
const _assertTarget: (t: ArbitrationTarget) => ArbPlannerPlayer = (t) => t;
const _assertPublic: (p: PublicArbPlayer) => ArbPlannerPlayer = (p) => p;
void _assertTarget;
void _assertPublic;
