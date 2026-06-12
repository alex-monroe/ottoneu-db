#!/usr/bin/env bash
# One-time container setup: Claude Code CLI + project dependencies.
set -euo pipefail

npm install -g @anthropic-ai/claude-code

# Mirror `just install` (Justfile) — venv lives inside the container workspace.
python3 -m venv venv
venv/bin/pip install --upgrade pip
venv/bin/pip install -r requirements.txt
venv/bin/pip install -e .
venv/bin/playwright install chromium || echo "WARN: playwright chromium download blocked — add cdn.playwright.dev to allowed-domains.txt and re-run"
(cd web && npm install)

echo
echo "Setup complete. Authenticate once with 'claude' (credentials persist in the"
echo "ottoneu-claude-config volume), then run:"
echo "  claude --dangerously-skip-permissions"
