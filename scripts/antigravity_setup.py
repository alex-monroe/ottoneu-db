"""Sync this repo's agent permission policy into Google Antigravity's local config.

Antigravity reads skills, hooks and AGENTS.md from the repo (`.agents/`), but its
permission rules and MCP servers live only in machine-local files under
`~/.gemini/`. This script derives those rules from `.claude/settings.json` — the
one checked-in policy — so the two agents stay in step:

- `~/.gemini/antigravity-cli/settings.json`: sandbox on, `proceed-in-sandbox`,
  and the allow / ask / deny rules (the `agy` CLI).
- `~/.gemini/config/projects/<id>.json`: the same rules as project-scoped
  grants (the Antigravity app), replacing blanket `mcp(<server>/*)` grants.
- `~/.gemini/config/mcp_config.json`: the Supabase server pinned to this
  project (`--project-ref`) with its token in `env` instead of on the command
  line, where `ps` and `agy mcp list` would show it.

Dry-run by default; `--apply` writes, keeping a timestamped `.bak` of each file
it changes. Token values are never printed. Quit the Antigravity app before
applying — it rewrites its project file on exit.

Usage: just antigravity-setup [--apply]
Docs:  docs/references/autonomous-operation.md#google-antigravity
"""
import argparse
import copy
import json
import re
import shutil
import subprocess
import sys
import time
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
GEMINI_HOME = Path.home() / ".gemini"
CLI_SETTINGS = GEMINI_HOME / "antigravity-cli" / "settings.json"
PROJECTS_DIR = GEMINI_HOME / "config" / "projects"
MCP_CONFIG = GEMINI_HOME / "config" / "mcp_config.json"

LISTS = ("allow", "ask", "deny")
# Commands that need the network or the real `.env`, which Antigravity's sandbox
# withholds. `unsandboxed(...)` lets them out without a prompt on the CLI; the
# matching `command(...)` rule does the same in the app. Each is already trusted
# unsandboxed in .claude/settings.json (allow rule + excludedCommands).
UNSANDBOXED = ("just", "git push", "git fetch", "git pull")
# Prefix rules match word by word from the start, so `git push origin x --force`
# needs a pattern to be caught wherever the flag sits.
FORCE_PUSH = r"regex:git push\b.*\s(--force|-f)(\s.*)?"
# Grants this script replaces: every tool on a server, writes included.
BLANKET_MCP = re.compile(r"^mcp\([^/()]+/\*\)$|^mcp\(\*\)$")

BASH_RULE = re.compile(r"^Bash\((.+?)(?: \*)?\)$")
MCP_RULE = re.compile(r"^mcp__(.+?)__(.+)$")
DOMAIN_RULE = re.compile(r"^WebFetch\(domain:(.+)\)$")


def main_checkout() -> Path:
    """The main checkout, even when this runs from a linked worktree."""
    try:
        common = subprocess.run(
            ["git", "-C", str(REPO_ROOT), "rev-parse", "--path-format=absolute", "--git-common-dir"],
            capture_output=True, text=True, timeout=5, check=True,
        ).stdout.strip()
        return Path(common).parent
    except (OSError, subprocess.SubprocessError):
        return REPO_ROOT


def _both(prefix: str) -> list[str]:
    return [f"command({prefix})", f"unsandboxed({prefix})"]


def build_rules(claude: dict, main_root: Path, home: Path) -> dict[str, list[str]]:
    """Translate .claude/settings.json into Antigravity allow / ask / deny rules."""
    permissions = claude.get("permissions", {})
    sandbox = claude.get("sandbox", {})
    rules: dict[str, list[str]] = {name: [] for name in LISTS}

    # Network: `read_url` domains are also the sandbox's outbound allowlist, and
    # a rule covers subdomains, so `*.example.com` becomes `example.com`.
    domains = [d.removeprefix("*.") for d in sandbox.get("network", {}).get("allowedDomains", [])]
    domains += [m.group(1) for r in permissions.get("allow", []) if (m := DOMAIN_RULE.match(r))]
    rules["allow"] += [f"read_url({d})" for d in dict.fromkeys(domains)]

    # Filesystem: the package caches, plus what a worktree outside the main
    # checkout needs from it — the shared .git to commit, the venv to run.
    for path in sandbox.get("filesystem", {}).get("allowWrite", []):
        rules["allow"].append(f"write_file({path.replace('~', str(home), 1)})")
    rules["allow"] += [f"write_file({main_root / '.git'})", f"read_file({main_root})"]
    rules["deny"].append(f"write_file({main_root / '.git' / 'hooks'})")

    for prefix in UNSANDBOXED:
        rules["allow"] += _both(prefix)

    for name in LISTS:
        for rule in permissions.get(name, []):
            if bash := BASH_RULE.match(rule):
                prefix = bash.group(1)
                if "push --force" in prefix or "push -f" in prefix:
                    prefix = FORCE_PUSH
                # Sandboxed commands already run unprompted; only `gh` (which
                # needs the network and the keychain) has to be let out.
                if name != "allow" or prefix.startswith("gh "):
                    rules[name] += _both(prefix)
            elif mcp := MCP_RULE.match(rule):
                rules[name].append(f"mcp({mcp.group(1)}/{mcp.group(2)})")

    return {name: list(dict.fromkeys(items)) for name, items in rules.items()}


def merge_rules(existing: dict, wanted: dict[str, list[str]]) -> dict[str, list[str]]:
    """Add the wanted rules to an existing grant set, dropping blanket MCP grants.

    Rules the user added by hand ("always allow" clicks) are kept, except an
    allow that the policy now lists under ask or deny.
    """
    stricter = set(wanted["ask"]) | set(wanted["deny"])
    merged = {}
    for name in LISTS:
        kept = [r for r in existing.get(name) or [] if not BLANKET_MCP.match(r)]
        if name == "allow":
            kept = [r for r in kept if r not in stricter]
        merged[name] = list(dict.fromkeys(kept + wanted[name]))
    return merged


def pin_supabase(config: dict, project_ref: str) -> dict:
    """Scope the Supabase MCP server to one project and move its token into env."""
    config = copy.deepcopy(config)
    server = config.get("mcpServers", {}).get("supabase")
    if not server:
        return config
    args = list(server.get("args") or [])
    if "--access-token" in args[:-1]:
        index = args.index("--access-token")
        server.setdefault("env", {})["SUPABASE_ACCESS_TOKEN"] = args[index + 1]
        del args[index:index + 2]
    if not any(a.startswith("--project-ref") for a in args):
        args.append(f"--project-ref={project_ref}")
    server["args"] = args
    return config


def supabase_project_ref() -> str:
    example = json.loads((REPO_ROOT / ".mcp.json.example").read_text())
    for arg in example["mcpServers"]["supabase"]["args"]:
        if arg.startswith("--project-ref="):
            return arg.split("=", 1)[1]
    raise SystemExit(".mcp.json.example no longer pins --project-ref; cannot scope the Supabase MCP server.")


def find_project_file(main_root: Path) -> Path | None:
    """The Antigravity app's project file for this repo, if the app has opened it."""
    uri = main_root.as_uri()
    for path in sorted(PROJECTS_DIR.glob("*.json")):
        try:
            resources = json.loads(path.read_text()).get("projectResources", {}).get("resources", [])
        except (OSError, ValueError):
            continue
        if any(r.get("gitFolder", {}).get("folderUri", "").rstrip("/") == uri for r in resources):
            return path
    return None


def _describe(label: str, before: dict, after: dict) -> list[str]:
    lines = []
    for name in LISTS:
        old, new = before.get(name) or [], after.get(name) or []
        lines += [f"  + {name}: {r}" for r in new if r not in old]
        lines += [f"  - {name}: {r}" for r in old if r not in new]
    return [f"{label}: {'no rule changes' if not lines else f'{len(lines)} rule change(s)'}"] + lines


def _write(path: Path, data: dict) -> None:
    shutil.copy2(path, path.with_name(f"{path.name}.{time.strftime('%Y%m%d-%H%M%S')}.bak"))
    path.write_text(json.dumps(data, indent=2) + "\n")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--apply", action="store_true", help="write the changes (default: dry run)")
    args = parser.parse_args()

    main_root = main_checkout()
    wanted = build_rules(json.loads((REPO_ROOT / ".claude" / "settings.json").read_text()), main_root, Path.home())
    changes: list[tuple[Path, dict]] = []

    if CLI_SETTINGS.exists():
        before = json.loads(CLI_SETTINGS.read_text())
        after = {**before, "enableTerminalSandbox": True, "toolPermission": "proceed-in-sandbox",
                 "permissions": merge_rules(before.get("permissions") or {}, wanted)}
        print("\n".join(_describe(f"agy CLI ({CLI_SETTINGS})", before.get("permissions") or {}, after["permissions"])))
        for key in ("enableTerminalSandbox", "toolPermission"):
            if before.get(key) != after[key]:
                print(f"  ~ {key}: {before.get(key)!r} -> {after[key]!r}")
        if after != before:
            changes.append((CLI_SETTINGS, after))
    else:
        print(f"agy CLI: {CLI_SETTINGS} not found — run `agy` once, then re-run this.")

    project_file = find_project_file(main_root)
    if project_file:
        before = json.loads(project_file.read_text())
        after = copy.deepcopy(before)
        grants = after.setdefault("permissionGrants", {}).setdefault("permissionGrants", {})
        # The app's own grants use `command(...)` to let a command out of the sandbox.
        app_rules = {n: [r for r in rs if not r.startswith("unsandboxed(")] for n, rs in wanted.items()}
        old = copy.deepcopy(grants)
        grants.update({k: v for k, v in merge_rules(grants, app_rules).items() if v or k in grants})
        print("\n".join(_describe(f"Antigravity app project ({project_file.name})", old, grants)))
        if after != before:
            changes.append((project_file, after))
    else:
        print(f"Antigravity app: no project for {main_root} — open the folder in the app once, then re-run this.")

    if MCP_CONFIG.exists():
        before = json.loads(MCP_CONFIG.read_text())
        after = pin_supabase(before, supabase_project_ref())
        if after != before:
            print(f"MCP ({MCP_CONFIG}): pin the supabase server to this project and move its token from args to env")
            changes.append((MCP_CONFIG, after))
        elif "supabase" in before.get("mcpServers", {}):
            print("MCP: supabase server already pinned")
        else:
            print(f"MCP: no supabase server in {MCP_CONFIG} — add one from .mcp.json.example")
    else:
        print(f"MCP: {MCP_CONFIG} not found — add the supabase server from .mcp.json.example")

    if not changes:
        print("\nAntigravity is already in sync with .claude/settings.json.")
    elif args.apply:
        for path, data in changes:
            _write(path, data)
        print(f"\nWrote {len(changes)} file(s); the previous versions are alongside as *.bak.")
    else:
        print(f"\nDry run: {len(changes)} file(s) would change. Re-run with --apply (quit the Antigravity app first).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
