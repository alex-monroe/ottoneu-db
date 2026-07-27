/**
 * Response-shaping helpers for the MCP tool handlers.
 *
 * MCP tool results are text content blocks; every tool serializes a JSON
 * payload. Consumers are LLMs, so numbers are rounded and lists are capped
 * to keep responses token-friendly.
 */

export interface McpToolResult {
  // Index signature so this stays assignable to the MCP SDK's CallToolResult.
  [key: string]: unknown;
  content: { type: "text"; text: string }[];
  isError?: boolean;
}

/** Round to `dp` decimal places, passing through null/undefined/NaN as null. */
export function round(value: number | null | undefined, dp = 1): number | null {
  if (value == null || Number.isNaN(value)) return null;
  const factor = 10 ** dp;
  return Math.round(value * factor) / factor;
}

/** Clamp a requested list size to [1, max], defaulting when absent. */
export function clampLimit(requested: number | undefined, fallback: number, max: number): number {
  if (requested == null || !Number.isFinite(requested) || requested < 1) return fallback;
  return Math.min(Math.floor(requested), max);
}

/** Wrap a payload as a successful MCP text result. */
export function jsonResult(payload: unknown): McpToolResult {
  return { content: [{ type: "text", text: JSON.stringify(payload) }] };
}

/** Wrap an error message as a failed MCP text result. */
export function errorResult(message: string): McpToolResult {
  return {
    content: [{ type: "text", text: JSON.stringify({ error: message }) }],
    isError: true,
  };
}
