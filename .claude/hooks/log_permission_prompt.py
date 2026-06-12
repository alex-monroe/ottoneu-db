#!/usr/bin/env python3
"""Notification-hook logger: records every permission prompt Claude Code shows.

Registered under the "Notification" hook event in .claude/settings.local.json.
Claude Code fires a Notification whenever it needs the user's permission to run
a tool. Approved prompts leave no trace in transcripts (only denials do), so
this hook is the only durable record of approval friction.

Each event is appended as one JSON line to
~/.claude/metrics/ottoneu_db/permission_prompts.jsonl, enriched with the tool
name and input of the pending tool call (recovered from the transcript tail).

Aggregate with `just permission-report` (.claude/hooks/permission_report.py).

Stdlib only; must stay compatible with Python 3.9 (macOS system python3).
Never raises: a broken metrics hook must not block real work.
"""
import datetime
import json
import os
import sys

LOG_DIR = os.path.expanduser("~/.claude/metrics/ottoneu_db")
LOG_FILE = os.path.join(LOG_DIR, "permission_prompts.jsonl")


def last_pending_tool_use(transcript_path):
    """Return (tool_name, tool_input) of the most recent tool_use in the transcript.

    When a permission prompt fires, the pending call is the last assistant
    tool_use block written to the transcript, so the tail is enough.
    """
    try:
        with open(transcript_path, "rb") as f:
            f.seek(0, os.SEEK_END)
            f.seek(max(0, f.tell() - 256 * 1024))
            tail = f.read().decode("utf-8", errors="replace").splitlines()
    except OSError:
        return None, None
    for line in reversed(tail):
        try:
            rec = json.loads(line)
        except ValueError:
            continue
        content = (rec.get("message") or {}).get("content")
        if not isinstance(content, list):
            continue
        for block in reversed(content):
            if isinstance(block, dict) and block.get("type") == "tool_use":
                return block.get("name"), block.get("input")
    return None, None


def main():
    try:
        payload = json.load(sys.stdin)
    except ValueError:
        return
    message = payload.get("message") or ""
    # Notification also fires for idle reminders etc. — keep permission prompts only.
    if "permission" not in message.lower():
        return

    tool_name, tool_input = last_pending_tool_use(payload.get("transcript_path") or "")
    event = {
        "ts": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "session_id": payload.get("session_id"),
        "cwd": payload.get("cwd"),
        "message": message,
        "tool_name": tool_name,
        "tool_input": tool_input,
    }
    os.makedirs(LOG_DIR, exist_ok=True)
    with open(LOG_FILE, "a") as f:
        f.write(json.dumps(event) + "\n")


if __name__ == "__main__":
    try:
        main()
    except Exception:
        pass
