# Remote MCP Server

The site hosts a remote [MCP](https://modelcontextprotocol.io) (Model Context Protocol) server that exposes the league's data to AI agents and other MCP clients — rosters, salaries, transactions, stats, projections, VORP/surplus values, arbitration analysis, and live arbitration progress. It exists so leaguemates (or their AI assistants) can query the data programmatically; Ottoneu itself has no API.

## Endpoint

```
POST https://<site-domain>/api/mcp/mcp
```

- **Transport:** Streamable HTTP only (SSE is disabled; no Redis required).
- **Route:** `web/app/api/mcp/[transport]/route.ts` via the `mcp-handler` package, deployed with the Next.js app. The nested path keeps the dynamic `[transport]` segment out of the top-level `/api/` namespace, hence the doubled `/mcp/mcp`.
- **Middleware:** `/api/mcp` is exempted from cookie auth in `web/middleware.ts` (`PUBLIC_API_ROUTES`); auth happens inside the route.

## Authentication

A single shared bearer key, read from the `MCP_API_KEY` env var (set in `web/.env.local` for dev, in the Vercel project env for prod):

```
Authorization: Bearer <key>
```

- Generate a key with `openssl rand -hex 32`.
- **Rotation = revocation:** change the env var, redeploy, hand out the new key.
- Fails closed: if `MCP_API_KEY` is unset, every request gets a 401 (`web/lib/mcp/auth.ts`, constant-time comparison).
- The key grants read-only access to everything the tools expose — including projections and valuations that the web UI gates behind `hasProjectionsAccess`. Only share it with people who should see that.

## Tools

All tools are read-only and use the anon Supabase client (every table touched has an anon SELECT policy). Registry: `web/lib/mcp/tools.ts`.

| Tool | Purpose |
|------|---------|
| `get_league_overview` | League settings, scoring, arb rules, current season phase + deadlines, active projection model. Call first. |
| `get_league_calendar` | All season boundary dates (arb window, keeper deadline, auction, kickoff, trade deadline). |
| `get_rosters` | All rosters (or one team), current or as-of-date via transaction replay, with salaries + cap space. |
| `search_players` | Name-substring player search with position/rostered filters. |
| `get_player` | Full player card: stats by season, projection, auction values, recent transactions. By `ottoneu_id` or name. |
| `get_transactions` | League transaction log, newest first, with team/type/date filters. |
| `get_projections` | Active-model projection board (ranked, includes rookies). |
| `get_player_values` | VORP-based dollar values + surplus (`calculateSurplus` over end-of-season salaries). |
| `get_arbitration_analysis` | Ranked arb targets with post-raise surplus; `exclude_team` parameterizes the perspective (`web/lib/mcp/arb.ts`). |
| `get_arbitration_progress` | Live scraped arb state: team completion, top raises with projected finals, per-team spending. |
| `get_depth_chart` | Opening-day NFL depth tiers with prior-season tier + projected PPG. |
| `get_vegas_lines` | Preseason implied totals + win totals per NFL team. |

Responses are JSON text content with rounded numbers and capped list sizes (token-friendly for LLM consumers). The tool handlers only *compose* the existing data layer (`web/lib/data.ts`, `analysis.ts`, `roster-reconstruction.ts`) and pure calculators (`surplus.ts`, `arb-progress.ts`) — no math is duplicated.

## Connecting a client

**Claude Code:**

```
claude mcp add --transport http ottoneu-309 https://<site-domain>/api/mcp/mcp \
  --header "Authorization: Bearer <key>"
```

**Claude Desktop** (and other stdio-only clients) via the `mcp-remote` bridge, in the MCP servers config:

```json
{
  "mcpServers": {
    "ottoneu-309": {
      "command": "npx",
      "args": ["-y", "mcp-remote", "https://<site-domain>/api/mcp/mcp",
               "--header", "Authorization: Bearer <key>"]
    }
  }
}
```

**Claude API** (MCP connector):

```json
{
  "mcp_servers": [{
    "type": "url",
    "url": "https://<site-domain>/api/mcp/mcp",
    "name": "ottoneu-309",
    "authorization_token": "<key>"
  }]
}
```

**Limitation:** the claude.ai web "custom connectors" UI is OAuth-oriented and has no static-bearer-header field, so use Claude Desktop (via `mcp-remote`) or Claude Code instead. Supporting OAuth (mcp-handler's `protectedResourceHandler`) is a possible future enhancement.

## Local dev & smoke test

1. Add `MCP_API_KEY=<dev key>` to `web/.env.local`, then `just dev`.
2. Handshake + tool listing:

```bash
curl -s http://localhost:3000/api/mcp/mcp \
  -H "Authorization: Bearer <dev key>" \
  -H "Content-Type: application/json" -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

3. A request without the header must return **401**.
4. Interactive: `npx @modelcontextprotocol/inspector`, Streamable HTTP transport, URL `http://localhost:3000/api/mcp/mcp`, with the Authorization header.

## Implementation notes

- Files: `web/lib/mcp/{auth,schemas,format,arb,tools}.ts` + `web/app/api/mcp/[transport]/route.ts`. Tests: `web/__tests__/lib/mcp/`.
- `maxDuration: 60` covers the heaviest tools (roster reconstruction / value calcs run ~4 parallel paginated Supabase reads — a few seconds).
- Tool handlers throw → the MCP SDK returns them as `isError` text results; invalid arguments are rejected by the SDK's zod validation before the handler runs.
- `get_arbitration_analysis` deliberately does **not** reuse `analyzeArbitration()` from `web/lib/arbitration.ts` — that function hardcodes the `MY_TEAM` perspective. The MCP variant (`analyzeArbTargets` in `web/lib/mcp/arb.ts`) parameterizes the excluded team; a test asserts parity with the site version when excluding `MY_TEAM`.
