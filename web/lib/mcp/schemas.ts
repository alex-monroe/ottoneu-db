/**
 * Zod parameter shapes for the MCP tools.
 *
 * Each shape is a `z.ZodRawShape` passed to `server.registerTool` (the SDK
 * wraps it in an object schema) and re-parsed inside the handler for typing.
 */

import { z } from "zod";
import { POSITIONS } from "../config";

export const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "expected YYYY-MM-DD");

export const positionEnum = z.enum(POSITIONS);

const limitParam = (fallback: number, max: number) =>
  z
    .number()
    .int()
    .min(1)
    .optional()
    .describe(`Max rows to return (default ${fallback}, capped at ${max})`);

export const emptyShape = {} satisfies z.ZodRawShape;

export const getRostersShape = {
  team_name: z.string().optional().describe("Filter to one fantasy team (case-insensitive exact name)"),
  as_of_date: isoDate.optional().describe("Reconstruct rosters as of this date (YYYY-MM-DD, within the current league season). Defaults to today."),
} satisfies z.ZodRawShape;

export const searchPlayersShape = {
  query: z.string().min(1).describe("Case-insensitive substring of the player name"),
  position: positionEnum.optional(),
  rostered_only: z.boolean().optional().describe("Only players currently on a fantasy roster"),
  limit: limitParam(10, 50),
} satisfies z.ZodRawShape;

export const getPlayerShape = {
  ottoneu_id: z.number().int().positive().optional().describe("Ottoneu player ID (preferred if known)"),
  name: z.string().min(1).optional().describe("Player name (exact match preferred; ambiguous matches return candidates)"),
} satisfies z.ZodRawShape;

export const getTransactionsShape = {
  team_name: z.string().optional().describe("Filter to moves by one fantasy team (exact name)"),
  type: z.string().optional().describe("Substring filter on transaction type, e.g. 'cut', 'add', 'trade', 'auction'"),
  since: isoDate.optional().describe("Only transactions on or after this date"),
  limit: limitParam(25, 100),
} satisfies z.ZodRawShape;

export const getProjectionsShape = {
  position: positionEnum.optional(),
  team_name: z.string().optional().describe("Filter to one fantasy team's players (exact name); use 'FA' for free agents"),
  limit: limitParam(25, 100),
} satisfies z.ZodRawShape;

export const getPlayerValuesShape = {
  position: positionEnum.optional(),
  team_name: z.string().optional().describe("Filter to one fantasy team's players (exact name)"),
  limit: limitParam(25, 100),
} satisfies z.ZodRawShape;

export const getArbitrationAnalysisShape = {
  exclude_team: z.string().optional().describe("Fantasy team whose roster to exclude from targets — pass your own team name, since you cannot allocate against yourself. Omit for a league-wide view."),
  limit: limitParam(30, 100),
} satisfies z.ZodRawShape;

export const getDepthChartShape = {
  nfl_team: z.string().length(2).or(z.string().length(3)).optional().describe("NFL team code, e.g. KC, SF, DET"),
  position: positionEnum.optional(),
  season: z.number().int().optional().describe("NFL season (defaults to the most recent with data)"),
} satisfies z.ZodRawShape;

export const getVegasLinesShape = {
  season: z.number().int().optional().describe("NFL season (defaults to the most recent with data)"),
} satisfies z.ZodRawShape;

export const getWeeklyProjectionsShape = {
  week: z.number().int().min(1).max(18).optional()
    .describe("NFL week 1-18 (defaults to the current/upcoming week, which rolls over on Tuesday)"),
  season: z.number().int().optional().describe("NFL season (defaults to the current one)"),
  position: positionEnum.optional(),
  team_name: z.string().optional()
    .describe("Filter to one fantasy team's players (exact name); use 'FA' for free agents"),
  min_points: z.number().optional().describe("Only players projected at or above this many points"),
  limit: limitParam(50, 200),
} satisfies z.ZodRawShape;
