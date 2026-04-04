### ✅ Confirmed accurate
- `AGENTS.md`, `CLAUDE.md`, `.cursorrules`, and `.github/copilot-instructions.md` exist and are accessible.
- File and path references within the documents are generally correct and pass the `scripts/check_docs_freshness.py` script.
- The `Makefile` and `web/package.json` confirm that commands like `npm run dev`, `npm run build`, `npm test`, `npx tsc --noEmit` are accurate.
- Environment variable structures mentioned match `.env.example` and `web/.env.local.example`.

### ⚠️ Needs update
- **`docs/generated/db-schema.md`**:
  - **Claim**: "Seventeen tables, all with UUID primary keys."
  - **Reality**: There are actually 18 tables because `arbitration_allocation_details` was recently added.
  - **Fix**: Updated the text to "Eighteen tables".

### 🔲 Gaps (undocumented but should be)
- No significant missing documentation detected.
