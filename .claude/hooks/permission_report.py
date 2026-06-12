#!/usr/bin/env python3
"""Permission-friction report: prompts per 100 tool calls, trend, regressions.

Joins two data sources:
  numerator   ~/.claude/metrics/ottoneu_db/permission_prompts.jsonl
              (written by log_permission_prompt.py — one line per permission
              prompt Claude Code showed)
  denominator ~/.claude/projects/-Users-alexmonroe-dev-ottoneu-db/*.jsonl
              (Claude Code transcripts — every tool_use, prompted or not)

Usage:
  just permission-report                # last 56 days, markdown to stdout
  just permission-report --days 14
  just permission-report --check       # exit 2 if the trailing-7d prompt rate
                                       # regressed >1.5x vs the prior-28d baseline

Stdlib only; Python 3.9 compatible (macOS system python3).
"""
import argparse
import datetime
import glob
import json
import os
import re
import sys
from collections import Counter, defaultdict

EVENTS_FILE = os.path.expanduser("~/.claude/metrics/ottoneu_db/permission_prompts.jsonl")
TRANSCRIPTS_GLOB = os.path.expanduser(
    "~/.claude/projects/-Users-alexmonroe-dev-ottoneu-db/*.jsonl"
)
REGRESSION_FACTOR = 1.5
REGRESSION_MIN_PROMPTS = 10


def parse_ts(value):
    if not value:
        return None
    try:
        return datetime.datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None


def load_prompt_events(since):
    events = []
    if not os.path.exists(EVENTS_FILE):
        return events
    with open(EVENTS_FILE) as f:
        for line in f:
            try:
                ev = json.loads(line)
            except ValueError:
                continue
            ts = parse_ts(ev.get("ts"))
            if ts and ts >= since:
                ev["_ts"] = ts
                events.append(ev)
    return events


def load_tool_call_counts(since):
    """Per-day counts of all tool_use blocks (and Bash specifically) from transcripts."""
    per_day = defaultdict(lambda: {"tools": 0, "bash": 0})
    for path in glob.glob(TRANSCRIPTS_GLOB):
        try:
            if datetime.datetime.fromtimestamp(
                os.path.getmtime(path), tz=datetime.timezone.utc
            ) < since:
                continue
        except OSError:
            continue
        with open(path, errors="replace") as f:
            for line in f:
                if '"tool_use"' not in line:
                    continue
                try:
                    rec = json.loads(line)
                except ValueError:
                    continue
                ts = parse_ts(rec.get("timestamp"))
                if not ts or ts < since:
                    continue
                content = (rec.get("message") or {}).get("content")
                if not isinstance(content, list):
                    continue
                day = ts.date().isoformat()
                for block in content:
                    if isinstance(block, dict) and block.get("type") == "tool_use":
                        per_day[day]["tools"] += 1
                        if block.get("name") == "Bash":
                            per_day[day]["bash"] += 1
    return per_day


def command_family(ev):
    """Group a prompted Bash command by its first meaningful words."""
    tool = ev.get("tool_name")
    if tool and tool != "Bash":
        return tool
    cmd = ((ev.get("tool_input") or {}).get("command") or "").strip()
    if not cmd:
        return "Bash(unknown)"
    first = cmd.splitlines()[0]
    words = re.split(r"\s+", first)
    return " ".join(words[:2])[:60] or "Bash(unknown)"


def weekly_rollup(events, per_day):
    weeks = defaultdict(lambda: {"prompts": 0, "tools": 0, "bash": 0})
    for ev in events:
        weeks[ev["_ts"].date().isocalendar()[:2]]["prompts"] += 1
    for day, counts in per_day.items():
        key = datetime.date.fromisoformat(day).isocalendar()[:2]
        weeks[key]["tools"] += counts["tools"]
        weeks[key]["bash"] += counts["bash"]
    return weeks


def window_rate(events, per_day, start, end):
    prompts = sum(1 for ev in events if start <= ev["_ts"] < end)
    tools = sum(
        c["tools"]
        for d, c in per_day.items()
        if start.date().isoformat() <= d < end.date().isoformat()
    )
    rate = 100.0 * prompts / tools if tools else 0.0
    return prompts, tools, rate


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--days", type=int, default=56, help="lookback window (default 56)")
    ap.add_argument("--check", action="store_true", help="exit 2 on regression")
    args = ap.parse_args()

    now = datetime.datetime.now(datetime.timezone.utc)
    since = now - datetime.timedelta(days=args.days)
    events = load_prompt_events(since)
    per_day = load_tool_call_counts(since)

    print("# Permission-Prompt Friction Report")
    print()
    print(
        "Generated {} | window: last {} days | prompts logged: {}".format(
            now.date().isoformat(), args.days, len(events)
        )
    )
    print()
    if not events and not os.path.exists(EVENTS_FILE):
        print(
            "No prompt events recorded yet ({} missing).\n"
            "The Notification hook in .claude/settings.local.json writes it — "
            "events accumulate from the first session after that hook landed.".format(
                EVENTS_FILE
            )
        )
        print()

    print("## Weekly trend (prompts per 100 tool calls)")
    print()
    print("| ISO week | Prompts | Tool calls | Bash calls | Prompt rate |")
    print("|----------|--------:|-----------:|-----------:|------------:|")
    weeks = weekly_rollup(events, per_day)
    for key in sorted(weeks):
        row = weeks[key]
        rate = 100.0 * row["prompts"] / row["tools"] if row["tools"] else 0.0
        print(
            "| {}-W{:02d} | {} | {} | {} | {:.1f} |".format(
                key[0], key[1], row["prompts"], row["tools"], row["bash"], rate
            )
        )
    print()

    if events:
        print("## Top prompted command families (window)")
        print()
        print("| Family | Prompts |")
        print("|--------|--------:|")
        for fam, n in Counter(command_family(ev) for ev in events).most_common(20):
            print("| `{}` | {} |".format(fam.replace("|", "\\|"), n))
        print()
        print("Use these rows to pick the next allowlist entry or `just` recipe")
        print("(see docs/references/autonomous-operation.md).")
        print()

    # Regression check: trailing 7d vs the 28d before that.
    p7, t7, r7 = window_rate(events, per_day, now - datetime.timedelta(days=7), now)
    p28, t28, r28 = window_rate(
        events, per_day, now - datetime.timedelta(days=35), now - datetime.timedelta(days=7)
    )
    print("## Regression check")
    print()
    print(
        "- trailing 7d: {} prompts / {} tool calls = {:.1f} per 100".format(p7, t7, r7)
    )
    print(
        "- prior 28d baseline: {} prompts / {} tool calls = {:.1f} per 100".format(
            p28, t28, r28
        )
    )
    regressed = (
        p7 >= REGRESSION_MIN_PROMPTS and r28 > 0 and r7 > REGRESSION_FACTOR * r28
    )
    if regressed:
        print(
            "- **REGRESSION**: trailing rate is >{}x the baseline. Run "
            "/review-permission-gates and check recent settings/Justfile changes.".format(
                REGRESSION_FACTOR
            )
        )
    else:
        print("- OK: no regression detected.")
    if args.check and regressed:
        sys.exit(2)


if __name__ == "__main__":
    main()
