# Claude Code MCP Integration Guide

To enable these MCP servers in Claude Code (or Claude Desktop), you need to add the configuration from `claude_mcp_config.json` to your Claude configuration file.

## Configuration File Location

- **macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows:** `%APPDATA%\Claude\claude_desktop_config.json`

## Setup Steps

1.  **Open `claude_mcp_config.json`** in this directory.
2.  **Update Placeholders:**
    -   Replace `[YOUR-SUPABASE-PERSONAL-ACCESS-TOKEN]` with your Supabase Personal Access Token.
        -   Go to [Supabase Dashboard > Account Settings > Access Tokens](https://supabase.com/dashboard/account/tokens).
        -   Generate a new token.
    -   Replace `[YOUR-GITHUB-PERSONAL-ACCESS-TOKEN]` with a GitHub Personal Access Token.
        -   Go to [GitHub Settings > Developer settings > Personal access tokens > Tokens (classic)](https://github.com/settings/tokens).
        -   Generate a new token with `repo` scope.
    -   Replace `[YOUR-BRAVE-API-KEY]` with your Brave Search API key (get one at https://api.search.brave.com/app/keys).
3.  **Copy and Paste:**
    -   Open your Claude configuration file (path above).
    -   Copy the `mcpServers` object from `claude_mcp_config.json`.
    -   Paste it into the `mcpServers` object in your configuration file. If the file doesn't exist, create it with `{ "mcpServers": { ... } }`.
4.  **Restart Claude:** Close and reopen the Claude application or CLI session.

## Included Integrations

-   **Filesystem:** Allows Claude to read and write files in this project directory.
-   **Supabase:** The official Supabase MCP server. Allows Claude to query your database, manage projects, inspect schemas, and generate migrations using natural language.
-   **GitHub:** Allows Claude to manage repositories, issues, and pull requests directly, helping automate your PR-based workflow.
-   **Puppeteer:** Allows Claude to control a headless browser for debugging scrapers or fetching web content.
-   **Brave Search:** Allows Claude to search the web for up-to-date NFL news and stats.
