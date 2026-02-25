/**
 * Structural tests that enforce frontend architectural rules.
 *
 * Inspired by "harness engineering" — these tests act as mechanical guardrails
 * that catch architectural drift automatically. Each test failure includes a
 * remediation message explaining *why* the rule exists and *how* to fix it.
 *
 * See: docs/ARCHITECTURE.md and docs/FRONTEND.md
 */

import * as fs from "fs";
import * as path from "path";

const PROJECT_ROOT = path.resolve(__dirname, "..", "..");
const WEB_ROOT = PROJECT_ROOT;
const REPO_ROOT = path.resolve(PROJECT_ROOT, "..");

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getFilesRecursive(dir: string, ext: string): string[] {
  const results: string[] = [];
  if (!fs.existsSync(dir)) return results;

  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === ".next") continue;
      results.push(...getFilesRecursive(fullPath, ext));
    } else if (entry.name.endsWith(ext)) {
      results.push(fullPath);
    }
  }
  return results;
}

function relativeTo(filePath: string, base: string): string {
  return path.relative(base, filePath);
}

// ===========================================================================
// Rule 1: lib/ must not import from components/
// ===========================================================================

describe("Frontend Layer Boundaries", () => {
  /**
   * WHY: The dependency flow is: types → config → lib → components → pages.
   * Library modules are pure logic — they must be importable without React.
   *
   * FIX: Move shared logic into lib/ and have components import from there.
   */
  test("lib/ does not import from components/", () => {
    const libDir = path.join(WEB_ROOT, "lib");
    const libFiles = getFilesRecursive(libDir, ".ts");
    const violations: string[] = [];

    const pattern = /(?:from|import)\s+['"].*components/;
    for (const file of libFiles) {
      const content = fs.readFileSync(file, "utf-8");
      const lines = content.split("\n");
      for (let i = 0; i < lines.length; i++) {
        if (pattern.test(lines[i])) {
          violations.push(
            `  ${relativeTo(file, REPO_ROOT)}:${i + 1}: ${lines[i].trim()}`
          );
        }
      }
    }

    if (violations.length > 0) {
      fail(
        "web/lib/ must not import from web/components/.\n" +
          "FIX: Library modules should be pure logic (no React dependencies).\n" +
          "The dependency flow is: types → config → lib → components → pages.\n" +
          "Violations:\n" +
          violations.join("\n")
      );
    }
  });

  /**
   * WHY: Components should import shared logic from lib/, not define
   * analysis/business logic inline. This keeps logic testable and reusable.
   *
   * FIX: Extract business logic from the component into web/lib/ and import it.
   */
  test("components/ does not import directly from supabase client", () => {
    const componentsDir = path.join(WEB_ROOT, "components");
    const componentFiles = [
      ...getFilesRecursive(componentsDir, ".tsx"),
      ...getFilesRecursive(componentsDir, ".ts"),
    ];
    const violations: string[] = [];

    const pattern = /from\s+['"]@supabase\/supabase-js['"]/;
    for (const file of componentFiles) {
      const content = fs.readFileSync(file, "utf-8");
      const lines = content.split("\n");
      for (let i = 0; i < lines.length; i++) {
        if (pattern.test(lines[i])) {
          violations.push(
            `  ${relativeTo(file, REPO_ROOT)}:${i + 1}: ${lines[i].trim()}`
          );
        }
      }
    }

    if (violations.length > 0) {
      fail(
        "Components must not import directly from @supabase/supabase-js.\n" +
          "FIX: Use the shared client from web/lib/supabase.ts instead.\n" +
          "Data fetching should happen in server components (pages) or lib/ helpers.\n" +
          "Violations:\n" +
          violations.join("\n")
      );
    }
  });
});

// ===========================================================================
// Rule 2: Types must be defined in types.ts, not scattered
// ===========================================================================

describe("Type Definitions Location", () => {
  /**
   * WHY: Shared interfaces scattered across components create duplication
   * and inconsistency. All shared types belong in web/lib/types.ts.
   *
   * FIX: Move the interface/type to web/lib/types.ts and import from there.
   */
  test("components/ does not export shared interfaces", () => {
    const componentsDir = path.join(WEB_ROOT, "components");
    const componentFiles = [
      ...getFilesRecursive(componentsDir, ".tsx"),
      ...getFilesRecursive(componentsDir, ".ts"),
    ];
    const violations: string[] = [];

    // Match exported interfaces that look like shared types (Player*, Vorp*, etc.)
    const sharedTypePattern =
      /export\s+(?:interface|type)\s+(Player|Vorp|Surplus|Chart|Transaction|Season)/;
    for (const file of componentFiles) {
      const content = fs.readFileSync(file, "utf-8");
      const lines = content.split("\n");
      for (let i = 0; i < lines.length; i++) {
        if (sharedTypePattern.test(lines[i])) {
          violations.push(
            `  ${relativeTo(file, REPO_ROOT)}:${i + 1}: ${lines[i].trim()}`
          );
        }
      }
    }

    if (violations.length > 0) {
      fail(
        "Shared type definitions found in components/ instead of lib/types.ts.\n" +
          "FIX: Move these interfaces to web/lib/types.ts and import from there.\n" +
          "This keeps types centralized and prevents duplication.\n" +
          "Violations:\n" +
          violations.join("\n")
      );
    }
  });
});

// ===========================================================================
// Rule 3: Config values must come from config.ts
// ===========================================================================

describe("Config Centralization", () => {
  /**
   * WHY: League constants (NUM_TEAMS, CAP_PER_TEAM, etc.) must come from
   * the shared config.json via web/lib/config.ts. Hardcoding them in
   * components or pages causes silent divergence.
   *
   * FIX: Import from web/lib/config.ts instead of using literal values.
   */
  test("no hardcoded CAP_PER_TEAM (400) in page files", () => {
    const appDir = path.join(WEB_ROOT, "app");
    const pageFiles = getFilesRecursive(appDir, ".tsx");
    const violations: string[] = [];

    // Looking for literal 400 used in salary/cap context
    const pattern = /(?:cap|budget|salary).*\b400\b/i;
    for (const file of pageFiles) {
      const content = fs.readFileSync(file, "utf-8");
      const lines = content.split("\n");
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (line.startsWith("//") || line.startsWith("*")) continue;
        if (pattern.test(lines[i])) {
          violations.push(
            `  ${relativeTo(file, REPO_ROOT)}:${i + 1}: ${line}`
          );
        }
      }
    }

    if (violations.length > 0) {
      fail(
        "Hardcoded salary cap value (400) found in page files.\n" +
          "FIX: Import `CAP_PER_TEAM` from `@/lib/config` instead.\n" +
          "Violations:\n" +
          violations.join("\n")
      );
    }
  });
});

// ===========================================================================
// Rule 4: config.json sync validation
// ===========================================================================

describe("Config JSON Sync", () => {
  const configPath = path.join(REPO_ROOT, "config.json");
  const configTsPath = path.join(WEB_ROOT, "lib", "config.ts");

  /**
   * WHY: config.json is the single source of truth. TypeScript must consume
   * every key (except documented Python-only keys).
   *
   * FIX: Add `export const CONSTANT = config.KEY` to web/lib/config.ts.
   */
  test("config.ts references all config.json keys", () => {
    const configJson = JSON.parse(fs.readFileSync(configPath, "utf-8"));
    const configTs = fs.readFileSync(configTsPath, "utf-8");

    const jsonKeys = new Set(Object.keys(configJson));
    const tsKeyMatches = configTs.matchAll(/config\.(\w+)/g);
    const tsKeys = new Set([...tsKeyMatches].map((m) => m[1]));
    tsKeys.delete("json"); // from `import config from "../../config.json"`

    // Keys that are intentionally Python-only
    const pythonOnly = new Set(["COLLEGE_POSITIONS"]);

    const missing: string[] = [];
    for (const key of jsonKeys) {
      if (!pythonOnly.has(key) && !tsKeys.has(key)) {
        missing.push(key);
      }
    }

    if (missing.length > 0) {
      fail(
        `config.json keys not consumed in web/lib/config.ts: ${missing.join(", ")}\n` +
          "FIX: Add `export const CONSTANT = config.KEY` to web/lib/config.ts.\n" +
          "If the key is intentionally Python-only, add it to the pythonOnly set in this test."
      );
    }
  });

  test("config.ts does not reference nonexistent keys", () => {
    const configJson = JSON.parse(fs.readFileSync(configPath, "utf-8"));
    const configTs = fs.readFileSync(configTsPath, "utf-8");

    const jsonKeys = new Set(Object.keys(configJson));
    const tsKeyMatches = configTs.matchAll(/config\.(\w+)/g);
    const tsKeys = new Set([...tsKeyMatches].map((m) => m[1]));
    tsKeys.delete("json"); // from `import config from "../../config.json"`

    const extra: string[] = [];
    for (const key of tsKeys) {
      if (!jsonKeys.has(key)) {
        extra.push(key);
      }
    }

    if (extra.length > 0) {
      fail(
        `web/lib/config.ts references keys missing from config.json: ${extra.join(", ")}\n` +
          "FIX: Either add the key to config.json or remove the reference from config.ts."
      );
    }
  });
});

// ===========================================================================
// Rule 5: Documentation completeness
// ===========================================================================

describe("Documentation Exists", () => {
  /**
   * WHY: AGENTS.md acts as a table of contents pointing to deeper docs.
   * If those docs are missing or empty, agents lose critical context.
   *
   * FIX: Create or restore the missing file. See AGENTS.md for guidance.
   */
  const requiredDocs = [
    "AGENTS.md",
    "CLAUDE.md",
    "docs/ARCHITECTURE.md",
    "docs/CODE_ORGANIZATION.md",
    "docs/COMMANDS.md",
    "docs/FRONTEND.md",
    "docs/GIT_WORKFLOW.md",
    "docs/TESTING.md",
  ];

  test.each(requiredDocs)("%s exists and is not empty", (docPath) => {
    const fullPath = path.join(REPO_ROOT, docPath);
    expect(fs.existsSync(fullPath)).toBe(true);

    const content = fs.readFileSync(fullPath, "utf-8").trim();
    expect(content.length).toBeGreaterThan(10);
  });
});
