/**
 * Remote MCP server endpoint (Streamable HTTP): POST /api/mcp/mcp
 *
 * Exposes read-only league-data tools (lib/mcp/tools.ts) to MCP clients
 * (Claude Code, Claude Desktop via mcp-remote, the Claude API connector).
 * Access requires the shared bearer key in MCP_API_KEY; the middleware
 * exempts /api/mcp from cookie auth so withMcpAuth handles 401s here.
 * SSE transport is disabled (no Redis needed).
 */

import { createMcpHandler, withMcpAuth } from "mcp-handler";
import { MCP_TOOLS } from "@/lib/mcp/tools";
import { verifyBearer } from "@/lib/mcp/auth";
import { LEAGUE_ID } from "@/lib/config";

const handler = createMcpHandler(
  (server) => {
    for (const tool of MCP_TOOLS) {
      server.registerTool(
        tool.name,
        { description: tool.description, inputSchema: tool.schema },
        tool.handler,
      );
    }
  },
  {
    serverInfo: { name: `ottoneu-league-${LEAGUE_ID}`, version: "1.0.0" },
  },
  {
    basePath: "/api/mcp",
    maxDuration: 60,
    disableSse: true,
  },
);

const authedHandler = withMcpAuth(handler, verifyBearer, { required: true });

export { authedHandler as GET, authedHandler as POST, authedHandler as DELETE };
export const maxDuration = 60;
