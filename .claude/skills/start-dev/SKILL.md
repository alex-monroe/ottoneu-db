---
name: start-dev
description: Start the Next.js development server
---
1. If `web/node_modules` is missing (fresh worktree), run `just worktree-setup`.
2. Start the server on localhost:3000: `just dev` (run it in the background).
3. Stop it — and any stray Turbopack/postcss workers — with `just dev-stop`,
   never a raw `pkill`.
