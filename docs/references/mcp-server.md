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

Two credentials are accepted on the same endpoint (`web/lib/mcp/auth.ts` tries OAuth first, then the shared key):

| Mode | Use it for | Identity | Revoke by |
|------|-----------|----------|-----------|
| **OAuth 2.1** | Clients that refuse static keys — Gemini Spark — and anywhere you want per-person access | Per-user; the granting account is attached to every call | Clearing the user's projections access, or `just oauth-client revoke` |
| **Shared key** (`MCP_API_KEY`) | Claude Code, Claude Desktop, the Claude API connector — anywhere a header is simpler | None; the key is the identity | Rotating the env var |

### Shared key

Read from the `MCP_API_KEY` env var (set in `web/.env.local` for dev, in the Vercel project env for prod):

```
Authorization: Bearer <key>
```

- Generate a key with `openssl rand -hex 32`.
- **Rotation = revocation:** change the env var, redeploy, hand out the new key.
- Fails closed: if `MCP_API_KEY` is unset, every request gets a 401 (constant-time comparison).
- The key grants read-only access to everything the tools expose — including projections and valuations that the web UI gates behind `hasProjectionsAccess`. Only share it with people who should see that.

### OAuth 2.1

The site is its own authorization server; there is no third-party identity provider. It reuses the existing login and `users` table, so a leaguemate signs in with the same account they use on the site.

**Who may authorize:** only users whose `has_projections_access` flag is set (granted in `/admin`) — the same bar as the gated pages. The flag is read live from the database at consent time *and* on every token refresh, deliberately not from the session cookie, which caches it for up to 7 days.

**Endpoints:**

| Endpoint | Purpose |
|----------|---------|
| `/.well-known/oauth-protected-resource` (+ `/api/mcp/mcp` path-scoped variant) | RFC 9728 resource metadata; the path-scoped URL is what 401s advertise |
| `/.well-known/oauth-authorization-server` | RFC 8414 authorization server metadata |
| `POST /api/oauth/register` | RFC 7591 dynamic client registration |
| `GET /oauth/authorize` | Consent screen (bounces through `/login` if signed out) |
| `POST /api/oauth/authorize` | Consent submission → issues the authorization code |
| `POST /api/oauth/token` | `authorization_code` and `refresh_token` grants |

**Design notes:**

- **PKCE S256 is mandatory**; `plain` is rejected. Redirect URIs must match registration exactly.
- **Access tokens are stateless** — HMAC-signed and verified with no database round-trip, so MCP calls stay fast — and live **1 hour**. Refresh tokens are stored (hashed) and live 30 days, rotating on every use.
- **Revocation takes up to 1 hour.** Clearing a user's projections access blocks the next refresh immediately, but an already-issued access token stays valid until it expires. To cut someone off instantly, revoke their client with `just oauth-client revoke --client-id <id>`.
- Tokens are signed with `SESSION_SECRET` (no separate secret to manage). Payloads carry a type discriminator, so a login session cookie can never be replayed as an access token and vice versa.
- Authorization codes are single-use, enforced by a conditional `UPDATE` so a replay loses the race in Postgres rather than in application code.
- Only one scope exists: `league:read`.

Registration is open, matching MCP ecosystem norms. That's safe because registering a client grants nothing on its own — no data is reachable until a permitted user signs in and approves the consent screen.

## Tools

All tools are read-only and use the anon Supabase client (every table touched has an anon SELECT policy). Registry: `web/lib/mcp/tools.ts`.

| Tool | Purpose |
|------|---------|
| `get_league_overview` | League settings, scoring, arb rules, current season phase + deadlines, active projection model. Call first — `season_context.in_season` / `.framing` settle whether games have started. |
| `get_league_calendar` | All season boundary dates (arb window, keeper deadline, auction, kickoff, trade deadline). |
| `get_rosters` | All rosters (or one team), current or as-of-date via transaction replay, with salaries + cap space. |
| `search_players` | Name-substring player search with position/rostered filters. |
| `get_player` | Full player card: stats by season, projection, auction values, recent transactions. By `ottoneu_id` or name. |
| `get_transactions` | League transaction log, newest first (real clock order), with team/type/date filters. Rows carry `source` + `feed_quality`; see [Reading the transaction feed](#reading-the-transaction-feed). |
| `get_projections` | Active-model projection board (ranked, includes rookies). Free agents come back with `salary: null` — see [Free agents have no salary](#free-agents-have-no-salary). |
| `get_player_values` | VORP-based dollar values + surplus (`calculateSurplus` over end-of-season salaries). |
| `get_arbitration_analysis` | Ranked arb targets with post-raise surplus; `exclude_team` parameterizes the perspective (`web/lib/mcp/arb.ts`). |
| `get_arbitration_progress` | Live scraped arb state: team completion, top raises with projected finals, per-team spending. |
| `get_depth_chart` | Opening-day NFL depth tiers with prior-season tier + projected PPG. |
| `get_vegas_lines` | Preseason implied totals + win totals per NFL team. |
| `get_weekly_projections` | Per-game projections for one NFL week from a third-party source (Sleeper), re-scored under league rules. Defaults to the upcoming week (rolls over Tuesdays); a played week keeps its projection beside the actual result. Filters: `week`, `season`, `position`, `team_name` (`"FA"`), `min_points`. **Not** the same as `get_projections` — the response carries a `note` saying so, plus `source`, `as_of`, and `scoring`. |

Responses are JSON text content with rounded numbers and capped list sizes (token-friendly for LLM consumers). The tool handlers only *compose* the existing data layer (`web/lib/data.ts`, `analysis.ts`, `roster-reconstruction.ts`) and pure calculators (`surplus.ts`, `arb-progress.ts`) — no math is duplicated.

## Consumer-facing gotchas

Three of these came out of an AI report generator running a weekly digest off the
server (Aug 2026). Each was a case of the tools handing over a field that read as
one thing and meant another, so the fixes are as much about what the response
*says* as what it contains.

### Reading the transaction feed

`transactions` stores a `transaction_date` **DATE**, not a timestamp, so every move
made on the same day ties. That broke the feed in two ways: ordering by the date
and taking the first N returned an arbitrary slice of a busy day, and the slice
reshuffled between identical calls. Two columns are also effectively dead —
`from_team` is null on all 1,462 rows, and the origin of a trade lives in the type
string as `move (from <team>)`.

`web/lib/mcp/transactions.ts` repairs all of this at read time. Nothing new is
stored; the information was already in the row:

| Response field | Recovered from |
|---|---|
| `occurred_at_local` | The Ottoneu card clock the scraper keeps verbatim in `raw_description` ("Aug 22, 2026 9:26 PM"). Present on 87% of rows; null when only a date is known. Site wall-clock, deliberately unzoned. |
| `from_team` | The `move (from <team>)` type string (106 trades; the stored column stays null). `type` is normalized to `move`. |
| `source` | `scraped` = a real dated move off a player card. `inferred` = derived by diffing `league_prices` against the roster CSV, and therefore **dated the reconciliation run, not the move**. |

`get_transactions` also assembles its page in two steps — probe for the oldest
date that could still belong, then fetch *every* row from that date forward — so
the page is exact rather than merely stable, and orders it on the recovered clock.

**`feed_quality` tells you whether there is a story to tell.** When
`is_bulk_load` is true the page is one batch (an auction, or a reconciliation
backfill), not league activity — report roster state from `get_rosters` and say
no dated activity is available, rather than narrating a day of frantic trading.

### Free agents have no salary

A free agent still has a `league_prices` row, carrying the **$1 placeholder**
`reconcile_roster.py` writes on a cut (the roster CSV cannot supply a price for an
unowned player). Emitted as `salary` that reads as a real number to bid against —
"Tyreek Hill at $1". So `get_projections`, `search_players`, and `get_player` set
`salary: null` whenever `is_free_agent` is true, and carry a `salary_note`
pointing at the real anchors: `auction_value` / `market_auction_value` (Draft
Sharks, scaled to this league's cap) on the projection board, or
`get_player_values` for VORP-based worth.

### The calendar is authoritative about the season

Clients aggregate this server with live-scoring sources, and one reported "week 2,
Sunday kickoffs, starters yet to play" for a league sitting in `pre_draft` with
kickoff still two weeks out. A phase enum alone did not stop a digest prompt from
assuming in-season framing, so `get_league_overview` now also returns
`season_context.in_season`, `regular_season_start`, and a plain-language
`framing` line that states outright that no games have been played and that any
other source's current-week claim is stale.

The `framing` line also branches on `post_draft`: once the auction has run but
kickoff has not arrived, it says the draft is COMPLETE and points the agent at
the rosters as drafted (what the league paid, surplus, pre-kickoff tuning)
instead of the auction/keeper prep it recommends earlier in the offseason.

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

**Gemini Spark** (Connected Apps → custom app). Spark speaks OAuth 2.1 only — the shared key will not work there.

1. Confirm eligibility first: Spark custom apps require a **personal** Google account (not a Workspace/work/school one), US-based, 18+.
2. In Gemini's Connected Apps settings, add a custom app and paste the MCP server URL: `https://<site-domain>/api/mcp/mcp`.
3. Spark discovers the authorization server and registers itself via DCR — leave "Advanced features" alone.
4. It redirects to the site's consent screen. Sign in with an account that has projections access, review the permissions, and approve.

If DCR fails, provision a client by hand and use the manual path:

```bash
just oauth-client create --name "Gemini Spark" --redirect-uri "<Spark's callback URL>"
```

Then open **Advanced features** in the Gemini connection dialog and paste the printed client ID and secret. The secret is shown once and stored only as a hash — re-run the command to issue a new client if it's lost. `just oauth-client list` shows what's registered; `just oauth-client revoke --client-id <id>` deletes a client and cascades away its codes and refresh tokens.

**Claude.ai web limitation:** the claude.ai "custom connectors" UI has no static-bearer-header field, so for Claude use Claude Desktop (via `mcp-remote`) or Claude Code. It can also complete the OAuth flow above.

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
- OAuth server: `web/lib/oauth/{crypto,tokens,pkce,clients,codes,access,metadata,constants}.ts`, routes under `web/app/api/oauth/` and `web/app/.well-known/`, consent UI at `web/app/oauth/authorize/`. Tests: `web/__tests__/lib/oauth/`. Storage: migration `034_create_oauth_tables.sql` (`oauth_clients`, `oauth_authorization_codes`, `oauth_refresh_tokens` — all server-key-only, no anon RLS policies).
- `/api/mcp` and `/api/oauth` are both in `PUBLIC_API_ROUTES` in `web/middleware.ts` so the cookie gate doesn't intercept them; each enforces its own auth. `/oauth/authorize` is a normal UI route that checks the session itself and redirects to `/login` when signed out.
- `maxDuration: 60` covers the heaviest tools (roster reconstruction / value calcs run ~4 parallel paginated Supabase reads — a few seconds).
- Tool handlers throw → the MCP SDK returns them as `isError` text results; invalid arguments are rejected by the SDK's zod validation before the handler runs.
- `get_arbitration_analysis` deliberately does **not** reuse `analyzeArbitration()` from `web/lib/arbitration.ts` — that function hardcodes the `MY_TEAM` perspective. The MCP variant (`analyzeArbTargets` in `web/lib/mcp/arb.ts`) parameterizes the excluded team; a test asserts parity with the site version when excluding `MY_TEAM`.
