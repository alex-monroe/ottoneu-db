#!/usr/bin/env python3
"""Clean `supabase gen types` output for this repo (used by `db.sh gen-types`).

Reads the CLI's stdout, drops the status lines before the code, and removes
every member named `fp_*` (fantasy-pulse's tables and functions, which this
repo must not use). The input must already be prettier-formatted, so each
member starts on its own line at a fixed indent and its closing brace sits at
the same indent.

    strip_fp_types.py <formatted.ts>  > cleaned.ts
"""
import re
import sys

START = re.compile(r"^(\s+)\"?fp_[A-Za-z0-9_]*\"?\??:")


def strip(text: str) -> str:
    lines = text.splitlines(keepends=True)
    out, i = [], 0
    while i < len(lines):
        m = START.match(lines[i])
        if not m:
            out.append(lines[i])
            i += 1
            continue
        indent = m.group(1)
        body = lines[i].rstrip()
        i += 1
        if body.endswith("{") or body.endswith("["):
            closer = re.compile("^" + re.escape(indent) + r"[}\]]")
            while i < len(lines) and not closer.match(lines[i]):
                i += 1
            i += 1  # the closing line
    return "".join(out)


def main() -> None:
    text = open(sys.argv[1]).read()
    start = text.find("export type")
    if start < 0:
        sys.exit("no generated types in the input (did the CLI fail?)")
    cleaned = strip(text[start:])
    if re.search(r"\bfp_", cleaned):
        sys.exit("an fp_ name survived stripping; check the generator's formatting")
    sys.stdout.write(cleaned)


if __name__ == "__main__":
    main()
