#!/usr/bin/env bash
# One-time container setup: Claude Code CLI + project dependencies.
set -euo pipefail

npm install -g @anthropic-ai/claude-code

# MCP servers, installed once here rather than launched with `npx -y` from
# .mcp.json. postCreateCommand runs before postStartCommand (the firewall), so
# this is the one moment egress to the npm registry is unrestricted.
#
# With `npx -y`, every Claude Code start re-fetches the packument from
# registry.npmjs.org — Cloudflare anycast, whose rotating IPs the firewall can
# only partially pin. A lookup landing on an unpinned edge hangs npx until the
# MCP startup timeout, and the server silently never registers. Installing them
# up front takes the network off the startup path entirely (and removes the
# cold-install latency that tripped the same timeout).
#
# See .mcp.json.example for the matching command/args entries.
npm install -g \
  @modelcontextprotocol/server-filesystem \
  @modelcontextprotocol/server-puppeteer \
  @modelcontextprotocol/server-github \
  @supabase/mcp-server-supabase

# venv/ and web/node_modules are backed by named volumes (see devcontainer.json)
# so the host's macOS binaries (bind-mounted via the workspace) don't leak into
# this Linux container. Fresh volumes mount root-owned, so claim them before use.
sudo chown vscode:vscode venv web/node_modules

# Mirror `just install` (Justfile) — venv lives inside the container workspace.
# --clear recreates cleanly if the volume carries a stale venv from a prior build.
python3 -m venv --clear venv
venv/bin/pip install --upgrade pip
# requirements.txt is the pinned export of uv.lock and already includes `-e .`,
# so this installs the locked deps + the editable project in one step.
venv/bin/pip install -r requirements.txt
venv/bin/playwright install chromium || echo "WARN: playwright chromium download blocked — add cdn.playwright.dev to allowed-domains.txt and re-run"
(cd web && npm install)

echo
echo "Setup complete. Authenticate once with 'claude' (credentials persist in the"
echo "ottoneu-claude-config volume), then run:"
echo "  claude --dangerously-skip-permissions"
