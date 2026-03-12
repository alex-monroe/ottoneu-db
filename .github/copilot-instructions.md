# GitHub Copilot Instructions

You are working in the Ottoneu Analytics codebase.

## Universal Agent Instructions

This repository maintains universal instructions for AI agents in `AGENTS.md`.
**Please read `AGENTS.md` before starting any task.**

## Quick Reference
- **Commands:** See `docs/COMMANDS.md`
- **Architecture:** See `docs/ARCHITECTURE.md`
- **Frontend:** See `docs/FRONTEND.md`
- **Code layout:** See `docs/CODE_ORGANIZATION.md`
- **Database:** See `docs/generated/db-schema.md`

## Key Directives
- **Package Manager:** Strictly use `npm` for all frontend tasks (do not use `yarn`, `pnpm`, or `bun`).
- **Commits:** Do not commit directly to `main`. Use PRs.
- **Architectural Rules:** Adhere strictly to rules in `AGENTS.md` (e.g., config sync, shared Supabase client). Run `make check-arch` to verify.
